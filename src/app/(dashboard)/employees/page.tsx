import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { Users, Plus, UserCheck, UserMinus, Shield } from 'lucide-react'

export const metadata = { title: 'Employees | Civil Tracker' }
export const dynamic = 'force-dynamic'

const roleLabels: Record<string, string> = {
  COMPANY_ADMIN: 'Company Admin',
  PROJECT_MANAGER: 'Project Manager',
  SITE_ENGINEER: 'Site Engineer',
  SUPERVISOR: 'Supervisor',
  ACCOUNTANT: 'Accountant',
  PURCHASE_MANAGER: 'Purchase Manager',
}

const roleColors: Record<string, string> = {
  COMPANY_ADMIN: 'bg-purple-100 text-purple-700 border-purple-200',
  PROJECT_MANAGER: 'bg-indigo-100 text-indigo-700 border-indigo-200',
  SITE_ENGINEER: 'bg-blue-100 text-blue-700 border-blue-200',
  SUPERVISOR: 'bg-teal-100 text-teal-700 border-teal-200',
  ACCOUNTANT: 'bg-sky-100 text-sky-700 border-sky-200',
  PURCHASE_MANAGER: 'bg-cyan-100 text-cyan-700 border-cyan-200',
}

export default async function EmployeesPage() {
  const session = await auth()
  if (!session?.user?.companyId) redirect('/login')
  const { companyId } = session.user

  // Only show employee roles (not CLIENT)
  const employeeRoles = ['COMPANY_ADMIN', 'PROJECT_MANAGER', 'SITE_ENGINEER', 'SUPERVISOR', 'ACCOUNTANT', 'PURCHASE_MANAGER']

  const members = await prisma.companyMember.findMany({
    where: {
      companyId,
      role: { in: employeeRoles as never[] },
    },
    include: {
      user: { select: { id: true, name: true, email: true, phone: true, lastLoginAt: true } },
    },
    orderBy: { joinedAt: 'desc' },
  })

  const company = await prisma.company.findUnique({
    where: { id: companyId },
    select: { userLimit: true },
  })

  const active = members.filter(m => m.isActive).length
  const userLimit = company?.userLimit ?? 15

  function getInitials(name: string) {
    return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)
  }

  return (
    <div className="flex flex-col gap-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight text-slate-900 dark:text-slate-100">Employees</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            {active} active · {active}/{userLimit} slots used
          </p>
        </div>
        <Link
          href="/settings/users/invite"
          className="inline-flex items-center gap-1.5 bg-[#fc6e20] hover:bg-[#e85b0d] text-white rounded-xl px-4 py-2.5 text-sm font-bold transition-colors shadow-sm"
        >
          <Plus size={15} /> Add Employee
        </Link>
      </div>

      {/* KPI Strip */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {[
          { label: 'Total Employees', value: members.length, icon: Users, color: 'text-[#fc6e20]', bg: 'bg-[#fff7ed]' },
          { label: 'Active', value: active, icon: UserCheck, color: 'text-emerald-600', bg: 'bg-emerald-50' },
          { label: 'Inactive', value: members.length - active, icon: UserMinus, color: 'text-slate-500', bg: 'bg-slate-100' },
        ].map(s => {
          const Icon = s.icon
          return (
            <div key={s.label} className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-4 shadow-sm flex items-center justify-between">
              <div>
                <div className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">{s.label}</div>
                <div className="text-2xl font-extrabold text-slate-900 dark:text-slate-100">{s.value}</div>
              </div>
              <div className={`p-3 rounded-lg ${s.bg} ${s.color}`}>
                <Icon className="w-6 h-6" />
              </div>
            </div>
          )
        })}
      </div>

      {/* Table */}
      <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 dark:border-slate-800">
          <div className="flex items-center gap-2">
            <Shield size={16} className="text-slate-400" />
            <h2 className="text-base font-bold text-slate-900 dark:text-slate-100">All Employees</h2>
          </div>
          <Link
            href="/settings/users/invite"
            className="inline-flex items-center gap-1 px-3 py-1.5 bg-[#fff7ed] hover:bg-[#fde8d1] text-[#fc6e20] text-xs font-bold rounded-lg transition-colors"
          >
            <Plus size={12} /> Add New
          </Link>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50 dark:bg-slate-800/50 border-b border-slate-200 dark:border-slate-800">
                <th className="px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Employee</th>
                <th className="px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Role</th>
                <th className="px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Phone</th>
                <th className="px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Last Login</th>
                <th className="px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Status</th>
                <th className="px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {members.map(m => (
                <tr key={m.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/30 transition-colors">
                  <td className="px-4 py-3.5">
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-[#fc6e20] to-[#e85b0d] text-white flex items-center justify-center text-xs font-extrabold flex-shrink-0">
                        {getInitials(m.user.name)}
                      </div>
                      <div>
                        <div className="font-bold text-sm text-slate-900 dark:text-slate-100">{m.user.name}</div>
                        <div className="text-xs text-slate-400">{m.user.email}</div>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3.5">
                    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold border ${roleColors[m.role] ?? 'bg-slate-100 text-slate-700 border-slate-200'}`}>
                      {roleLabels[m.role] ?? m.role}
                    </span>
                  </td>
                  <td className="px-4 py-3.5 text-sm text-slate-500 dark:text-slate-400">{m.user.phone ?? '—'}</td>
                  <td className="px-4 py-3.5 text-xs text-slate-400">
                    {m.user.lastLoginAt
                      ? new Date(m.user.lastLoginAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
                      : 'Never logged in'}
                  </td>
                  <td className="px-4 py-3.5">
                    <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-bold border ${
                      m.isActive ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-rose-50 text-rose-700 border-rose-200'
                    }`}>
                      <span className="w-1.5 h-1.5 rounded-full bg-current" />
                      {m.isActive ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td className="px-4 py-3.5">
                    <Link
                      href={`/settings/users/${m.id}`}
                      className="inline-flex items-center gap-1 px-3 py-1.5 bg-[#fff7ed] hover:bg-[#fde8d1] text-[#fc6e20] text-xs font-bold rounded-lg transition-colors"
                    >
                      Manage / Set Password
                    </Link>
                  </td>
                </tr>
              ))}
              {members.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-12 text-center">
                    <div className="text-slate-400 text-sm mb-3">No employees yet</div>
                    <Link href="/settings/users/invite" className="inline-flex items-center gap-1.5 px-4 py-2 bg-[#fc6e20] text-white text-sm font-bold rounded-xl hover:bg-[#e85b0d] transition-colors">
                      <Plus size={14} /> Add First Employee
                    </Link>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Info box about access control */}
      <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 text-sm text-blue-800">
        <strong>Access Control:</strong> Click &quot;Manage / Set Password&quot; on any employee to change their role, site access permissions, reset their password, or remove them from the company.
        All their data (expenses, DPRs) is always preserved.
      </div>
    </div>
  )
}
