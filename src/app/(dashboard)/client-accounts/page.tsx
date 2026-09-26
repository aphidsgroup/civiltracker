import { requirePermission } from '@/lib/auth/require-permission'
import { exitDeniedPage, resolveTenantPageAccess } from '@/lib/pages/tenant-page-access'
import { prisma } from '@/lib/prisma'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { revalidatePath } from 'next/cache'
import { Plus, Building2, Eye } from 'lucide-react'
import bcrypt from 'bcryptjs'
import DangerConfirmSubmit from '@/components/ui/DangerConfirmSubmit'

export const metadata = { title: 'Client Accounts | Civil Tracker' }
export const dynamic = 'force-dynamic'

async function requireClientManager() {
  const actor = await requirePermission('company.manage')
  if (!actor.companyId) throw new Error('Company context required')
  return { ...actor, companyId: actor.companyId }
}

async function requireActiveCompanySites(companyId: string, siteIds: string[]) {
  const uniqueSiteIds = [...new Set(siteIds.filter(Boolean))]
  if (uniqueSiteIds.length === 0) {
    throw new Error('Select at least one active site for client portal access.')
  }
  const sites = await prisma.site.findMany({
    where: { id: { in: uniqueSiteIds }, companyId, deletedAt: null, status: 'ACTIVE' },
    select: { id: true },
  })
  if (sites.length !== uniqueSiteIds.length) {
    throw new Error('One or more selected sites are unavailable in your company.')
  }
  return uniqueSiteIds
}

export async function createClientUser(formData: FormData) {
  'use server'
  const actor = await requirePermission('company.manage')
  const companyId = actor.companyId
  if (!companyId) throw new Error('Company context required')

  const name = formData.get('name') as string
  const email = formData.get('email') as string
  const phone = (formData.get('phone') as string) || undefined
  const password = formData.get('password') as string
  const siteIds = formData.getAll('siteIds') as string[]

  if (!name || !email || !password) redirect('/client-accounts?error=Missing+required+fields')
  const assignedSiteIds = await requireActiveCompanySites(companyId, siteIds)

  const company = await prisma.company.findUnique({
    where: { id: companyId },
    include: { _count: { select: { members: { where: { isActive: true } } } } },
  })
  if (!company) redirect('/client-accounts?error=Company+not+found')
  if (company._count.members >= company.userLimit) redirect('/client-accounts?error=User+limit+reached.+Please+upgrade+your+plan.')

  const existing = await prisma.user.findUnique({ where: { email } })
  if (existing) redirect('/client-accounts?error=Email+already+in+use')

  const passwordHash = await bcrypt.hash(password, 12)

  await prisma.$transaction(async (tx) => {
    const user = await tx.user.create({
      data: { name, email, phone, passwordHash, role: 'CLIENT' },
    })
    await tx.companyMember.create({
      data: { userId: user.id, companyId, role: 'CLIENT', siteIds: assignedSiteIds, isActive: true },
    })
    const assigned = await tx.site.updateMany({
      where: {
        id: { in: assignedSiteIds }, companyId, deletedAt: null, status: 'ACTIVE',
        OR: [{ clientUserId: null }, { clientUserId: user.id }],
      },
      data: { clientUserId: user.id },
    })
    if (assigned.count !== assignedSiteIds.length) {
      throw new Error('One or more selected sites changed before client access could be assigned.')
    }
    // Written with the transaction client so a failed audit rolls the login, membership
    // and site assignment back instead of leaving unlogged client access behind.
    await tx.auditLog.create({
      data: {
        companyId,
        userId: actor.id,
        action: 'CREATE',
        module: 'USER',
        recordId: user.id,
        after: {
          name,
          email,
          role: 'CLIENT',
          siteIds: assignedSiteIds,
          _description: `${actor.name ?? actor.email} created client login "${name}"`,
        },
      },
    })
  })

  revalidatePath('/client-accounts')
  redirect('/client-accounts')
}

export async function removeClientAccount(formData: FormData) {
  'use server'
  const actor = await requireClientManager()
  const companyId = actor.companyId
  const memberId = formData.get('memberId') as string
  const typed = (formData.get('dangerConfirmText') as string | null)?.trim()

  const member = await prisma.companyMember.findUnique({
    where: { id: memberId, companyId },
    include: { user: { select: { id: true, name: true, email: true } } },
  })
  if (!member) throw new Error('Client account not found.')

  const expected = (member.user.name ?? member.user.email).trim()
  if (typed !== expected) {
    throw new Error('Remove confirmation text did not match the client name/email.')
  }

  await prisma.$transaction(async tx => {
    await tx.companyMember.update({
      where: { id: member.id, companyId },
      data: { isActive: false },
    })
    await tx.auditLog.create({
      data: {
        companyId,
        userId: actor.id,
        action: 'UPDATE',
        module: 'USER',
        recordId: member.userId,
        before: { isActive: member.isActive, role: member.role, name: member.user.name, email: member.user.email },
        after: {
          isActive: false,
          role: member.role,
          name: member.user.name,
          email: member.user.email,
          _description: `${actor.name ?? actor.email} deactivated client login "${member.user.name ?? member.user.email}"`,
        },
      },
    })
  })

  revalidatePath('/client-accounts')
}

