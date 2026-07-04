import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { redirect } from 'next/navigation'
import { formatDate } from '@/lib/utils'
import Image from 'next/image'
import { Camera, AlertCircle } from 'lucide-react'

export const dynamic = 'force-dynamic'

export default async function SitePhotosPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session?.user?.companyId) redirect('/login')
  const { id: siteId } = await params

  const pendingTasks = await prisma.projectChecklistTask.findMany({
    where: {
      category: { stage: { checklist: { siteId } } },
      OR: [ { status: 'COMPLETED' }, { isClientDone: true } ],
      sitePhotos: { none: {} }
    },
    include: { category: { include: { stage: true } } },
    orderBy: { updatedAt: 'desc' }
  })

  const photos = await prisma.sitePhoto.findMany({
    where: { siteId },
    include: { task: true },
    orderBy: { createdAt: 'desc' }
  })

  return (
    <div className="flex flex-col gap-6 mt-4 pb-12">
      <div className="flex flex-col gap-1">
        <h2 className="text-xl font-extrabold m-0 tracking-tight text-slate-900">Site Gallery</h2>
        <p className="text-slate-500 text-xs m-0">View all photos uploaded from the site, including task completions.</p>
      </div>

      {pendingTasks.length > 0 && (
        <div className="bg-red-50 border border-red-100 rounded-xl p-5 mb-2">
          <div className="flex items-center gap-2 mb-4">
            <AlertCircle className="w-5 h-5 text-red-600" />
            <h3 className="text-sm font-extrabold text-red-900 m-0">Pending Task Photos</h3>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {pendingTasks.map(task => (
              <div key={task.id} className="bg-white rounded-lg p-3 border border-red-100 flex items-center justify-between shadow-sm">
                <div>
                  <div className="text-xs font-bold text-slate-800">{task.name}</div>
                  <div className="text-[10px] text-slate-500 mt-0.5">{task.category.stage.name} / {task.category.name}</div>
                </div>
                <div className="text-[10px] uppercase font-bold text-red-500 bg-red-50 px-2 py-1 rounded">Missing Photo</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {photos.length === 0 ? (
        <div className="text-center py-16 bg-slate-50 border border-slate-200 rounded-xl">
          <Camera className="w-12 h-12 text-slate-300 mx-auto mb-3" />
          <div className="font-bold text-slate-700">No photos uploaded yet</div>
          <div className="text-sm text-slate-500 mt-1">Site engineers haven't uploaded any photos for this site.</div>
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
          {photos.map(photo => (
            <div key={photo.id} className="group relative bg-slate-100 rounded-xl overflow-hidden border border-slate-200 aspect-square">
              <Image 
                src={photo.secureUrl} 
                alt={photo.caption || 'Site Photo'} 
                fill 
                className="object-cover" 
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity"></div>
              <div className="absolute bottom-0 left-0 right-0 p-3 opacity-0 group-hover:opacity-100 transition-opacity text-white">
                {photo.task ? (
                  <div className="text-xs font-bold truncate">{photo.task.name}</div>
                ) : (
                  <div className="text-xs font-bold truncate">{photo.category || 'Site Update'}</div>
                )}
                <div className="text-[10px] opacity-80 mt-0.5">{formatDate(photo.createdAt)}</div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
