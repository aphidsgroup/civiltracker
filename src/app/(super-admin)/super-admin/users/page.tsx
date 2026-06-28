import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { Users, UserCheck, UserX, Search } from 'lucide-react'

export default async function SAUsersPage() {
  const session = await auth()
  if (session?.user?.role !== 'SUPER_ADMIN') redirect('/dashboard')

  const members = await prisma.companyMember.findMany({
    include: {
      user: { select: { id: true, name: true, email: true, phone: true, isActive: true } },
      company: { select: { name: true } },
    },
    orderBy: { joinedAt: 'desc' },
    take: 500,
  })

  const active = members.filter(m => m.isActive).length
  const inactive = members.length - active

  function getInitials(name: string) {
    return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)
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
      <div className="flex items-center justify-between px-8 py-5 bg-white border-b border-slate-200">
        <div>
          <h1 className="text-lg font-extrabold text-slate-800 tracking-tight flex items-center gap-2">
            <Users size={20} className="text-[#fc6e20]" />
            All Users
          </h1>
          <p className="text-xs text-slate-500 font-medium mt-0.5">Platform-wide user management · click a row to manage</p>
        </div>
      </div>

      <div className="p-8 max-w-7xl mx-auto">
        {/* KPI strip */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
          {[
            { label: 'Total Users', value: members.length, Icon: Users, bg: 'bg-[#fff7ed]', color: 'text-[#fc6e20]' },
            { label: 'Active', value: active, Icon: UserCheck, bg: 'bg-emerald-50', color: 'text-emerald-700' },
            { label: 'Inactive', value: inactive, Icon: UserX, bg: 'bg-rose-50', color: 'text-rose-700' },
          ].map(k => (
            <div key={k.label} className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 flex items-center gap-4">
              <div className={`w-11 h-11 rounded-xl ${k.bg} ${k.color} flex items-center justify-center flex-shrink-0`}>
                <k.Icon size={20} strokeWidth={1.8} />
              </div>
              <div>
                <div className="text-xs font-bold uppercase tracking-wider text-slate-400">{k.label}</div>
                <div className="text-2xl font-black text-slate-800 mt-0.5 tabular-nums">{k.value}</div>
              </div>
            </div>
          ))}
        </div>

        {/* Table */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="flex items-center gap-3 px-6 py-4 border-b border-slate-100">
            <Search size={14} className="text-slate-400" />
            <span className="text-sm font-semibold text-slate-500">{members.length} members across all companies</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50/75 text-xs font-bold text-slate-400 uppercase tracking-wider">
                  <th className="px-6 py-3">Member</th>
                  <th className="px-6 py-3">Company</th>
                  <th className="px-6 py-3">Role</th>
                  <th className="px-6 py-3">Joined</th>
                  <th className="px-6 py-3">Status</th>
                  <th className="px-6 py-3">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {members.map(m => (
                  <tr key={m.id} className="hover:bg-slate-50/50 transition-colors group">
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-full bg-gradient-to-br from-[#fc6e20] to-[#e85b0d] text-white flex items-center justify-center text-xs font-extrabold flex-shrink-0">
                          {getInitials(m.user.name ?? m.user.email)}
                        </div>
                        <div>
                          <div className="font-semibold text-sm text-slate-900">{m.user.name ?? '—'}</div>
                          <div className="text-xs text-slate-400">{m.user.email}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-sm font-medium text-slate-700">{m.company.name}</td>
                    <td className="px-6 py-4">
                      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-bold ${roleColors[m.role] ?? 'bg-slate-100 text-slate-700'}`}>
                        {m.role.replace(/_/g, ' ')}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-xs text-slate-400 font-medium">
                      {new Date(m.joinedAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
                    </td>
                    <td className="px-6 py-4">
                      <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold border ${
                        m.isActive ? 'bg-emerald-50 text-emerald-700 border-emerald-100' : 'bg-rose-50 text-rose-700 border-rose-100'
                      }`}>
                        <span className="w-1.5 h-1.5 rounded-full bg-current" />
                        {m.isActive ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <Link
                        href={`/super-admin/users/${m.user.id}`}
                        className="inline-flex items-center gap-1 px-3 py-1.5 bg-[#fff7ed] hover:bg-[#fde8d1] text-[#fc6e20] text-xs font-bold rounded-lg transition-colors"
                      >
                        Manage
                      </Link>
                    </td>
                  </tr>
                ))}
                {members.length === 0 && (
                  <tr>
                    <td colSpan={6} className="text-center py-12 text-sm text-slate-400">No users found.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  )
}
