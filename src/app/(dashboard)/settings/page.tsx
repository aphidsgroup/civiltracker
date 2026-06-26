import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { redirect } from 'next/navigation'
import { formatDate } from '@/lib/utils'

export const metadata = { title: 'Settings | Civil Tracker' }

export default async function SettingsPage() {
  const session = await auth()
  if (!session?.user?.companyId) redirect('/login')
  const { companyId } = session.user

  const [company, members] = await Promise.all([
    prisma.company.findUnique({ where: { id: companyId } }),
    prisma.companyMember.findMany({
      where: { companyId },
      include: { user: { select: { id: true, name: true, email: true, isActive: true } } },
      orderBy: { joinedAt: 'desc' },
      take: 20,
    }),
  ])
  const users = members.map(m => ({ id: m.userId, name: m.user?.name ?? '', email: m.user?.email ?? '', role: m.role, isActive: m.user?.isActive ?? true, createdAt: m.joinedAt }))

  if (!company) redirect('/login')

  const roleColors: Record<string, string> = {
    COMPANY_ADMIN: 'bg-blue-50 text-blue-700 border-blue-200',
    PROJECT_MANAGER: 'bg-purple-50 text-purple-700 border-purple-200',
    ACCOUNTANT: 'bg-amber-50 text-amber-700 border-amber-200',
    SITE_ENGINEER: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    SUPERVISOR: 'bg-gray-100 text-gray-700 border-gray-200',
    CLIENT: 'bg-rose-50 text-rose-700 border-rose-200',
  }

  return (
    <div className="flex flex-col gap-6 p-6 min-h-screen bg-gray-50/50">
      <div>
        <h1 className="text-xl font-semibold tracking-tight text-gray-900 mb-1">Settings</h1>
        <p className="text-sm text-gray-500 m-0">Company and account settings</p>
      </div>

      {/* Company info */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6">
        <h2 className="text-base font-bold text-gray-900 mb-4">Company</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {[
            { label: 'Company Name', value: company.name },
            { label: 'Plan', value: company.plan ?? 'Standard' },
            { label: 'GST', value: company.gst ?? 'Not set' },
            { label: 'Phone', value: company.phone ?? 'Not set' },
            { label: 'City', value: company.city ?? 'Not set' },
            { label: 'Member Since', value: formatDate(company.createdAt) },
          ].map(f => (
            <div key={f.label}>
              <div className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">{f.label}</div>
              <div className="text-sm font-semibold text-gray-900">{f.value}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Team */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-200 bg-gray-50/50">
          <h2 className="text-base font-bold text-gray-900 m-0">Team Members</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-gray-200 bg-gray-50/75">
                <th className="px-6 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Name</th>
                <th className="px-6 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Email</th>
                <th className="px-6 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Role</th>
                <th className="px-6 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Joined</th>
                <th className="px-6 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {users.map(u => (
                <tr key={u.id} className="hover:bg-gray-50/50 transition-colors">
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-600 to-blue-900 flex items-center justify-center text-xs font-bold text-white flex-shrink-0">
                        {u.name?.split(' ').map((n: string) => n[0]).join('').toUpperCase().slice(0,2)}
                      </div>
                      <span className="font-semibold text-sm text-gray-900">{u.name}</span>
                    </div>
                  </td>
                  <td className="px-6 py-4 text-xs font-medium text-gray-500">{u.email}</td>
                  <td className="px-6 py-4">
                    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${roleColors[u.role] ?? 'bg-gray-100 text-gray-700 border-gray-200'}`}>
                      {u.role.replace(/_/g, ' ')}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-xs font-medium text-gray-500">{formatDate(u.createdAt)}</td>
                  <td className="px-6 py-4">
                    <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium border ${u.isActive ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-gray-100 text-gray-600 border-gray-200'}`}>
                      <span className={`w-1.5 h-1.5 rounded-full ${u.isActive ? 'bg-emerald-500' : 'bg-gray-400'}`} />
                      {u.isActive ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
