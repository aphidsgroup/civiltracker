import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { redirect } from 'next/navigation'

export default async function VendorsPage() {
  const session = await auth()
  if (!session?.user?.companyId) redirect('/login')

  const vendors = await prisma.vendor.findMany({
    where: { companyId: session.user.companyId, isActive: true },
    include: {
      _count: { select: { purchaseOrders: true } },
    },
    orderBy: { name: 'asc' },
  })

  const totalPurchase = vendors.reduce((s, v) => s + Number(v.totalPurchase), 0)
  const totalPayable = vendors.reduce((s, v) => s + Number(v.amountPayable), 0)

  return (
    <>
      {/* Top bar */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 bg-white">
        <div className="text-base font-bold text-slate-800">Vendors</div>
      </div>

      <div className="p-6">
        {/* KPI cards */}
        <div className="grid grid-cols-3 gap-4 mb-6">
          {[
            { label: 'Total Vendors', value: vendors.length },
            { label: 'Total Purchase', value: '₹' + (totalPurchase / 100000).toFixed(1) + 'L' },
            { label: 'Payable', value: '₹' + (totalPayable / 100000).toFixed(1) + 'L' },
          ].map(k => (
            <div key={k.label} className="bg-white rounded-xl border border-slate-200 shadow-sm p-4">
              <div className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">{k.label}</div>
              <div className="text-lg font-bold text-slate-800">{k.value}</div>
            </div>
          ))}
        </div>

        {/* Table card */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-x-auto">
          <div className="flex justify-between items-center p-4 mb-0">
            <div className="text-sm font-bold text-slate-800">All Vendors</div>
            <a
              href="/vendors/new"
              className="bg-blue-600 text-white rounded-lg px-4 py-2 text-xs font-bold no-underline hover:bg-blue-700 transition-colors"
            >
              + Add Vendor
            </a>
          </div>
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-t border-slate-100 bg-slate-50">
                <th className="px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Vendor</th>
                <th className="px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Category</th>
                <th className="px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">POs</th>
                <th className="px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Total Purchase</th>
                <th className="px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Payable</th>
                <th className="px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Status</th>
              </tr>
            </thead>
            <tbody>
              {vendors.map(v => (
                <tr key={v.id} className="border-t border-slate-100 hover:bg-slate-50 transition-colors">
                  <td className="px-4 py-3">
                    <div className="font-bold text-sm text-slate-800">{v.name}</div>
                    <div className="text-xs text-slate-400">{v.phone ?? v.email ?? '—'}</div>
                  </td>
                  <td className="px-4 py-3 text-sm text-slate-600">{v.category ?? '—'}</td>
                  <td className="px-4 py-3 text-sm text-slate-600">{v._count.purchaseOrders}</td>
                  <td className="px-4 py-3 text-sm font-semibold text-slate-700">₹{Number(v.totalPurchase).toLocaleString('en-IN')}</td>
                  <td className={`px-4 py-3 text-sm font-semibold ${Number(v.amountPayable) > 0 ? 'text-orange-600' : 'text-slate-700'}`}>
                    ₹{Number(v.amountPayable).toLocaleString('en-IN')}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold ${v.isActive ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-600'}`}>
                      {v.isActive ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                </tr>
              ))}
              {vendors.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-sm text-slate-400">No vendors yet.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </>
  )
}
