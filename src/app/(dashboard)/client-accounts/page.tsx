import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { revalidatePath } from 'next/cache'
import { Users, Plus, Building2, Trash2, Eye } from 'lucide-react'
import bcrypt from 'bcryptjs'

export const metadata = { title: 'Client Accounts | Civil Tracker' }
export const dynamic = 'force-dynamic'

async function createClientUser(formData: FormData) {
  'use server'
  const session = await auth()
  if (!session?.user?.companyId) throw new Error('Unauthorized')
  const { companyId } = session.user

  const name = formData.get('name') as string
  const email = formData.get('email') as string
  const phone = (formData.get('phone') as string) || undefined
  const password = formData.get('password') as string

  if (!name || !email || !password) throw new Error('Missing required fields')

  const company = await prisma.company.findUnique({
    where: { id: companyId },
    include: { _count: { select: { members: { where: { isActive: true } } } } },
  })
  if (!company) throw new Error('Company not found')
  if (company._count.members >= company.userLimit) throw new Error('User limit reached. Please upgrade your plan.')

  const existing = await prisma.user.findUnique({ where: { email } })
  if (existing) throw new Error('Email already in use')

  const passwordHash = await bcrypt.hash(password, 12)

  await prisma.$transaction(async (tx) => {
    const user = await tx.user.create({
      data: { name, email, phone, passwordHash, role: 'CLIENT' },
    })
    await tx.companyMember.create({
      data: { userId: user.id, companyId, role: 'CLIENT', isActive: true },
    })
  })

  revalidatePath('/client-accounts')
  redirect('/client-accounts')
}

async function removeClientAccount(formData: FormData) {
  'use server'
  const session = await auth()
  if (!session?.user?.companyId) return
  const memberId = formData.get('memberId') as string
  await prisma.companyMember.update({
    where: { id: memberId, companyId: session.user.companyId },
    data: { isActive: false },
  })
  revalidatePath('/client-accounts')
}

export default async function ClientAccountsPage() {
  const session = await auth()
  if (!session?.user?.companyId) redirect('/login')
  const { companyId } = session.user

  const members = await prisma.companyMember.findMany({
    where: { companyId, role: 'CLIENT' },
    include: {
      user: { select: { id: true, name: true, email: true, phone: true, lastLoginAt: true } },
    },
    orderBy: { joinedAt: 'desc' },
  })

  function getInitials(name: string) {
    return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)
  }

  const active = members.filter(m => m.isActive).length

  return (
    <div className="flex flex-col gap-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight text-slate-900 dark:text-slate-100">Client Login Accounts</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            {active} active · Clients can view their project progress after logging in
          </p>
        </div>
      </div>

      {/* Two-panel layout */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
        {/* Create Client Form */}
        <div className="lg:col-span-2">
          <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
            <div className="flex items-center gap-2 px-5 py-4 border-b border-slate-100 bg-[#fff7ed]">
              <Plus size={16} className="text-[#fc6e20]" />
              <h2 className="text-sm font-extrabold text-slate-800">Create Client Account</h2>
            </div>
            <form action={createClientUser} className="p-5 space-y-4">
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-1.5">Client Name *</label>
                <input
                  name="name" required placeholder="e.g. Sharma Builders"
                  className="w-full border border-slate-300 rounded-xl px-3 py-2.5 text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-[#fc6e20]/40 focus:border-[#fc6e20] transition-all"
                />
              </div>
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-1.5">Email Address *</label>
                <input
                  name="email" type="email" required placeholder="client@example.com"
                  className="w-full border border-slate-300 rounded-xl px-3 py-2.5 text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-[#fc6e20]/40 focus:border-[#fc6e20] transition-all"
                />
              </div>
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-1.5">Phone</label>
                <input
                  name="phone" type="tel" placeholder="9876543210"
                  className="w-full border border-slate-300 rounded-xl px-3 py-2.5 text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-[#fc6e20]/40 focus:border-[#fc6e20] transition-all"
                />
              </div>
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-1.5">Login Password *</label>
                <input
                  name="password" type="text" required minLength={6} placeholder="Set a password to share with client"
                  className="w-full border border-slate-300 rounded-xl px-3 py-2.5 text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-[#fc6e20]/40 focus:border-[#fc6e20] transition-all font-mono"
                />
                <p className="mt-1 text-xs text-slate-400">Shown in plain text — copy and share it with the client.</p>
              </div>
              <button
                type="submit"
                className="w-full py-2.5 bg-[#fc6e20] hover:bg-[#e85b0d] text-white text-sm font-bold rounded-xl shadow-sm transition-colors cursor-pointer"
              >
                Create Client Account
              </button>
            </form>
          </div>
        </div>

        {/* Client List */}
        <div className="lg:col-span-3">
          <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
            <div className="flex items-center gap-2 px-5 py-4 border-b border-slate-100">
              <Building2 size={16} className="text-slate-400" />
              <h2 className="text-base font-bold text-slate-900">All Client Accounts ({members.length})</h2>
            </div>
            {members.length === 0 ? (
              <div className="p-10 text-center text-sm text-slate-400">
                No client accounts yet. Create one using the form on the left.
              </div>
            ) : (
              <div className="divide-y divide-slate-100 dark:divide-slate-800">
                {members.map(m => (
                  <div key={m.id} className="flex items-center justify-between px-5 py-4 hover:bg-slate-50/50 transition-colors gap-3">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-amber-400 to-orange-500 text-white flex items-center justify-center text-xs font-extrabold flex-shrink-0">
                        {getInitials(m.user.name)}
                      </div>
                      <div className="min-w-0">
                        <div className="font-bold text-sm text-slate-900 truncate">{m.user.name}</div>
                        <div className="text-xs text-slate-400 truncate">{m.user.email}</div>
                        {m.user.phone && <div className="text-xs text-slate-400">{m.user.phone}</div>}
                        <div className="text-xs text-slate-400 mt-0.5">
                          {m.user.lastLoginAt
                            ? `Last login: ${new Date(m.user.lastLoginAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}`
                            : 'Never logged in'}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold border ${
                        m.isActive ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-rose-50 text-rose-700 border-rose-200'
                      }`}>
                        <span className="w-1.5 h-1.5 rounded-full bg-current" />
                        {m.isActive ? 'Active' : 'Inactive'}
                      </span>
                      <Link
                        href={`/settings/users/${m.id}`}
                        className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-bold text-[#fc6e20] bg-[#fff7ed] hover:bg-[#fde8d1] border border-[#fcdcbf] rounded-lg transition-colors"
                        title="View or change password"
                      >
                        <Eye size={11} /> Password
                      </Link>
                      <form action={removeClientAccount}>
                        <input type="hidden" name="memberId" value={m.id} />
                        <button
                          type="submit"
                          className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-bold text-rose-600 bg-rose-50 hover:bg-rose-100 border border-rose-200 rounded-lg transition-colors cursor-pointer"
                          onClick={(e) => { if (!confirm(`Remove ${m.user.name}'s login access?`)) e.preventDefault() }}
                        >
                          <Trash2 size={11} /> Remove
                        </button>
                      </form>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <Link href="/clients" className="text-sm text-[#fc6e20] hover:underline font-semibold">
          → View Billing Clients (invoices &amp; payments)
        </Link>
        <Link href="/employees" className="text-sm text-slate-500 hover:underline font-semibold">
          → Manage Employees
        </Link>
      </div>
    </div>
  )
}
