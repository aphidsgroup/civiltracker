import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { redirect } from 'next/navigation'
import { Users } from 'lucide-react'

export default async function ClientsPage() {
  const session = await auth()
  if (!session?.user?.companyId) redirect('/login')
  const { companyId } = session.user

  const clients = await prisma.client.findMany({
    where: { companyId },
    include: {
      _count: { select: { payments: true, invoices: true } },
    },
    orderBy: { name: 'asc' },
  })

  const totalContract = clients.reduce((s, c) => s + Number(c.contractValue), 0)
  const totalPaid = clients.reduce((s, c) => s + Number(c.amountPaid), 0)
  const totalDue = clients.reduce((s, c) => s + Number(c.amountDue), 0)

  return (
    <div className="min-h-screen bg-gray-50/50">
      <div className="flex items-center justify-between px-6 py-4 bg-white border-b border-gray-200">
        <h1 className="text-xl font-semibold text-gray-900">Clients</h1>
      </div>

      <div className="p-6">
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          <div className="p-4 bg-white rounded-xl border border-gray-200 shadow-sm">
            <div className="text-xs font-medium text-gray-500 uppercase tracking-wider">Total Clients</div>
            <div className="text-2xl font-bold text-gray-900 mt-1">{clients.length}</div>
          </div>
          <div className="p-4 bg-white rounded-xl border border-gray-200 shadow-sm">
            <div className="text-xs font-medium text-gray-500 uppercase tracking-wider">Contract Value</div>
            <div className="text-2xl font-bold text-gray-900 mt-1">₹{(totalContract / 100000).toFixed(2)}L</div>
          </div>
          <div className="p-4 bg-white rounded-xl border border-gray-200 shadow-sm">
            <div className="text-xs font-medium text-gray-500 uppercase tracking-wider">Amount Paid</div>
            <div className="text-2xl font-bold text-emerald-600 mt-1">₹{(totalPaid / 100000).toFixed(2)}L</div>
          </div>
          <div className="p-4 bg-white rounded-xl border border-gray-200 shadow-sm">
            <div className="text-xs font-medium text-gray-500 uppercase tracking-wider">Amount Due</div>
            <div className={`text-2xl font-bold mt-1 ${totalDue > 0 ? 'text-rose-600' : 'text-gray-900'}`}>₹{(totalDue / 100000).toFixed(2)}L</div>
          </div>
        </div>

        {clients.length === 0 ? (
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-12 text-center flex flex-col items-center justify-center">
            <div className="p-4 bg-blue-50 text-blue-600 rounded-full mb-4">
              <Users className="w-8 h-8" />
            </div>
            <h3 className="text-lg font-bold text-gray-900 mb-1">No clients yet</h3>
            <p className="text-sm text-gray-500 max-w-sm">Clients are linked to sites. Add client details to track invoicing and payments.</p>
          </div>
        ) : (
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-gray-200 bg-gray-50/75">
                  <th className="px-6 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Client</th>
                  <th className="px-6 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Contact</th>
                  <th className="px-6 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Contract Value</th>
                  <th className="px-6 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Paid</th>
                  <th className="px-6 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Due</th>
                  <th className="px-6 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Invoices</th>
                  <th className="px-6 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Payments</th>
                  <th className="px-6 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Portal</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {clients.map(c => (
                  <tr key={c.id} className="hover:bg-gray-50/50 transition-colors">
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-blue-600 to-blue-800 text-white flex items-center justify-center font-bold text-xs flex-shrink-0">
                          {c.name.substring(0, 2).toUpperCase()}
                        </div>
                        <div className="font-semibold text-sm text-gray-900">{c.name}</div>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      {c.phone && <div className="text-sm font-medium text-gray-800">{c.phone}</div>}
                      {c.email && <div className="text-xs text-gray-500">{c.email}</div>}
                    </td>
                    <td className="px-6 py-4 font-semibold text-sm text-gray-900">₹{Number(c.contractValue).toLocaleString('en-IN')}</td>
                    <td className="px-6 py-4 font-semibold text-sm text-emerald-600">₹{Number(c.amountPaid).toLocaleString('en-IN')}</td>
                    <td className={`px-6 py-4 font-semibold text-sm ${Number(c.amountDue) > 0 ? 'text-rose-600' : 'text-gray-900'}`}>
                      ₹{Number(c.amountDue).toLocaleString('en-IN')}
                    </td>
                    <td className="px-6 py-4 text-sm font-semibold text-gray-700">{c._count.invoices}</td>
                    <td className="px-6 py-4 text-sm font-semibold text-gray-700">{c._count.payments}</td>
                    <td className="px-6 py-4">
                      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${c.portalAccess ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-gray-100 text-gray-600 border-gray-200'}`}>
                        {c.portalAccess ? 'Active' : 'Disabled'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
