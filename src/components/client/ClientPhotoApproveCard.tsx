'use client'

import { useState } from 'react'
import Image from 'next/image'
import { CheckCircle2, Loader2, Check, Maximize2 } from 'lucide-react'
import { clientApproveTaskPhoto } from '@/actions/checklists'
import PhotoLightboxModal, { LightboxPhoto } from '@/components/ui/PhotoLightboxModal'

interface Photo {
  id: string
  secureUrl: string
  caption: string | null
  category: string | null
  createdAt: Date
  approvedAt: Date | null
  task?: {
    id: string
    name: string
    isClientDone: boolean
    category?: {
      name: string
      stage?: { name: string }
    }
  } | null
}

interface Props {
  photo: Photo
  confirmed?: boolean
  allPhotos?: Photo[]
  photoIndex?: number
}

export function ClientPhotoApproveCard({ photo, confirmed = false, allPhotos, photoIndex }: Props) {
  const [loading, setLoading] = useState(false)
  const [done, setDone] = useState(false)
  const [lightboxOpen, setLightboxOpen] = useState(false)

  const handleConfirm = async () => {
    setLoading(true)
    try {
      await clientApproveTaskPhoto(photo.id)
      setDone(true)
    } finally {
      setLoading(false)
    }
  }

  const isConfirmed = confirmed || done || photo.task?.isClientDone

  const photosList = allPhotos && allPhotos.length > 0 ? allPhotos : [photo]
  const lightboxPhotos: LightboxPhoto[] = photosList.map((p) => {
    const pConfirmed = confirmed || (p.id === photo.id && isConfirmed) || p.task?.isClientDone
    return {
      id: p.id,
      url: p.secureUrl,
      title: p.task?.name || p.caption || 'Site Photo',
      subtitle: p.task?.category?.stage?.name
        ? `${p.task.category.stage.name} · ${p.task.category.name || ''}`
        : p.category || 'Site Update',
      date: p.approvedAt || p.createdAt,
      category: p.category || undefined,
      status: pConfirmed ? 'Confirmed' : 'Awaiting Review',
      statusType: pConfirmed ? 'confirmed' : 'review',
      task: p.task
        ? {
            id: p.task.id,
            name: p.task.name,
            stageName: p.task.category?.stage?.name,
            categoryName: p.task.category?.name,
            isClientDone: pConfirmed,
          }
        : null,
    }
  })

  return (
    <div className={`rounded-2xl overflow-hidden border shadow-sm bg-white flex flex-col transition-all ${isConfirmed ? 'border-emerald-200' : 'border-amber-200 ring-1 ring-amber-200'}`}>
      {/* Photo with Click-to-View Gallery Overlay */}
      <div
        onClick={() => setLightboxOpen(true)}
        className="relative aspect-[4/3] bg-slate-100 cursor-pointer group/photo overflow-hidden"
      >
        <Image
          src={photo.secureUrl}
          alt={photo.caption || 'Site photo'}
          fill
          className="object-cover group-hover/photo:scale-105 transition-transform duration-300"
          sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw"
        />

        {/* Hover / Tap Prompt */}
        <div className="absolute inset-0 bg-black/35 opacity-0 group-hover/photo:opacity-100 transition-opacity flex items-center justify-center gap-1.5 text-white font-bold text-xs backdrop-blur-[2px] z-10">
          <div className="px-2.5 py-1 rounded-full bg-white/25 backdrop-blur-md flex items-center gap-1.5 shadow-lg border border-white/20">
            <Maximize2 size={13} />
            <span>View Full</span>
          </div>
        </div>

        {/* Status overlay */}
        {isConfirmed && (
          <div className="absolute inset-0 bg-emerald-500/10 flex items-start justify-end p-2 pointer-events-none z-10">
            <div className="bg-emerald-500 rounded-full p-1 shadow">
              <Check className="w-3.5 h-3.5 text-white stroke-[3]" />
            </div>
          </div>
        )}
        {!isConfirmed && (
          <div className="absolute top-2 left-2 bg-amber-500 text-white text-[9px] font-black uppercase px-2 py-0.5 rounded-full tracking-wide z-10 shadow-xs">
            Review
          </div>
        )}
      </div>

      {/* Info + Action */}
      <div className="p-3 flex flex-col gap-2">
        {photo.task && (
          <div>
            <div className="text-xs font-bold text-slate-800 line-clamp-2">{photo.task.name}</div>
            {photo.task.category && (
              <div className="text-[10px] text-slate-400 mt-0.5 line-clamp-1">
                {photo.task.category.stage?.name} · {photo.task.category.name}
              </div>
            )}
          </div>
        )}
        {!photo.task && (
          <div className="text-xs font-semibold text-slate-600">{photo.caption || photo.category || 'Site update'}</div>
        )}
        <div className="text-[10px] text-slate-400">
          {new Date(photo.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
        </div>

        {/* Confirm button — only for task photos not yet confirmed */}
        {!isConfirmed && photo.task && (
          <button
            onClick={handleConfirm}
            disabled={loading}
            className="w-full mt-1 py-2.5 bg-emerald-500 hover:bg-emerald-600 active:bg-emerald-700 text-white font-black text-xs rounded-xl flex items-center justify-center gap-1.5 transition-colors disabled:opacity-60 shadow-sm"
          >
            {loading ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <CheckCircle2 className="w-3.5 h-3.5" />
            )}
            {loading ? 'Confirming...' : 'Confirm & Accept'}
          </button>
        )}

        {isConfirmed && photo.task && (
          <div className="flex items-center gap-1.5 pt-1">
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 flex-shrink-0" />
            <span className="text-[10px] text-emerald-600 font-bold">Task confirmed by you</span>
          </div>
        )}
      </div>

      {/* Lightbox Gallery Modal */}
      {lightboxOpen && (
        <PhotoLightboxModal
          photos={lightboxPhotos}
          initialIndex={photoIndex ?? 0}
          isOpen={lightboxOpen}
          onClose={() => setLightboxOpen(false)}
          onClientConfirm={!isConfirmed && photo.task ? handleConfirm : undefined}
        />
      )}
    </div>
  )
}