export async function assignClientSites(formData: FormData) {
  'use server'
  const actor = await requireClientManager()
  const companyId = actor.companyId
  const memberId = String(formData.get('memberId') ?? '')
  const siteIds = await requireActiveCompanySites(companyId, formData.getAll('siteIds').map(String))
  const member = await prisma.companyMember.findUnique({
    where: { id: memberId },
    include: { user: { select: { id: true, name: true, email: true } } },
  })
  if (!member || member.companyId !== companyId || member.role !== 'CLIENT' || !member.isActive) {
    throw new Error('Active client account not found in your company.')
  }

  await prisma.$transaction(async tx => {
    await tx.site.updateMany({ where: { companyId, clientUserId: member.userId }, data: { clientUserId: null } })
    const assigned = await tx.site.updateMany({
      where: {
        id: { in: siteIds }, companyId, deletedAt: null, status: 'ACTIVE',
        OR: [{ clientUserId: null }, { clientUserId: member.userId }],
      },
      data: { clientUserId: member.userId },
    })
    if (assigned.count !== siteIds.length) {
      throw new Error('One or more selected sites changed before client access could be assigned.')
    }
    await tx.companyMember.update({ where: { id: member.id, companyId }, data: { siteIds } })
    await tx.auditLog.create({
      data: {
        companyId, userId: actor.id, action: 'UPDATE', module: 'USER', recordId: member.userId,
        before: { siteIds: member.siteIds }, after: { siteIds, _description: `${actor.name ?? actor.email} updated client site access for "${member.user.name ?? member.user.email}"` },
      },
    })
  })
  revalidatePath('/client-accounts')
}

export default async function ClientAccountsPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  // The list carries every client login's contact details, so it opens only under the
  // same company.manage grant as the actions on it, decided on the live principal.
  const gate = await resolveTenantPageAccess({ grants: [{ permission: 'company.manage' }] })
  if (gate.status === 'denied') exitDeniedPage(gate, '/client-accounts')
  const { companyId } = gate.access

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
  const sites = await prisma.site.findMany({
    where: { companyId, deletedAt: null, status: 'ACTIVE' },
    select: { id: true, name: true },
    orderBy: { name: 'asc' },
  })
  
  const resolvedParams = await searchParams
  const error = resolvedParams.error

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
              {error && (
                <div className="bg-red-50 text-red-600 px-3 py-2 rounded-lg border border-red-100 text-sm font-semibold">
                  {error}
                </div>
              )}
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
                  name="password" type="password" required minLength={6} placeholder="Set a password for the client"
                  className="w-full border border-slate-300 rounded-xl px-3 py-2.5 text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-[#fc6e20]/40 focus:border-[#fc6e20] transition-all font-mono"
                />
                <p className="mt-1 text-xs text-slate-400">After creation, share the password with the client through a secure channel.</p>
              </div>
              
              {sites.length > 0 && (
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-1.5">Site Access *</label>
                  <div className="text-xs text-slate-400 mb-2 border-l-2 border-[#fc6e20] pl-2">
                    Select at least one project this client can view. Client access is limited to these explicitly assigned sites.
                  </div>
                  <div className="space-y-2 max-h-40 overflow-y-auto border border-slate-200 rounded-xl p-3 bg-slate-50">
                    {sites.map(site => (
                      <label key={site.id} className="flex items-center gap-3 p-2 hover:bg-slate-100 rounded-lg cursor-pointer">
                        <input
                          type="checkbox"
                          name="siteIds"
                          value={site.id}
                          className="w-4 h-4 text-[#fc6e20] border-slate-300 rounded focus:ring-[#fc6e20]"
                        />
                        <span className="text-sm font-medium text-slate-800">{site.name}</span>
                      </label>
                    ))}
                  </div>
                </div>
              )}

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
                      <details className="relative">
                        <summary className="cursor-pointer list-none inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-bold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg">Sites</summary>
                        <form action={assignClientSites} className="absolute right-0 z-10 mt-2 w-64 rounded-xl border border-slate-200 bg-white p-3 shadow-xl space-y-2">
                          <input type="hidden" name="memberId" value={m.id} />
                          <p className="text-xs font-semibold text-slate-700">Client portal sites</p>
                          {sites.map(site => (
                            <label key={site.id} className="flex items-center gap-2 text-xs text-slate-700">
                              <input type="checkbox" name="siteIds" value={site.id} defaultChecked={m.siteIds.includes(site.id)} />
                              {site.name}
                            </label>
                          ))}
                          <button type="submit" className="w-full rounded-lg bg-[#fc6e20] px-2 py-1.5 text-xs font-bold text-white">Save site access</button>
                        </form>
                      </details>
                      <Link
                        href={`/settings/users/${m.id}`}
                        className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-bold text-[#fc6e20] bg-[#fff7ed] hover:bg-[#fde8d1] border border-[#fcdcbf] rounded-lg transition-colors"
                        title="View or change password"
                      >
                        <Eye size={11} /> Password
                      </Link>
                      <form action={removeClientAccount}>
                        <input type="hidden" name="memberId" value={m.id} />
                        <DangerConfirmSubmit
                          entityLabel={m.user.name ?? m.user.email}
                          confirmText={m.user.name ?? m.user.email}
                          buttonText="Deactivate Client"
                          helperText="Type the exact client name or email to remove login access while keeping all project data."
                        />
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
