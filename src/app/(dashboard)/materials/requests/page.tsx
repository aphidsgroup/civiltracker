import { requireUser } from '@/lib/auth/require-user'
import { prisma } from '@/lib/prisma'
import { AlertCircle, Plus } from 'lucide-react'

export default async function MaterialsRequestsPage() {
  const user = await requireUser()
  const requests = await prisma.purchaseRequest.findMany({
    where: { companyId: user.companyId! },
    include: { site: true },
    orderBy: { createdAt: 'desc' }
  })

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-white p-6 rounded-3xl border border-slate-200 shadow-sm">
        <div>
          <h1 className="text-2xl font-black text-slate-900 tracking-tight">Material Purchase Requests (PR)</h1>
          <p className="text-sm text-slate-500 mt-1">Review site indent requisitions before raising vendor purchase orders</p>
        </div>
        <button className="px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-extrabold text-xs rounded-xl shadow-lg shadow-blue-600/20 flex items-center gap-2 active:scale-95 transition-all">
          <Plus size={16} />
          <span>Raise New Site Indent</span>
        </button>
      </div>

      <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-200 text-[11px] font-extrabold uppercase tracking-wider text-slate-400 bg-slate-50">
                <th className="py-3.5 px-6">Urgency</th>
                <th className="py-3.5 px-6">Material Description</th>
                <th className="py-3.5 px-6">Indent Qty</th>
                <th className="py-3.5 px-6">Site Location</th>
                <th className="py-3.5 px-6">Approval Status</th>
                <th className="py-3.5 px-6 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-sm font-medium">
              {requests.map(req => {
                const isUrgent = req.urgency?.toLowerCase() === 'urgent'
                return (
                  <tr key={req.id} className="hover:bg-slate-50/80 transition-colors">
                    <td className="py-4 px-6">
                      <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-extrabold uppercase tracking-wide ${
                        isUrgent ? 'bg-rose-100 text-rose-800' : 'bg-slate-100 text-slate-600'
                      }`}>
                        {isUrgent && <AlertCircle size={10} />}
                        <span>{req.urgency || 'Normal'}</span>
                      </span>
                    </td>
                    <td className="py-4 px-6 font-bold text-slate-900">{req.description}</td>
                    <td className="py-4 px-6 font-extrabold text-blue-600">{Number(req.quantity)} {req.unit || 'Units'}</td>
                    <td className="py-4 px-6">
                      <span className="px-2.5 py-1 rounded-lg bg-slate-100 text-slate-700 text-xs font-bold">
                        {req.site?.name || 'Main Site'}
                      </span>
                    </td>
                    <td className="py-4 px-6">
                      <span className={`px-2.5 py-1 rounded-full text-[10px] font-extrabold uppercase ${
                        req.status === 'PM_APPROVED' ? 'bg-emerald-100 text-emerald-800' :
                        req.status === 'CANCELLED' ? 'bg-rose-100 text-rose-800' : 'bg-amber-100 text-amber-800'
                      }`}>
                        {req.status}
                      </span>
                    </td>
                    <td className="py-4 px-6 text-right space-x-2">
                      {req.status === 'PENDING' && (
                        <>
                          <button className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold transition-all shadow-sm">Approve PR</button>
                          <button className="px-3 py-1.5 bg-slate-100 hover:bg-rose-50 text-slate-600 hover:text-rose-600 rounded-xl text-xs font-bold transition-all">Cancel</button>
                        </>
                      )}
                    </td>
                  </tr>
                )
              })}

              {requests.length === 0 && (
                <tr>
                  <td colSpan={6} className="py-12 text-center text-slate-400 font-medium">
                    No pending site purchase requests.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
