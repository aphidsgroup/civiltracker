import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { Plus } from 'lucide-react'

export default async function UsersSettingsPage() {
  const session = await auth()
  if (!session?.user?.companyId) redirect('/login')

  const members = await prisma.companyMember.findMany({
    where: { companyId: session.user.companyId },
    include: { user: { select: { id: true, name: true, email: true, phone: true } } },
    orderBy: { joinedAt: 'desc' },
  })

  const company = await prisma.company.findUnique({
    where: { id: session.user.companyId },
    select: { userLimit: true },
  })

  const activeCount = members.filter(m => m.isActive).length
  const userLimit = company?.userLimit ?? 5

  function getInitials(name: string) {
    return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)
  }

  return (
    <div className="min-h-screen bg-gray-50/50">
      <div className="flex items-center justify-between px-6 py-4 bg-white border-b border-gray-200">
        <h1 className="text-xl font-semibold text-gray-900">Team Members</h1>
      </div>
      <div className="p-6">
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          {[
            { label: 'Total Members', value: members.length },
            { label: 'Active', value: activeCount },
            { label: 'User Limit', value: userLimit },
            { label: 'Slots Used', value: `${activeCount} / ${userLimit}` },
          ].map(k => (
            <div key={k.label} className="p-4 bg-white rounded-xl border border-gray-200 shadow-sm">
              <div className="text-xs font-medium text-gray-500 uppercase tracking-wider">{k.label}</div>
              <div className="text-xl font-bold text-gray-900 mt-1">{k.value}</div>
            </div>
          ))}
        </div>
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6 overflow-hidden overflow-x-auto">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-base font-bold text-gray-900">All Members</h2>
            <Link href="/settings/users/invite" className="inline-flex items-center gap-1.5 bg-[#fc6e20] hover:bg-[#e85b0d] text-white rounded-lg px-4 py-2 text-sm font-medium shadow-sm transition-colors">
              <Plus className="w-4 h-4" /> Invite
            </Link>
          </div>
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-gray-200 bg-gray-50/75">
                <th className="px-6 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Member</th>
                <th className="px-6 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Role</th>
                <th className="px-6 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Phone</th>
                <th className="px-6 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Joined</th>
                <th className="px-6 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {members.map(m => (
                <tr key={m.id} className="hover:bg-gray-50/50 transition-colors">
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-[#fc6e20] text-white flex items-center justify-center text-xs font-bold flex-shrink-0">
                        {getInitials(m.user.name ?? m.user.email)}
                      </div>
                      <div>
                        <Link href={`/settings/users/${m.id}`} className="font-semibold text-sm text-[#fc6e20] hover:underline">{m.user.name ?? '—'}</Link>
                        <div className="text-xs text-gray-500">{m.user.email}</div>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4 text-xs font-medium">
                    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-[#fff7ed] text-[#e85b0d] border border-blue-200">
                      {m.role}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-xs text-gray-500">{m.user.phone ?? '—'}</td>
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
                  <td colSpan={5} className="text-center py-8 text-sm text-gray-500">No members yet.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
