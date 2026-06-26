import { requireUser } from '@/lib/auth/require-user'
import prisma from '@/lib/prisma'
import Link from 'next/link'
import { Camera, Calendar, Building2, Image as ImageIcon, Plus, Sparkles } from 'lucide-react'

export default async function MobileSitePhotoPage() {
  const user = await requireUser()

  const photos = user.companyId
    ? await prisma.sitePhoto.findMany({
        where: { companyId: user.companyId },
        include: { site: { select: { name: true } } },
        orderBy: { createdAt: 'desc' },
        take: 20,
      })
    : []

  function timeAgo(date: Date) {
    const seconds = Math.floor((new Date().getTime() - new Date(date).getTime()) / 1000)
    let interval = Math.floor(seconds / 31536000)
    if (interval >= 1) return `${interval}y ago`
    interval = Math.floor(seconds / 2592000)
    if (interval >= 1) return `${interval}mo ago`
    interval = Math.floor(seconds / 86400)
    if (interval >= 1) return `${interval}d ago`
    interval = Math.floor(seconds / 3600)
    if (interval >= 1) return `${interval}h ago`
    interval = Math.floor(seconds / 60)
    if (interval >= 1) return `${interval}m ago`
    return 'Just now'
  }

  return (
    <div className="min-h-screen bg-[#f2f5f8] pb-28">
      {/* HEADER WITH + CAMERA UPLOAD BUTTON */}
      <div className="bg-gradient-to-br from-[#0d3a63] via-[#13558e] to-[#1a64a6] text-white px-5 pt-6 pb-8 shadow-lg rounded-b-[28px]">
        <div className="flex items-center justify-between gap-3 flex-wrap mb-4">
          <div className="flex items-center gap-2 bg-white/10 backdrop-blur-md px-3 py-1 rounded-full border border-white/15 text-xs font-bold tracking-wider uppercase text-cyan-300">
            <Sparkles size={14} />
            <span>Visual Gallery</span>
          </div>

          <Link
            href="/mobile/upload-bill"
            className="flex items-center gap-1.5 px-4 py-2.5 bg-gradient-to-r from-amber-400 to-orange-500 hover:from-amber-500 hover:to-orange-600 active:scale-95 text-white font-black text-xs uppercase tracking-wider rounded-full shadow-lg shadow-orange-500/30 transition-all border border-white/20"
          >
            <Camera size={16} strokeWidth={2.5} />
            <span>+ Camera Upload</span>
          </Link>
        </div>

        <h1 className="text-[26px] font-black tracking-tight">Field Photo Feed</h1>
        <p className="text-sm text-white/80 font-medium mt-1">Real-time progress telemetry across all active worksites</p>
      </div>

      {/* PHOTO FEED GRID */}
      <div className="px-4 -mt-4">
        {photos.length === 0 ? (
          <div className="bg-white rounded-[24px] p-10 text-center border border-[#e4eaf0] shadow-sm">
            <div className="w-16 h-16 rounded-[20px] bg-[#f0f4f8] text-[#647387] flex items-center justify-center mx-auto mb-4">
              <ImageIcon size={32} />
            </div>
            <h3 className="text-lg font-black text-[#16273a]">No Site Photos Yet</h3>
            <p className="text-xs text-[#647387] font-medium mt-1 max-w-xs mx-auto leading-relaxed">
              Snap photos during site inspections or DPR submissions to populate your visual feed.
            </p>
            <Link
              href="/mobile/upload-bill"
              className="inline-flex items-center gap-2 mt-5 px-5 py-3 bg-[#13558e] text-white text-xs font-extrabold rounded-xl shadow-md transition-transform active:scale-95"
            >
              <Camera size={16} />
              <span>Take First Photo</span>
            </Link>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3.5">
            {photos.map((photo) => (
              <div
                key={photo.id}
                className="group bg-white rounded-[22px] overflow-hidden border border-[#e4eaf0] shadow-sm flex flex-col hover:shadow-md transition-all duration-200"
              >
                {/* IMAGE CONTAINER */}
                <div className="relative aspect-square w-full bg-[#f8fafc] overflow-hidden">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={photo.secureUrl}
                    alt={photo.caption || 'Site progress photo'}
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                    loading="lazy"
                  />
                  
                  {/* SITE BADGE OVERLAY */}
                  <div className="absolute top-2.5 left-2.5 right-2.5 flex justify-start pointer-events-none">
                    <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-[#0f172a]/80 backdrop-blur-md text-white text-[10.5px] font-extrabold rounded-lg shadow-sm truncate max-w-full">
                      <Building2 size={11} className="text-[#38bdf8] flex-shrink-0" />
                      <span className="truncate">{photo.site?.name ?? 'Site'}</span>
                    </span>
                  </div>

                  {/* CATEGORY TAG */}
                  {photo.category && (
                    <div className="absolute bottom-2.5 right-2.5 pointer-events-none">
                      <span className="px-2 py-0.5 bg-white/90 backdrop-blur-sm text-[#16273a] text-[9px] font-black uppercase tracking-wider rounded shadow-sm">
                        {photo.category}
                      </span>
                    </div>
                  )}
                </div>

                {/* METADATA CONTAINER */}
                <div className="p-3 flex-1 flex flex-col justify-between">
                  <p className="text-xs font-bold text-[#16273a] line-clamp-2 leading-snug">
                    {photo.caption || 'Field progress update'}
                  </p>
                  
                  <div className="flex items-center gap-1 text-[11px] font-semibold text-[#647387] mt-2 pt-2 border-t border-[#f0f4f8]">
                    <Calendar size={12} className="text-[#94a3b8] flex-shrink-0" />
                    <span>{timeAgo(photo.createdAt)}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
