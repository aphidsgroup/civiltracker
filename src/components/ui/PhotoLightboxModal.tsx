'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import {
  X,
  ChevronLeft,
  ChevronRight,
  ZoomIn,
  ZoomOut,
  RotateCcw,
  Download,
  ExternalLink,
  Check,
  CheckCircle2,
  Clock,
  Sparkles,
  Calendar,
  Layers,
  MapPin
} from 'lucide-react'

export interface LightboxPhoto {
  id: string
  url: string
  title?: string | null
  subtitle?: string | null
  caption?: string | null
  date?: string | Date | null
  category?: string | null
  status?: string | null
  statusType?: 'pending' | 'approved' | 'confirmed' | 'review' | 'default'
  task?: {
    id?: string
    name?: string
    stageName?: string
    categoryName?: string
    isClientDone?: boolean
  } | null
}

interface PhotoLightboxModalProps {
  photos: LightboxPhoto[]
  initialIndex?: number
  isOpen: boolean
  onClose: () => void
  onApprove?: (photoId: string) => Promise<void> | void
  onReject?: (photoId: string) => Promise<void> | void
  onClientConfirm?: (photoId: string) => Promise<void> | void
}

export default function PhotoLightboxModal({
  photos,
  initialIndex = 0,
  isOpen,
  onClose,
  onApprove,
  onReject,
  onClientConfirm,
}: PhotoLightboxModalProps) {
  const [currentIndex, setCurrentIndex] = useState(initialIndex)
  const [zoomLevel, setZoomLevel] = useState(1)
  const [actionLoading, setActionLoading] = useState<string | null>(null)
  const touchStartX = useRef<number | null>(null)
  const touchStartY = useRef<number | null>(null)

  // Keep currentIndex in sync when initialIndex changes or photos change
  useEffect(() => {
    if (isOpen) {
      setCurrentIndex(Math.max(0, Math.min(initialIndex, photos.length - 1)))
      setZoomLevel(1)
    }
  }, [isOpen, initialIndex, photos.length])

  // Reset zoom on photo change
  useEffect(() => {
    setZoomLevel(1)
  }, [currentIndex])

  // Prevent background scrolling while open
  useEffect(() => {
    if (isOpen) {
      const originalStyle = document.body.style.overflow
      document.body.style.overflow = 'hidden'
      return () => {
        document.body.style.overflow = originalStyle
      }
    }
  }, [isOpen])

  const currentPhoto = photos[currentIndex]

  const handlePrev = useCallback(() => {
    if (photos.length <= 1) return
    setCurrentIndex((prev) => (prev > 0 ? prev - 1 : photos.length - 1))
  }, [photos.length])

  const handleNext = useCallback(() => {
    if (photos.length <= 1) return
    setCurrentIndex((prev) => (prev < photos.length - 1 ? prev + 1 : 0))
  }, [photos.length])

  // Keyboard navigation
  useEffect(() => {
    if (!isOpen) return

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose()
      } else if (e.key === 'ArrowLeft') {
        handlePrev()
      } else if (e.key === 'ArrowRight') {
        handleNext()
      } else if (e.key === '+' || e.key === '=') {
        setZoomLevel((z) => Math.min(z + 0.5, 3))
      } else if (e.key === '-') {
        setZoomLevel((z) => Math.max(z - 0.5, 1))
      } else if (e.key === '0') {
        setZoomLevel(1)
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isOpen, handleNext, handlePrev, onClose])

  // Touch swipe support
  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX
    touchStartY.current = e.touches[0].clientY
  }

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (touchStartX.current === null || touchStartY.current === null) return

    const diffX = touchStartX.current - e.changedTouches[0].clientX
    const diffY = touchStartY.current - e.changedTouches[0].clientY

    // Horizontal swipe if larger than vertical and threshold is met
    if (Math.abs(diffX) > Math.abs(diffY) && Math.abs(diffX) > 40) {
      if (diffX > 0) {
        handleNext()
      } else {
        handlePrev()
      }
    } else if (diffY < -80 && Math.abs(diffX) < 40 && zoomLevel === 1) {
      // Swipe down to close
      onClose()
    }

    touchStartX.current = null
    touchStartY.current = null
  }

  const toggleZoom = () => {
    setZoomLevel((prev) => (prev === 1 ? 2 : 1))
  }

  const handleDownload = async () => {
    if (!currentPhoto?.url) return
    try {
      const response = await fetch(currentPhoto.url)
      const blob = await response.blob()
      const blobUrl = window.URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = blobUrl
      const ext = currentPhoto.url.split('.').pop()?.split('?')[0] || 'jpg'
      a.download = `site-photo-${currentPhoto.id}.${ext}`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      window.URL.revokeObjectURL(blobUrl)
    } catch {
      window.open(currentPhoto.url, '_blank')
    }
  }

  if (!isOpen || !currentPhoto) return null

  const formattedDate = currentPhoto.date
    ? typeof currentPhoto.date === 'string'
      ? currentPhoto.date
      : new Date(currentPhoto.date).toLocaleDateString('en-IN', {
          day: 'numeric',
          month: 'short',
          year: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
        })
    : null

  const displayTitle =
    currentPhoto.title ||
    currentPhoto.task?.name ||
    currentPhoto.caption ||
    'Site Photo'

  const displaySubtitle =
    currentPhoto.subtitle ||
    (currentPhoto.task?.stageName
      ? `${currentPhoto.task.stageName}${currentPhoto.task.categoryName ? ` · ${currentPhoto.task.categoryName}` : ''}`
      : currentPhoto.category || null)

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-[100] flex flex-col bg-black/95 text-white select-none backdrop-blur-md transition-opacity duration-200"
    >
      {/* Top Header Bar */}
      <div className="flex items-center justify-between px-4 py-3 bg-black/50 border-b border-white/10 z-20">
        <div className="flex items-center gap-3 min-w-0 flex-1">
          <span className="px-2.5 py-1 rounded-full bg-white/10 text-xs font-bold text-slate-300 font-mono flex-shrink-0">
            {currentIndex + 1} / {photos.length}
          </span>
          <div className="min-w-0">
            <h3 className="text-sm font-bold text-white truncate m-0">
              {displayTitle}
            </h3>
            {displaySubtitle && (
              <p className="text-[11px] text-slate-400 font-medium truncate m-0">
                {displaySubtitle}
              </p>
            )}
          </div>
        </div>

        {/* Action Controls */}
        <div className="flex items-center gap-1.5 sm:gap-2 flex-shrink-0 ml-2">
          {/* Zoom controls */}
          <div className="hidden sm:flex items-center gap-1 bg-white/10 rounded-xl p-1">
            <button
              type="button"
              onClick={() => setZoomLevel((z) => Math.max(z - 0.5, 1))}
              disabled={zoomLevel <= 1}
              className="p-1.5 text-slate-300 hover:text-white hover:bg-white/10 rounded-lg disabled:opacity-30 transition-all cursor-pointer border-none bg-transparent"
              title="Zoom out (-)"
            >
              <ZoomOut size={16} />
            </button>
            <span className="text-[11px] font-mono px-1 text-slate-300 min-w-[38px] text-center">
              {Math.round(zoomLevel * 100)}%
            </span>
            <button
              type="button"
              onClick={() => setZoomLevel((z) => Math.min(z + 0.5, 3))}
              disabled={zoomLevel >= 3}
              className="p-1.5 text-slate-300 hover:text-white hover:bg-white/10 rounded-lg disabled:opacity-30 transition-all cursor-pointer border-none bg-transparent"
              title="Zoom in (+)"
            >
              <ZoomIn size={16} />
            </button>
            {zoomLevel > 1 && (
              <button
                type="button"
                onClick={() => setZoomLevel(1)}
                className="p-1.5 text-amber-400 hover:bg-white/10 rounded-lg transition-all cursor-pointer border-none bg-transparent"
                title="Reset zoom"
              >
                <RotateCcw size={14} />
              </button>
            )}
          </div>

          {/* Download button */}
          <button
            type="button"
            onClick={handleDownload}
            className="p-2 rounded-xl bg-white/10 hover:bg-white/20 text-slate-200 hover:text-white transition-all cursor-pointer border-none"
            title="Download full picture"
          >
            <Download size={18} />
          </button>

          {/* Open full original */}
          <a
            href={currentPhoto.url}
            target="_blank"
            rel="noopener noreferrer"
            className="p-2 rounded-xl bg-white/10 hover:bg-white/20 text-slate-200 hover:text-white transition-all inline-flex items-center justify-center"
            title="Open original image in new tab"
          >
            <ExternalLink size={18} />
          </a>

          {/* Close button */}
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-xl bg-white/15 hover:bg-rose-600 text-white transition-all cursor-pointer border-none ml-1 shadow-md"
            title="Close gallery (Esc)"
          >
            <X size={20} />
          </button>
        </div>
      </div>

      {/* Main Viewport */}
      <div
        className="flex-1 relative flex items-center justify-center overflow-hidden p-2 sm:p-6"
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
      >
        {/* Navigation Arrows */}
        {photos.length > 1 && (
          <>
            <button
              type="button"
              onClick={handlePrev}
              className="absolute left-2 sm:left-6 z-20 w-11 h-11 sm:w-13 sm:h-13 rounded-full bg-black/60 hover:bg-black/85 active:scale-95 text-white flex items-center justify-center border border-white/20 backdrop-blur-md shadow-2xl transition-all cursor-pointer"
              title="Previous photo (Left arrow)"
            >
              <ChevronLeft size={26} strokeWidth={2.5} />
            </button>
            <button
              type="button"
              onClick={handleNext}
              className="absolute right-2 sm:right-6 z-20 w-11 h-11 sm:w-13 sm:h-13 rounded-full bg-black/60 hover:bg-black/85 active:scale-95 text-white flex items-center justify-center border border-white/20 backdrop-blur-md shadow-2xl transition-all cursor-pointer"
              title="Next photo (Right arrow)"
            >
              <ChevronRight size={26} strokeWidth={2.5} />
            </button>
          </>
        )}

        {/* Central Image Container */}
        <div
          className={`relative max-w-full max-h-full flex items-center justify-center transition-all ${
            zoomLevel > 1 ? 'overflow-auto cursor-grab active:cursor-grabbing' : 'cursor-zoom-in'
          }`}
          onClick={() => {
            if (zoomLevel === 1) toggleZoom()
          }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            key={currentPhoto.id}
            src={currentPhoto.url}
            alt={displayTitle}
            style={{
              transform: `scale(${zoomLevel})`,
              transformOrigin: 'center center',
            }}
            className="max-h-[75vh] max-w-[92vw] object-contain rounded-xl shadow-2xl transition-transform duration-200"
          />
        </div>
      </div>

      {/* Bottom Metadata & Thumbnails Bar */}
      <div className="bg-black/70 border-t border-white/10 p-3 sm:p-4 z-20 flex flex-col gap-3">
        <div className="max-w-4xl mx-auto w-full flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          {/* Metadata */}
          <div className="flex flex-wrap items-center gap-2 sm:gap-3 text-xs">
            {currentPhoto.statusType === 'approved' && (
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-500/20 text-emerald-300 font-bold border border-emerald-500/30">
                <CheckCircle2 size={13} className="text-emerald-400" />
                Approved for Client
              </span>
            )}
            {currentPhoto.statusType === 'pending' && (
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-500/20 text-amber-300 font-bold border border-amber-500/30">
                <Clock size={13} className="text-amber-400" />
                Pending Admin Approval
              </span>
            )}
            {currentPhoto.statusType === 'review' && (
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-500/20 text-amber-300 font-bold border border-amber-500/30">
                <Sparkles size={13} className="text-amber-400" />
                Awaiting Your Review
              </span>
            )}
            {currentPhoto.statusType === 'confirmed' && (
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-500/20 text-emerald-300 font-bold border border-emerald-500/30">
                <Check size={13} className="text-emerald-400" />
                Confirmed by Client
              </span>
            )}

            {currentPhoto.category && (
              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-white/10 text-slate-300 font-semibold text-[11px]">
                <Layers size={11} className="text-[#fc6e20]" />
                {currentPhoto.category}
              </span>
            )}

            {formattedDate && (
              <span className="inline-flex items-center gap-1 text-slate-400 text-[11px] font-medium">
                <Calendar size={11} />
                {formattedDate}
              </span>
            )}
          </div>

          {/* Interactive Actions (Approve, Reject, Confirm) */}
          <div className="flex items-center gap-2">
            {onApprove && currentPhoto.statusType === 'pending' && (
              <button
                type="button"
                disabled={actionLoading === currentPhoto.id}
                onClick={async () => {
                  setActionLoading(currentPhoto.id)
                  try {
                    await onApprove(currentPhoto.id)
                  } finally {
                    setActionLoading(null)
                  }
                }}
                className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs flex items-center gap-1.5 shadow-md transition-all cursor-pointer border-none disabled:opacity-50"
              >
                <Check size={14} strokeWidth={2.5} />
                <span>Approve for Client</span>
              </button>
            )}

            {onReject && currentPhoto.statusType === 'pending' && (
              <button
                type="button"
                disabled={actionLoading === currentPhoto.id}
                onClick={async () => {
                  setActionLoading(currentPhoto.id)
                  try {
                    await onReject(currentPhoto.id)
                  } finally {
                    setActionLoading(null)
                  }
                }}
                className="px-3 py-2 rounded-xl bg-white/10 hover:bg-rose-600/80 text-rose-300 hover:text-white font-bold text-xs flex items-center gap-1.5 transition-all cursor-pointer border border-rose-500/20 disabled:opacity-50"
              >
                <span>Reject</span>
              </button>
            )}

            {onClientConfirm && currentPhoto.statusType === 'review' && (
              <button
                type="button"
                disabled={actionLoading === currentPhoto.id}
                onClick={async () => {
                  setActionLoading(currentPhoto.id)
                  try {
                    await onClientConfirm(currentPhoto.id)
                  } finally {
                    setActionLoading(null)
                  }
                }}
                className="px-4 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-600 text-white font-bold text-xs flex items-center gap-1.5 shadow-md transition-all cursor-pointer border-none disabled:opacity-50"
              >
                <Check size={14} strokeWidth={3} />
                <span>Confirm & Accept Task</span>
              </button>
            )}
          </div>
        </div>

        {/* Thumbnail Filmstrip (shows when multiple photos exist) */}
        {photos.length > 1 && (
          <div className="max-w-4xl mx-auto w-full overflow-x-auto scrollbar-thin scrollbar-thumb-white/20 pt-1 pb-1 flex items-center gap-2">
            {photos.map((p, idx) => {
              const isSelected = idx === currentIndex
              return (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => setCurrentIndex(idx)}
                  className={`relative w-14 h-11 sm:w-16 sm:h-12 rounded-lg overflow-hidden flex-shrink-0 transition-all cursor-pointer border-2 p-0 bg-black ${
                    isSelected
                      ? 'border-[#fc6e20] ring-2 ring-[#fc6e20]/40 scale-105'
                      : 'border-white/20 opacity-50 hover:opacity-100 hover:border-white/50'
                  }`}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={p.url} alt={p.title || 'thumbnail'} className="w-full h-full object-cover" />
                </button>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
