import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { redirect } from 'next/navigation'
import { Camera, CheckCircle2 } from 'lucide-react'
import { ClientPhotoApproveCard } from '@/components/client/ClientPhotoApproveCard'

export const dynamic = 'force-dynamic'

export default async function ClientPhotosPage() {
  const session = await auth()
  if (!session?.user) redirect('/login')

  const clientRecord = await prisma.client.findFirst({
    where: { email: session.user.email }
  })

  // Find their assigned site
  const site = await prisma.site.findFirst({
    where: clientRecord?.siteId
      ? { id: clientRecord.siteId, deletedAt: null }
      : { companyId: clientRecord?.companyId, deletedAt: null },
    orderBy: { createdAt: 'desc' }
  })

  if (!site) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] p-8 text-center">
        <Camera className="w-12 h-12 text-slate-300 mx-auto mb-3" />
        <h2 className="text-xl font-bold text-slate-800 mb-2">No project found</h2>
        <p className="text-sm text-slate-500">Contact your builder to get assigned to a project.</p>
      </div>
    )
  }

  // Only approved photos are visible to client
  const approvedPhotos = await prisma.sitePhoto.findMany({
    where: { siteId: site.id, approvedForClient: true },
    include: {
      task: {
        include: { category: { include: { stage: true } } }
      }
    },
    orderBy: { approvedAt: 'desc' }
  })

  const clientConfirmedCount = approvedPhotos.filter(p => p.task?.isClientDone).length
  const pendingClientApproval = approvedPhotos.filter(p => p.task && !p.task.isClientDone)
  const confirmedPhotos = approvedPhotos.filter(p => !p.task || p.task.isClientDone)

  return (
    <div className="p-4 md:p-8 max-w-5xl mx-auto space-y-8 pb-24 min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-gradient-to-br from-slate-900 via-slate-800 to-[#ea580c] text-white rounded-3xl p-6 shadow-xl relative overflow-hidden">
        <div className="absolute top-0 right-0 -mt-8 -mr-8 w-48 h-48 rounded-full bg-white/5 blur-3xl pointer-events-none" />
        <div className="relative z-10">
          <div className="flex items-center gap-2 mb-2">
            <Camera className="w-5 h-5 text-amber-400" />
            <span className="text-xs font-bold text-amber-300 uppercase tracking-wide">Site Gallery</span>
          </div>
          <h1 className="text-2xl font-extrabold text-white">{site.name}</h1>
          <p className="text-sm text-slate-300 mt-1">{approvedPhotos.length} approved photo{approvedPhotos.length !== 1 ? 's' : ''} from your site</p>
          <div className="flex gap-4 mt-4 pt-4 border-t border-white/10">
            <div>
              <div className="text-lg font-black text-white">{approvedPhotos.length}</div>
              <div className="text-[10px] text-slate-400 font-semibold">Total Shared</div>
            </div>
            <div>
              <div className="text-lg font-black text-amber-300">{pendingClientApproval.length}</div>
              <div className="text-[10px] text-slate-400 font-semibold">Pending Your Review</div>
            </div>
            <div>
              <div className="text-lg font-black text-emerald-300">{clientConfirmedCount}</div>
              <div className="text-[10px] text-slate-400 font-semibold">Confirmed by You</div>
            </div>
          </div>
        </div>
      </div>

      {/* Pending client review */}
      {pendingClientApproval.length > 0 && (
        <div>
          <div className="flex items-center gap-2 mb-4">
            <div className="w-2.5 h-2.5 rounded-full bg-amber-400 animate-pulse" />
            <h2 className="text-base font-extrabold text-slate-900">
              Awaiting Your Confirmation ({pendingClientApproval.length})
            </h2>
          </div>
          <p className="text-xs text-slate-500 -mt-2 mb-4">
            Your builder has shared these photos of completed tasks. Tap <strong>Confirm & Accept</strong> to mark each task as officially completed.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {pendingClientApproval.map(photo => (
              <ClientPhotoApproveCard key={photo.id} photo={photo as any} />
            ))}
          </div>
        </div>
      )}

      {/* Confirmed / all approved photos */}
      {confirmedPhotos.length > 0 && (
        <div>
          <div className="flex items-center gap-2 mb-4">
            <CheckCircle2 className="w-4 h-4 text-emerald-500" />
            <h2 className="text-base font-extrabold text-slate-900">
              Confirmed Photos ({confirmedPhotos.length})
            </h2>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
            {confirmedPhotos.map(photo => (
              <ClientPhotoApproveCard key={photo.id} photo={photo as any} confirmed />
            ))}
          </div>
        </div>
      )}

      {/* Empty state */}
      {approvedPhotos.length === 0 && (
        <div className="text-center py-16 bg-white rounded-2xl border border-gray-100 shadow-sm">
          <Camera className="w-12 h-12 text-slate-300 mx-auto mb-3" />
          <div className="font-bold text-slate-700">No approved photos yet</div>
          <div className="text-sm text-slate-500 mt-1 max-w-xs mx-auto">
            Your site team will upload photos as tasks are completed. Your builder will approve them before sharing here.
          </div>
        </div>
      )}
    </div>
  )
}
