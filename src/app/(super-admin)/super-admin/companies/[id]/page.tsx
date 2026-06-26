import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { redirect, notFound } from 'next/navigation'

export default async function CompanyDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session?.user || session.user.role !== 'SUPER_ADMIN') redirect('/login')

  const { id } = await params

  const company = await prisma.company.findUnique({
    where: { id },
    include: {
      sites: { select: { id: true, name: true, status: true, location: true }, orderBy: { createdAt: 'desc' }, take: 20 },
      members: {
        include: { user: { select: { name: true, email: true, phone: true } } },
        orderBy: { joinedAt: 'desc' },
        take: 50,
      },
    },
  })

  if (!company) notFound()

  const activeMembers = company.members.filter(m => m.isActive).length

  const statusColor: Record<string, string> = {
    ACTIVE: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    TRIAL: 'bg-blue-50 text-blue-700 border-blue-200',
    SUSPENDED: 'bg-amber-50 text-amber-700 border-amber-200',
    CANCELLED: 'bg-rose-50 text-rose-700 border-rose-200',
  }
  const siteStatusColor: Record<string, string> = {
    ACTIVE: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    PLANNING: 'bg-blue-50 text-blue-700 border-blue-200',
    ON_HOLD: 'bg-amber-50 text-amber-700 border-amber-200',
    COMPLETED: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    CANCELLED: 'bg-rose-50 text-rose-700 border-rose-200',
  }

  function getInitials(name: string) {
    return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)
  }

  return (
    <div className="min-h-screen bg-gray-50/50">
      <div className="flex items-center px-6 py-4 bg-white border-b border-gray-200">
        <h1 className="text-xl font-semibold text-gray-900">{company.name}</h1>
        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ml-3 ${statusColor[company.status] ?? 'bg-gray-100 text-gray-700 border-gray-200'}`}>
          {company.status}
        </span>
      </div>
      <div className="p-6">
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          {[
            { label: 'Sites', value: company.sites.length },
            { label: 'Active Members', value: activeMembers },
            { label: 'User Limit', value: company.userLimit ?? 5 },
            { label: 'Plan', value: company.plan ?? 'BASIC' },
          ].map(k => (
            <div key={k.label} className="p-4 bg-white rounded-xl border border-gray-200 shadow-sm">
              <div className="text-xs font-medium text-gray-500 uppercase tracking-wider">{k.label}</div>
              <div className="text-xl font-bold text-gray-900 mt-1">{k.value}</div>
            </div>
          ))}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="flex flex-col gap-6 md:col-span-1">
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
              <h2 className="text-sm font-bold text-gray-900 mb-3.5">Company Info</h2>
              <div className="divide-y divide-gray-100">
                {[
                  { label: 'Email', value: company.email ?? '—' },
                  { label: 'Phone', value: company.phone ?? '—' },
                  { label: 'GST', value: company.gst ?? '—' },
                  { label: 'Address', value: company.address ?? '—' },
                  { label: 'Slug', value: company.slug },
                  { label: 'Created', value: new Date(company.createdAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) },
                ].map(row => (
                  <div key={row.label} className="flex justify-between items-center py-2.5 text-sm">
                    <span className="text-xs font-medium text-gray-500">{row.label}</span>
                    <span className="text-sm font-semibold text-gray-900">{row.value}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
              <h2 className="text-sm font-bold text-gray-900 mb-3.5">Sites ({company.sites.length})</h2>
              {company.sites.length === 0 && <p className="text-xs text-gray-500">No sites yet.</p>}
              <div className="divide-y divide-gray-100">
                {company.sites.map(s => (
                  <div key={s.id} className="flex justify-between items-center py-2.5 text-sm">
                    <span className="text-sm font-semibold text-gray-900">{s.name}</span>
                    <span className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-medium border ${siteStatusColor[s.status] ?? 'bg-gray-100 text-gray-700 border-gray-200'}`}>
                      {s.status}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="md:col-span-2">
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5 overflow-x-auto">
              <h2 className="text-sm font-bold text-gray-900 mb-3.5">Members ({company.members.length})</h2>
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-gray-200 bg-gray-50/75">
                    <th className="px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wider">Member</th>
                    <th className="px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wider">Role</th>
                    <th className="px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wider">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {company.members.map(m => (
                    <tr key={m.id} className="hover:bg-gray-50/50 transition-colors">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2.5">
                          <div className="w-7 h-7 rounded-full bg-blue-600 text-white flex items-center justify-center text-[10px] font-bold flex-shrink-0">
                            {getInitials(m.user.name ?? m.user.email)}
                          </div>
                          <div>
                            <div className="font-semibold text-xs text-gray-900">{m.user.name ?? '—'}</div>
                            <div className="text-[11px] text-gray-500">{m.user.email}</div>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-medium bg-blue-50 text-blue-700 border border-blue-200">
                          {m.role}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-medium border ${m.isActive ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-rose-50 text-rose-700 border-rose-200'}`}>
                          {m.isActive ? 'Active' : 'Inactive'}
                        </span>
                      </td>
                    </tr>
                  ))}
                  {company.members.length === 0 && (
                    <tr>
                      <td colSpan={3} className="text-center py-6 text-xs text-gray-500">No members.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
