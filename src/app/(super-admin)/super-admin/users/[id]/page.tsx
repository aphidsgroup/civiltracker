import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { redirect, notFound } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, User, Building2, Clock } from 'lucide-react'
import { deleteUser } from '@/actions/super-admin'
import SetPasswordPanel from '@/components/super-admin/SetPasswordPanel'

export default async function SAUserDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (session?.user?.role !== 'SUPER_ADMIN') redirect('/dashboard')

  const { id: userId } = await params

  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: {
      companyMembers: {
        include: { company: { select: { id: true, name: true, status: true } } },
        take: 1,
      },
    },
  })
  if (!user) return notFound()

  const member = user.companyMembers[0]

  async function handleDelete() {
    'use server'
    await deleteUser(userId)
  }

  const roleColors: Record<string, string> = {
    COMPANY_ADMIN: 'bg-purple-100 text-purple-700',
    SITE_ENGINEER: 'bg-blue-100 text-blue-700',
    PROJECT_MANAGER: 'bg-indigo-100 text-indigo-700',
    SUPERVISOR: 'bg-teal-100 text-teal-700',
    ACCOUNTANT: 'bg-sky-100 text-sky-700',
    PURCHASE_MANAGER: 'bg-cyan-100 text-cyan-700',
    CLIENT: 'bg-amber-100 text-amber-700',
    SUPER_ADMIN: 'bg-rose-100 text-rose-700',
  }

  return (
    <div className="min-h-screen bg-slate-50/50">
      {/* Header */}
      <div className="flex items-center justify-between gap-4 px-8 py-5 bg-white border-b border-slate-200">
        <div className="flex items-center gap-4">
          <Link
            href="/super-admin/users"
            className="w-9 h-9 rounded-xl bg-slate-100 flex items-center justify-center hover:bg-slate-200 transition-colors"
          >
            <ArrowLeft size={16} className="text-slate-600" />
          </Link>
          <div>
            <h1 className="text-lg font-extrabold text-slate-800 tracking-tight">Manage User</h1>
            <p className="text-xs text-slate-500 font-medium mt-0.5">Super Admin — Set Password & View Details</p>
          </div>
        </div>
        {/* Delete User */}
        <form action={handleDelete}
          onSubmit={(e) => {
            if (!confirm(`Permanently delete user "${user.name || user.email}"? This cannot be undone.`)) e.preventDefault()
          }}>
          <button type="submit"
            className="px-4 py-2 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 text-sm font-semibold rounded-lg transition-colors cursor-pointer">
            🗑 Delete User
          </button>
        </form>
      </div>

      <div className="p-8 max-w-2xl mx-auto space-y-5">
        {/* User Profile Card */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-[#fc6e20] to-[#e85b0d] flex items-center justify-center text-white font-extrabold text-xl flex-shrink-0">
              {(user.name ?? user.email).substring(0, 2).toUpperCase()}
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-[17px] font-extrabold text-slate-900 leading-none">{user.name ?? '—'}</div>
              <div className="text-sm text-slate-500 font-medium mt-1">{user.email}</div>
              {user.phone && <div className="text-xs text-slate-400 font-medium mt-0.5">{user.phone}</div>}
            </div>
            <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold border ${
              user.isActive ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-rose-50 text-rose-700 border-rose-200'
            }`}>
              <span className="w-1.5 h-1.5 rounded-full bg-current" />
              {user.isActive ? 'Active' : 'Inactive'}
            </span>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mt-5 pt-5 border-t border-slate-100">
            <div className="flex items-center gap-2.5 p-3 bg-slate-50 rounded-xl">
              <User size={14} className="text-[#fc6e20] flex-shrink-0" />
              <div>
                <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Role</div>
                <div className={`text-xs font-bold mt-0.5 px-1.5 py-0.5 rounded inline-block ${roleColors[user.role] ?? 'bg-slate-100 text-slate-700'}`}>
                  {user.role.replace(/_/g, ' ')}
                </div>
              </div>
            </div>
            {member && (
              <div className="flex items-center gap-2.5 p-3 bg-slate-50 rounded-xl">
                <Building2 size={14} className="text-[#fc6e20] flex-shrink-0" />
                <div>
                  <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Company</div>
                  <div className="text-sm font-bold text-slate-800 mt-0.5 truncate">{member.company.name}</div>
                </div>
              </div>
            )}
            <div className="flex items-center gap-2.5 p-3 bg-slate-50 rounded-xl">
              <Clock size={14} className="text-[#fc6e20] flex-shrink-0" />
              <div>
                <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Last Login</div>
                <div className="text-xs font-bold text-slate-800 mt-0.5">
                  {user.lastLoginAt
                    ? new Date(user.lastLoginAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
                    : 'Never'}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Set Password Panel — shows password once for copying */}
        <SetPasswordPanel userId={user.id} userName={user.name ?? user.email} />
      </div>
    </div>
  )
}
