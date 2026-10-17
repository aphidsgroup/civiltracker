'use client'

import { useState } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { Check, ChevronRight, Maximize2, Camera } from 'lucide-react'
import PhotoLightboxModal, { LightboxPhoto } from '@/components/ui/PhotoLightboxModal'

interface PhotoItem {
  id: string
  secureUrl: string
  caption?: string | null
  category?: string | null
  createdAt: Date | string
  approvedAt?: Date | string | null
  task?: {
    id: string
    name: string
    category?: {
      name: string
      stage?: { name: string }
    } | null
  } | null
}

interface Props {
  photos: PhotoItem[]
  totalCount?: number
}

export default function ClientLatestPhotosGallery({ photos, totalCount }: Props) {
  const [lightboxOpen, setLightboxOpen] = useState(false)
  const [selectedIndex, setSelectedIndex] = useState(0)

  const count = totalCount ?? photos.length

  const lightboxPhotos: LightboxPhoto[] = photos.map((p) => ({
    id: p.id,
    url: p.secureUrl,
    title: p.task?.name || p.caption || 'Site Photo',
    subtitle: p.task?.category?.stage?.name
      ? `${p.task.category.stage.name} · ${p.task.category.name || ''}`
      : p.category || 'Site Update',
    date: p.approvedAt || p.createdAt,
    category: p.category || undefined,
    status: 'Approved & Shared',
    statusType: 'approved',
    task: p.task
      ? {
          id: p.task.id,
          name: p.task.name,
          stageName: p.task.category?.stage?.name,
          categoryName: p.task.category?.name,
        }
      : null,
  }))

  const handleOpenPhoto = (index: number) => {
    setSelectedIndex(index)
    setLightboxOpen(true)
  }

  if (photos.length === 0) {
    return (
      <div className="bg-white rounded-3xl border border-gray-100 shadow-sm p-6 md:p-8">
        <div className="flex justify-between items-center mb-4">
          <div>
            <h2 className="text-lg font-bold text-gray-900">Latest approved photos</h2>
            <p className="text-xs text-gray-500">Shared by your site team</p>
          </div>
          <Link
            href="/client-portal/photos"
            className="text-xs font-bold text-amber-600 hover:text-amber-700 inline-flex items-center gap-1"
          >
            <span>View all</span>
            <ChevronRight className="w-4 h-4" />
          </Link>
        </div>
        <div className="text-center py-10 bg-slate-50/60 rounded-2xl border border-slate-100">
          <Camera className="w-10 h-10 text-slate-300 mx-auto mb-2" />
          <div className="text-xs font-bold text-slate-600">No approved photos yet</div>
          <div className="text-[11px] text-slate-400 mt-0.5">
            Photos will appear here as your project advances.
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="bg-white rounded-3xl border border-gray-100 shadow-sm p-6 md:p-8">
      {/* Header */}
      <div className="flex justify-between items-center mb-6">
        <div>
          <h2 className="text-lg font-bold text-gray-900">Latest approved photos</h2>
          <p className="text-xs text-gray-500">
            Shared by your site team · {count} photo{count !== 1 ? 's' : ''} available
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => handleOpenPhoto(0)}
            className="hidden sm:inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-amber-50 text-amber-700 hover:bg-amber-100 text-xs font-bold transition-colors cursor-pointer border-none"
          >
            <Maximize2 size={13} />
            <span>Launch Gallery</span>
          </button>
          <Link
            href="/client-portal/photos"
            className="text-xs font-bold text-amber-600 hover:text-amber-700 inline-flex items-center gap-1"
          >
            <span>View all</span>
            <ChevronRight className="w-4 h-4" />
          </Link>
        </div>
      </div>

      {/* Grid of latest photos */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {photos.slice(0, 6).map((p, idx) => (
          <div
            key={p.id}
            onClick={() => handleOpenPhoto(idx)}
            className="group rounded-2xl overflow-hidden border border-gray-100 shadow-xs hover:shadow-md bg-gray-50 flex flex-col cursor-pointer transition-all duration-200 hover:-translate-y-0.5"
          >
            {/* Image Box */}
            <div className="aspect-[4/3] w-full relative bg-slate-100 overflow-hidden">
              <Image
                src={p.secureUrl}
                alt={p.task?.name || p.caption || 'Site photo'}
                fill
                className="object-cover group-hover:scale-105 transition-transform duration-300"
                sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
              />

              {/* Status Badge */}
              <div className="absolute top-2.5 left-2.5 bg-black/65 backdrop-blur-md text-white px-2.5 py-1 rounded-full text-[10px] font-bold flex items-center gap-1 z-10 shadow-xs">
                <Check className="w-3 h-3 text-emerald-400 stroke-[3]" />
                <span>Approved</span>
              </div>

              {/* Hover / Tap Full View Prompt */}
              <div className="absolute inset-0 bg-black/35 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-1.5 text-white font-bold text-xs backdrop-blur-[2px] z-10">
                <div className="px-3 py-1.5 rounded-full bg-white/25 backdrop-blur-md flex items-center gap-1.5 shadow-lg border border-white/20">
                  <Maximize2 size={14} />
                  <span>View Full Photo</span>
                </div>
              </div>
            </div>

            {/* Info */}
            <div className="p-3.5 bg-white flex-1 flex flex-col justify-between">
              <div>
                <div className="text-xs font-bold text-gray-800 line-clamp-1 group-hover:text-amber-600 transition-colors">
                  {p.task?.name || p.caption || 'Site progress update'}
                </div>
                {p.task?.category && (
                  <div className="text-[10px] text-gray-400 mt-0.5 line-clamp-1">
                    {p.task.category.stage?.name} · {p.task.category.name}
                  </div>
                )}
              </div>

              <div className="text-[10px] text-gray-400 font-medium mt-2 pt-2 border-t border-gray-50 flex items-center justify-between">
                <span>
                  {p.approvedAt
                    ? new Date(p.approvedAt).toLocaleDateString('en-IN', {
                        day: 'numeric',
                        month: 'short',
                        year: 'numeric',
                      })
                    : new Date(p.createdAt).toLocaleDateString('en-IN', {
                        day: 'numeric',
                        month: 'short',
                        year: 'numeric',
                      })}
                </span>
                <span className="text-amber-600 font-bold text-[10.5px]">Open &rarr;</span>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Lightbox Gallery Modal */}
      {lightboxOpen && (
        <PhotoLightboxModal
          photos={lightboxPhotos}
          initialIndex={selectedIndex}
          isOpen={lightboxOpen}
          onClose={() => setLightboxOpen(false)}
        />
      )}
    </div>
  )
}
