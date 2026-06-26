import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { redirect } from 'next/navigation'

export default async function SAUsersPage() {
  const session = await auth()
  if (session?.user?.role !== 'SUPER_ADMIN') redirect('/dashboard')

  const members = await prisma.companyMember.findMany({
    include: {
      user: { select: { name: true, email: true, phone: true } },
      company: { select: { name: true } },
    },
    orderBy: { joinedAt: 'desc' },
    take: 200,
  })

  const active = members.filter(m => m.isActive).length

  function getInitials(name: string) {
    return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)
  }

  return (
    <div className="min-h-screen bg-gray-50/50">
      <div className="flex items-center px-6 py-4 bg-white border-b border-gray-200">
        <h1 className="text-xl font-semibold text-gray-900">All Users</h1>
      </div>
      <div className="p-6">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
          {[
            { label: 'Total Members', value: members.length },
            { label: 'Active', value: active },
            { label: 'Inactive', value: members.length - active },
          ].map(k => (
            <div key={k.label} className="p-4 bg-white rounded-xl border border-gray-200 shadow-sm">
              <div className="text-xs font-medium text-gray-500 uppercase tracking-wider">{k.label}</div>
              <div className="text-xl font-bold text-gray-900 mt-1">{k.value}</div>
            </div>
          ))}
        </div>
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6 overflow-hidden overflow-x-auto">
          <h2 className="text-base font-bold text-gray-900 mb-4">All Members</h2>
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-gray-200 bg-gray-50/75">
                <th className="px-6 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Member</th>
                <th className="px-6 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Company</th>
                <th className="px-6 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Role</th>
                <th className="px-6 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Joined</th>
                <th className="px-6 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {members.map(m => (
                <tr key={m.id} className="hover:bg-gray-50/50 transition-colors">
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-blue-600 text-white flex items-center justify-center text-xs font-bold flex-shrink-0">
                        {getInitials(m.user.name ?? m.user.email)}
                      </div>
                      <div>
                        <div className="font-semibold text-sm text-gray-900">{m.user.name ?? '—'}</div>
                        <div className="text-xs text-gray-500">{m.user.email}</div>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4 text-sm font-medium text-gray-800">{m.company.name}</td>
                  <td className="px-6 py-4">
                    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-50 text-blue-700 border border-blue-200">
                      {m.role}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-xs text-gray-500">{new Date(m.joinedAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}</td>
                  <td className="px-6 py-4">
                    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${m.isActive ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-rose-50 text-rose-700 border-rose-200'}`}>
                      {m.isActive ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                </tr>
              ))}
              {members.length === 0 && (
                <tr>
                  <td colSpan={5} className="text-center py-8 text-sm text-gray-500">No users yet.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
