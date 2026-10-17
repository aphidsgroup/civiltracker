import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { prisma } from '@/lib/prisma'
import { AlertCircle, Plus, MapPin, Calendar, Tag, Package, ExternalLink } from 'lucide-react'
import Link from 'next/link'
import PurchaseRequestStatusDropdown from '@/components/materials/PurchaseRequestStatusDropdown'

interface MaterialItem {
  materialName: string
  specification?: string
  brand?: string
  quantity: number
  unit: string
  notes?: string
}

export default async function MaterialsRequestsPage() {
  const session = await auth()
  if (!session?.user) {
    redirect('/login')
  }

  const user = session.user
  const isSuperAdmin = user.role === 'SUPER_ADMIN'
  const companyFilter = isSuperAdmin ? {} : { companyId: user.companyId || '' }

  let requests: Array<{
    id: string
    description: string
    quantity: number
    unit: string | null
    status: 'PENDING' | 'PM_APPROVED' | 'PO_CREATED' | 'DELIVERED' | 'CANCELLED'
    urgency: string
    workLocation: string | null
    brand: string | null
    neededBy: Date | null
    approvedQty: number | null
    notes: string | null
    itemsJson: unknown
    site: { id: string; name: string } | null
    createdAt: Date
  }> = []

  let approvals: Array<{
    id: string
    entityId: string
    currentStatus: string
    requestedBy: { name: string; email: string }
  }> = []

  try {
    const rawRequests = await prisma.purchaseRequest.findMany({
      where: companyFilter,
      include: {
        site: { select: { id: true, name: true } },
      },
      orderBy: { createdAt: 'desc' },
    })

    requests = rawRequests.map((r) => ({
      id: r.id,
      description: r.description,
      quantity: Number(r.quantity),
      unit: r.unit,
      status: r.status,
      urgency: r.urgency,
      workLocation: r.workLocation,
      brand: r.brand,
      neededBy: r.neededBy,
      approvedQty: r.approvedQty ? Number(r.approvedQty) : null,
      notes: r.notes,
      itemsJson: r.itemsJson,
      site: r.site,
      createdAt: r.createdAt,
    }))

    if (requests.length > 0) {
      approvals = await prisma.approval.findMany({
        where: {
          ...companyFilter,
          entityType: 'MATERIAL_REQUEST',
          entityId: { in: requests.map((r) => r.id) },
        },
        select: {
          id: true,
          entityId: true,
          currentStatus: true,
          requestedBy: { select: { name: true, email: true } },
        },
      })
    }
  } catch (err) {
    console.error('Error fetching purchase requests:', err)
  }

  const approvalByEntityId = new Map(approvals.map((a) => [a.entityId, a]))

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      {/* Header & Sub-navigation */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-white p-6 rounded-3xl border border-slate-200 shadow-xs">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="px-2.5 py-0.5 rounded-full bg-orange-50 text-[#fc6e20] text-[11px] font-black uppercase tracking-wider border border-orange-100">
              Procurement & Indents
            </span>
          </div>
          <h1 className="text-2xl font-black text-slate-900 tracking-tight">Material Purchase Requests (PR)</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            Review site requisitions with exact material specifications, brands, and work locations
          </p>
        </div>

        <div className="flex items-center gap-2.5 flex-wrap">
          <Link
            href="/materials/catalogue"
            className="px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-extrabold text-xs rounded-xl no-underline transition-all flex items-center gap-1.5"
          >
            <Package size={15} />
            <span>Master Catalogue</span>
          </Link>
          <Link
            href="/materials"
            className="px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-extrabold text-xs rounded-xl no-underline transition-all"
          >
            View Stock Inventory
          </Link>
        </div>
      </div>

      {/* Main Table Card */}
      <div className="bg-white rounded-3xl border border-slate-200 shadow-xs overflow-hidden">
        <div className="p-4 sm:px-6 sm:py-4 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-black text-slate-800 m-0">Site Material Indents</h2>
            <span className="px-2 py-0.5 rounded-full bg-slate-200 text-slate-700 text-xs font-bold">
              {requests.length}
            </span>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-200 text-[11px] font-extrabold uppercase tracking-wider text-slate-400 bg-slate-50">
                <th className="py-3.5 px-6">Urgency</th>
                <th className="py-3.5 px-6">Material & Specification</th>
                <th className="py-3.5 px-6">Quantity & Unit</th>
                <th className="py-3.5 px-6">Site & Work Location</th>
                <th className="py-3.5 px-6">Required By</th>
                <th className="py-3.5 px-6">Status Control</th>
                <th className="py-3.5 px-6 text-right">Approval Review</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-sm font-medium">
              {requests.map((req) => {
                const isUrgent = req.urgency?.toLowerCase() === 'urgent'
                const isHigh = req.urgency?.toLowerCase() === 'high'
                const linkedApproval = approvalByEntityId.get(req.id)

                // Parse items if batch indent
                let batchItems: MaterialItem[] = []
                if (req.itemsJson && Array.isArray(req.itemsJson)) {
                  batchItems = req.itemsJson as unknown as MaterialItem[]
                }

                return (
                  <tr key={req.id} className="hover:bg-slate-50/80 transition-colors">
                    {/* Urgency */}
                    <td className="py-4 px-6 align-top">
                      <span
                        className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-extrabold uppercase tracking-wide ${
                          isUrgent
                            ? 'bg-rose-100 text-rose-800 border border-rose-200'
                            : isHigh
                            ? 'bg-amber-100 text-amber-800 border border-amber-200'
                            : 'bg-slate-100 text-slate-600 border border-slate-200'
                        }`}
                      >
                        {isUrgent && <AlertCircle size={10} />}
                        <span>{req.urgency || 'Normal'}</span>
                      </span>
                    </td>

                    {/* Material & Specification */}
                    <td className="py-4 px-6 align-top">
                      <div className="font-extrabold text-slate-900 max-w-[280px]">
                        {req.description}
                      </div>

                      {/* Brand badge if present */}
                      {req.brand && (
                        <div className="inline-flex items-center gap-1 text-[11px] font-bold text-sky-600 bg-sky-50 px-2 py-0.5 rounded-md border border-sky-100 mt-1">
                          <Tag size={10} />
                          <span>Brand: {req.brand}</span>
                        </div>
                      )}

                      {/* Multi-item batch details */}
                      {batchItems.length > 1 && (
                        <div className="mt-2 p-2 rounded-xl bg-slate-50 border border-slate-200/80 space-y-1 text-xs">
                          <div className="font-extrabold text-[10.5px] uppercase tracking-wider text-slate-500">
                            Batch Indent ({batchItems.length} items):
                          </div>
                          {batchItems.map((bi, idx) => (
                            <div key={idx} className="flex justify-between text-slate-700 text-[11px]">
                              <span className="font-semibold">{bi.materialName} {bi.specification ? `(${bi.specification})` : ''}</span>
                              <span className="font-black text-[#ea580c]">{bi.quantity} {bi.unit}</span>
                            </div>
                          ))}
                        </div>
                      )}

                      {/* Notes */}
                      {req.notes && (
                        <div className="text-[11px] text-slate-500 italic mt-1 max-w-[280px]">
                          {req.notes}
                        </div>
                      )}
                    </td>

                    {/* Quantity & Unit */}
                    <td className="py-4 px-6 align-top">
                      <div className="font-black text-[15px] text-[#ea580c]">
                        {req.quantity} {req.unit || 'Units'}
                      </div>
                      {req.approvedQty !== null && (
                        <div className="text-[11px] font-semibold text-emerald-600 mt-0.5">
                          Approved: {req.approvedQty} {req.unit}
                        </div>
                      )}
                    </td>

                    {/* Site & Work Location */}
                    <td className="py-4 px-6 align-top space-y-1">
                      <div>
                        <span className="px-2.5 py-1 rounded-lg bg-slate-100 text-slate-800 text-xs font-bold">
                          {req.site?.name || 'Project Site'}
                        </span>
                      </div>
                      {req.workLocation && (
                        <div className="text-xs font-semibold text-amber-700 flex items-center gap-1">
                          <MapPin size={12} className="flex-shrink-0" />
                          <span>{req.workLocation}</span>
                        </div>
                      )}
                    </td>

                    {/* Required By Date */}
                    <td className="py-4 px-6 align-top">
                      {req.neededBy ? (
                        <div className="flex items-center gap-1.5 text-xs font-bold text-slate-700">
                          <Calendar size={13} className="text-slate-400" />
                          <span>{new Date(req.neededBy).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}</span>
                        </div>
                      ) : (
                        <span className="text-xs text-slate-400">Not specified</span>
                      )}
                    </td>

                    {/* Status Control Dropdown */}
                    <td className="py-4 px-6 align-top">
                      <PurchaseRequestStatusDropdown
                        requestId={req.id}
                        currentStatus={req.status}
                      />
                    </td>

                    {/* Approval Center Review Link */}
                    <td className="py-4 px-6 align-top text-right">
                      {linkedApproval ? (
                        <Link
                          href={`/approvals/${linkedApproval.id}`}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-orange-50 hover:bg-orange-100 text-[#ea580c] font-black text-xs no-underline transition-colors border border-orange-200"
                        >
                          <span>Review</span>
                          <ExternalLink size={12} />
                        </Link>
                      ) : (
                        <span className="text-xs text-slate-400">Direct PR</span>
                      )}
                    </td>
                  </tr>
                )
              })}

              {requests.length === 0 && (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-slate-400 font-medium">
                    <Package size={32} className="mx-auto text-slate-300 mb-2" />
                    <p className="m-0 text-sm font-bold text-slate-600">No site material purchase requests found</p>
                    <p className="m-0 text-xs text-slate-400 mt-0.5">
                      Site engineers can raise requests using the mobile requisition catalogue.
                    </p>
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
