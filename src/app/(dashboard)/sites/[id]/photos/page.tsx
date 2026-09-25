import { prisma } from '@/lib/prisma'
import { Prisma } from '@prisma/client'
import { redirect } from 'next/navigation'
import { exitDeniedPage, liveCompanySiteWhere, resolveTenantPageAccess } from '@/lib/pages/tenant-page-access'
import { Camera, AlertCircle, CheckCircle2 } from 'lucide-react'
import { PhotoApprovalCard } from '@/components/admin/PhotoApprovalCard'

export const dynamic = 'force-dynamic'

type PhotoApprovalItem = Prisma.SitePhotoGetPayload<{
  include: {
    task: {
      include: {
        category: {
          include: {
            stage: true
          }
        }
      }
    }
  }
}>

export default async function SitePhotosPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const gate = await resolveTenantPageAccess({ grants: [{ permission: 'sites.view', module: 'SITES' }] })
  if (gate.status === 'denied') exitDeniedPage(gate, `/sites/${id}/photos`)
  const { companyId } = gate.access

  // The page reads nothing until the id names a live site of exactly this company; the
  // layout's own lookup renders in parallel and is not a guard for this page.
  const site = await prisma.site.findFirst({ where: { id, ...liveCompanySiteWhere(companyId) }, select: { id: true } })
  if (!site) redirect('/sites')
  const siteId = site.id

  // Tasks that have been completed but have NO photo yet
  const missingPhotoTasks = await prisma.projectChecklistTask.findMany({
    where: {
      category: { stage: { checklist: { siteId, companyId } } },
      status: 'COMPLETED',
      sitePhotos: { none: {} }
    },
    include: { category: { include: { stage: true } } },
    orderBy: { updatedAt: 'desc' }
  })

  // All photos for this site — pending admin approval
  const pendingApprovalPhotos: PhotoApprovalItem[] = await prisma.sitePhoto.findMany({
    where: { siteId, companyId, approvedForClient: false },
    include: { task: { include: { category: { include: { stage: true } } } } },
    orderBy: { createdAt: 'desc' }
  })

  // Admin-approved photos
  const approvedPhotos: PhotoApprovalItem[] = await prisma.sitePhoto.findMany({
    where: { siteId, companyId, approvedForClient: true },
    include: { task: { include: { category: { include: { stage: true } } } } },
    orderBy: { approvedAt: 'desc' }
  })

  const totalPhotos = pendingApprovalPhotos.length + approvedPhotos.length

  return (
    <div className="flex flex-col gap-6 pb-12">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-extrabold tracking-tight text-slate-900">Site Photos</h2>
          <p className="text-slate-500 text-xs mt-0.5">{totalPhotos} total · {pendingApprovalPhotos.length} awaiting approval · {approvedPhotos.length} approved</p>
        </div>
      </div>

      {/* Tasks missing photos */}
      {missingPhotoTasks.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-5">
          <div className="flex items-center gap-2 mb-3">
            <AlertCircle className="w-5 h-5 text-amber-600" />
            <h3 className="text-sm font-extrabold text-amber-900 m-0">
              {missingPhotoTasks.length} Completed Task{missingPhotoTasks.length > 1 ? 's' : ''} Missing Photos
            </h3>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            {missingPhotoTasks.map(task => (
              <div key={task.id} className="bg-white rounded-lg p-3 border border-amber-100 flex items-center justify-between shadow-sm">
                <div>
                  <div className="text-xs font-bold text-slate-800">{task.name}</div>
                  <div className="text-[10px] text-slate-500 mt-0.5">{task.category.stage.name} / {task.category.name}</div>
                </div>
                <span className="text-[10px] uppercase font-bold text-amber-700 bg-amber-100 px-2 py-1 rounded">Missing</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Pending Admin Approval */}
      {pendingApprovalPhotos.length > 0 && (
        <div>
          <div className="flex items-center gap-2 mb-4">
            <div className="w-2.5 h-2.5 rounded-full bg-amber-400 animate-pulse" />
            <h3 className="text-sm font-extrabold text-slate-800">
              Pending Your Approval ({pendingApprovalPhotos.length})
            </h3>
            <span className="text-[10px] text-slate-500 font-medium">— Approve to share with client</span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {pendingApprovalPhotos.map(photo => (
              <PhotoApprovalCard key={photo.id} photo={photo} mode="pending" />
            ))}
          </div>
        </div>
      )}

      {/* Admin Approved Photos */}
      {approvedPhotos.length > 0 && (
        <div>
          <div className="flex items-center gap-2 mb-4">
            <CheckCircle2 className="w-4 h-4 text-emerald-500" />
            <h3 className="text-sm font-extrabold text-slate-800">
              Approved & Shared with Client ({approvedPhotos.length})
            </h3>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
            {approvedPhotos.map(photo => (
              <PhotoApprovalCard key={photo.id} photo={photo} mode="approved" />
            ))}
          </div>
        </div>
      )}

      {/* Empty state */}
      {totalPhotos === 0 && (
        <div className="text-center py-16 bg-slate-50 border border-slate-200 rounded-xl">
          <Camera className="w-12 h-12 text-slate-300 mx-auto mb-3" />
          <div className="font-bold text-slate-700">No photos uploaded yet</div>
          <div className="text-sm text-slate-500 mt-1">Site engineers will upload photos when tasks are completed.</div>
        </div>
      )}
    </div>
  )
}
