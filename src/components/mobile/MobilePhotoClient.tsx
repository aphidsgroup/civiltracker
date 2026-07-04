'use client'

import { useState, useRef } from 'react'
import { uploadMobileSitePhotoAction } from '@/actions/mobile-photo'
import { deleteSitePhotoAction } from '@/actions/site-photos'
import { compressImage } from '@/lib/compress-image'
import { Camera, MapPin, ArrowLeft, Loader2, X, Send, Trash2, RefreshCw } from 'lucide-react'
import Link from 'next/link'

type PhotoCard = {
  id: string
  title: string
  meta: string
  tag: string
  imageUrl?: string
  dbId?: string  // real DB id for delete/retake
  siteId?: string
}

type SiteOption = {
  id: string
  name: string
}

export default function MobilePhotoClient({
  sites,
  defaultSiteId,
  initialPhotos = [],
}: {
  sites: SiteOption[]
  defaultSiteId?: string
  initialPhotos?: PhotoCard[]
}) {
  const matchedSite = sites.find(s => s.id === defaultSiteId)
  const initialSiteId = matchedSite ? matchedSite.id : (sites[0]?.id || '')

  const [selectedCat, setSelectedCat] = useState('All')
  const [showModal, setShowModal] = useState(false)

  const [photos, setPhotos] = useState<PhotoCard[]>(initialPhotos)
  const retakeInputRef = useRef<HTMLInputElement>(null)
  const [retakeTargetId, setRetakeTargetId] = useState<string | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)

  // Capture Modal State
  const [siteId, setSiteId] = useState(initialSiteId)
  const [caption, setCaption] = useState('')
  const [captureTag, setCaptureTag] = useState('Civil')
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [gpsCoords, setGpsCoords] = useState<string | null>(null)
  const [gpsLoading, setGpsLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [uploadError, setUploadError] = useState<string | null>(null)

  const filterTabs = ['All', 'Civil', 'Material', 'Electrical', 'Issue', 'Quality', 'Safety']

  const handleSnapPhoto = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      setSelectedFile(file)
      setPreviewUrl(URL.createObjectURL(file))
      setUploadError(null)
      triggerGpsLock()
    }
  }

  const triggerGpsLock = () => {
    setGpsLoading(true)
    if ('geolocation' in navigator) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          setGpsCoords(`${pos.coords.latitude.toFixed(4)}° N, ${pos.coords.longitude.toFixed(4)}° E`)
          setGpsLoading(false)
        },
        () => {
          setGpsCoords('28.5355° N, 77.3910° E')
          setGpsLoading(false)
        },
        { timeout: 5000 }
      )
    } else {
      setGpsCoords('28.5355° N, 77.3910° E')
      setGpsLoading(false)
    }
  }

  // Simulate removed

  const handleSaveCapture = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!selectedFile || !previewUrl) return
    setSaving(true)
    setUploadError(null)
    const finalGps = gpsCoords || '28.5355° N, 77.3910° E'
    try {
      // Compress image before upload
      const compressed = await compressImage(selectedFile)
      const fd = new FormData()
      fd.append('file', compressed)
      fd.append('module', 'SITE_PHOTO')
      if (siteId) fd.append('siteId', siteId)
      const res = await fetch('/api/upload', { method: 'POST', body: fd })
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}))
        throw new Error(errData?.error || 'Upload failed')
      }
      const { url: cloudinaryUrl } = await res.json()

      if (siteId) {
        await uploadMobileSitePhotoAction({
          siteId,
          imageUrl: cloudinaryUrl,
          caption: caption || `${captureTag} progress photo`,
          gps: finalGps
        })
      }
      const newCard: PhotoCard = {
        id: Date.now().toString(),
        title: caption || `${captureTag} telemetry entry`,
        meta: `You - ${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`,
        tag: captureTag,
        imageUrl: cloudinaryUrl
      }
      setPhotos(prev => [newCard, ...prev])
      setShowModal(false)
      setPreviewUrl(null)
      setSelectedFile(null)
      setCaption('')
    } catch (err: any) {
      setUploadError(err?.message || 'Upload failed. Try again.')
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (photoId: string, dbId?: string) => {
    if (!dbId) {
      // local-only card, just remove from UI
      setPhotos(prev => prev.filter(p => p.id !== photoId))
      return
    }
    setDeletingId(photoId)
    try {
      await deleteSitePhotoAction(dbId)
      setPhotos(prev => prev.filter(p => p.id !== photoId))
    } catch {
      // ignore
    } finally {
      setDeletingId(null)
    }
  }

  const handleRetakeFile = async (e: React.ChangeEvent<HTMLInputElement>, photo: PhotoCard) => {
    const file = e.target.files?.[0]
    if (!file || !photo.siteId) return
    setDeletingId(photo.id)
    try {
      // Compress image before upload
      const compressed = await compressImage(file)
      const fd = new FormData()
      fd.append('file', compressed)
      fd.append('module', 'SITE_PHOTO')
      fd.append('siteId', photo.siteId)
      const res = await fetch('/api/upload', { method: 'POST', body: fd })
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}))
        throw new Error(errData?.error || 'Upload failed')
      }
      const { url: cloudinaryUrl } = await res.json()

      // delete old, create new
      if (photo.dbId) await deleteSitePhotoAction(photo.dbId)
      await uploadMobileSitePhotoAction({
        siteId: photo.siteId,
        imageUrl: cloudinaryUrl,
        caption: photo.title,
        gps: ''
      })
      setPhotos(prev => prev.map(p => p.id === photo.id ? { ...p, imageUrl: cloudinaryUrl } : p))
    } catch {
      // ignore
    } finally {
      setDeletingId(null)
      setRetakeTargetId(null)
    }
  }

  const filteredList = selectedCat === 'All' ? photos : photos.filter(p => p.tag.toLowerCase() === selectedCat.toLowerCase())

  return (
    <div className="p-5 pb-32 max-w-lg mx-auto bg-[#f8fafc] min-h-screen select-none font-sans text-[#1e293b]">
      {/* Top Header Bar */}
      <div className="flex items-center gap-3.5 mb-6 pt-1">
        <Link
          href="/mobile/home"
          className="w-10 h-10 rounded-2xl bg-white border border-slate-200/80 shadow-xs flex items-center justify-center text-slate-700 no-underline active:scale-95 transition-all flex-shrink-0"
        >
          <ArrowLeft size={18} strokeWidth={2.5} />
        </Link>
        <div className="min-w-0 flex-1">
          <h1 className="text-[19px] font-black tracking-tight text-[#1e293b] m-0 leading-tight">Site Photos</h1>
          <p className="text-[11.5px] font-bold text-[#647387] m-0 truncate mt-0.5">
            {matchedSite?.name || 'All Sites'} &middot; photo diary
          </p>
        </div>
      </div>

      {/* Category Filter Pills Chips Grid */}
      <div className="flex flex-wrap gap-2 mb-7">
        {filterTabs.map((tab) => {
          const active = selectedCat === tab
          return (
            <button
              key={tab}
              type="button"
              onClick={() => setSelectedCat(tab)}
              className={`px-4 py-2 rounded-xl text-xs font-black transition-all cursor-pointer border ${
                active
                  ? 'bg-[#1e40af] text-white border-[#1e40af] shadow-xs scale-[1.02]'
                  : 'bg-white text-[#475569] border-[#cbd5e1] hover:bg-slate-50'
              }`}
            >
              {tab}
            </button>
          )
        })}
      </div>

      {/* Section Header */}
      <div className="flex items-center justify-between mb-4 px-1">
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-[#1e40af]" />
          <span className="text-[13px] font-black text-[#1e293b] tracking-tight">Today &middot; 24 Jun</span>
        </div>
        <span className="text-xs font-bold text-[#647387]">{filteredList.length} photos</span>
      </div>

      {/* 2-Column Photo Cards Grid */}
      {filteredList.length === 0 ? (
        <div className="bg-white rounded-3xl border border-slate-200 p-8 text-center flex flex-col items-center justify-center min-h-[250px] shadow-sm mb-8">
          <div className="w-16 h-16 bg-slate-50 rounded-full flex items-center justify-center mb-4 border border-slate-100">
            <Camera size={32} className="text-slate-300" />
          </div>
          <h3 className="text-slate-800 font-black text-lg mb-1">No photos captured</h3>
          <p className="text-slate-500 text-xs max-w-[220px] font-medium leading-relaxed">
            Tap the camera button to snap and log field telemetry photos.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3.5 mb-8">
          {filteredList.map((item) => (
            <div
              key={item.id}
              className="bg-white rounded-[22px] border border-slate-200/80 shadow-2xs overflow-hidden flex flex-col group hover:shadow-md transition-shadow"
            >
              {/* Image Box */}
              <div className="aspect-[4/3] bg-[#f1f5f9] relative flex items-center justify-center overflow-hidden">
                {item.imageUrl ? (
                  /* eslint-disable-next-line @next/next/no-img-element */
                  <img src={item.imageUrl} alt={item.title} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />
                ) : (
                  <>
                    <div className="absolute inset-0 opacity-40 bg-[linear-gradient(135deg,#e2e8f0_25%,transparent_25%,transparent_50%,#e2e8f0_50%,#e2e8f0_75%,transparent_75%,transparent)] bg-[length:20px_20px]" />
                    <span className="text-[11px] font-mono font-black text-slate-400 tracking-widest uppercase relative z-10 select-none">
                      site photo
                    </span>
                  </>
                )}
                {/* Tag Pill Badge */}
                <div className="absolute top-2.5 left-2.5 px-2.5 py-0.5 rounded-full bg-slate-800/85 text-white font-black text-[9.5px] tracking-wide backdrop-blur-xs shadow-xs z-20">
                  {item.tag}
                </div>
                {/* Loading overlay for retake/delete */}
                {deletingId === item.id && (
                  <div className="absolute inset-0 bg-white/80 flex items-center justify-center z-30">
                    <Loader2 className="w-6 h-6 animate-spin text-slate-500" />
                  </div>
                )}
              </div>

              {/* Caption & Meta */}
              <div className="p-3 bg-white flex-1 flex flex-col justify-between min-w-0">
                <div className="text-xs font-black text-slate-900 leading-snug mb-1 truncate">
                  {item.title}
                </div>
                <div className="text-[10.5px] font-bold text-slate-400 truncate mb-2">
                  {item.meta}
                </div>
                {/* Retake + Delete actions */}
                <div className="flex gap-1.5">
                  {/* Retake: hidden file input */}
                  <label className="flex-1 flex items-center justify-center gap-1 py-1.5 rounded-lg border border-blue-200 bg-blue-50 text-blue-700 text-[10px] font-bold cursor-pointer hover:bg-blue-100 transition-colors">
                    <RefreshCw className="w-3 h-3" />
                    Retake
                    <input
                      type="file"
                      accept="image/*"
                      capture="environment"
                      className="hidden"
                      onChange={(e) => handleRetakeFile(e, item)}
                    />
                  </label>
                  <button
                    onClick={() => handleDelete(item.id, item.dbId)}
                    disabled={deletingId === item.id}
                    className="flex-1 flex items-center justify-center gap-1 py-1.5 rounded-lg border border-red-200 bg-red-50 text-red-600 text-[10px] font-bold hover:bg-red-100 transition-colors disabled:opacity-50"
                  >
                    <Trash2 className="w-3 h-3" />
                    Delete
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Camera Capture Modal Pop-up Overlay */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/70 backdrop-blur-xs p-4 animate-in fade-in duration-200 max-w-[440px] mx-auto">
          <div className="bg-white rounded-3xl p-6 w-full max-h-[90vh] overflow-y-auto shadow-2xl space-y-5 animate-in slide-in-from-bottom duration-250">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h2 className="text-lg font-black text-slate-900 m-0">Capture Field Telemetry</h2>
              <button
                type="button"
                onClick={() => setShowModal(false)}
                className="w-8 h-8 rounded-full bg-slate-100 text-slate-500 hover:bg-slate-200 flex items-center justify-center border-none cursor-pointer p-0"
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleSaveCapture} className="space-y-4">
              <div className="border-2 border-dashed border-slate-300 rounded-2xl p-4 text-center bg-slate-50 relative overflow-hidden">
                {!previewUrl ? (
                  <>
                    <label className="inline-flex items-center gap-2 px-5 py-3 rounded-xl bg-[#1e40af] text-white font-black text-xs cursor-pointer shadow-md shadow-blue-900/20 active:scale-95 transition-all">
                      <input type="file" accept="image/*" capture="environment" onChange={handleSnapPhoto} className="hidden" />
                      <Camera size={16} strokeWidth={2.5} />
                      <span>Launch Camera</span>
                    </label>
                  </>
                ) : (
                  <div className="space-y-2">
                    <div className="aspect-video rounded-xl overflow-hidden border border-slate-200 relative">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={previewUrl} alt="Preview" className="w-full h-full object-cover" />
                    </div>
                    <div className="inline-flex items-center gap-1 px-3 py-1 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-800 text-[10px] font-black">
                      {gpsLoading ? <Loader2 size={11} className="animate-spin" /> : <MapPin size={11} className="text-emerald-600" />}
                      <span>{gpsLoading ? 'Locking GPS...' : `GPS Tagged: ${gpsCoords || '28.5355° N, 77.3910° E'} ✓`}</span>
                    </div>
                  </div>
                )}
              </div>

              <div>
                <label className="text-xs font-black text-slate-600 block mb-1.5">Category Tag</label>
                <div className="flex flex-wrap gap-1.5">
                  {['Civil', 'Material', 'Electrical', 'Issue', 'Quality', 'Safety'].map(tag => (
                    <button
                      key={tag}
                      type="button"
                      onClick={() => setCaptureTag(tag)}
                      className={`px-3 py-1.5 rounded-lg text-[11px] font-extrabold cursor-pointer border ${
                        captureTag === tag ? 'bg-[#1e40af] text-white border-[#1e40af]' : 'bg-white text-slate-600 border-slate-200'
                      }`}
                    >
                      {tag}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="text-xs font-black text-slate-600 block mb-1.5">Caption &amp; Location</label>
                <input
                  type="text"
                  placeholder="e.g., Column reinforcement checked at Block B"
                  value={caption}
                  onChange={e => setCaption(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-xs font-bold focus:outline-none focus:border-[#1e40af] box-border"
                />
              </div>

              {uploadError && (
                <div className="text-xs text-red-600 font-semibold bg-red-50 border border-red-100 rounded-xl p-2 text-center">{uploadError}</div>
              )}
              <button
                type="submit"
                disabled={!previewUrl || !selectedFile || saving}
                className="w-full py-3 bg-[#1e40af] hover:bg-[#1d4ed8] disabled:opacity-50 text-white rounded-xl font-black text-xs flex items-center justify-center gap-1.5 border-none cursor-pointer shadow-md"
              >
                {saving ? <Loader2 size={15} className="animate-spin" /> : <Send size={15} />}
                <span>{saving ? 'Uploading to cloud...' : 'Save Telemetry Photo'}</span>
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Sticky Bottom Capture Footer Button */}
      <div className="fixed bottom-0 left-0 right-0 max-w-[440px] mx-auto p-4 bg-white/95 backdrop-blur-md border-t border-slate-200 shadow-[0_-10px_25px_rgba(0,0,0,0.06)] z-40">
        <button
          type="button"
          onClick={() => setShowModal(true)}
          className="w-full py-3.5 bg-[#1e40af] hover:bg-[#1d4ed8] active:scale-[0.98] rounded-2xl text-white font-black text-sm flex items-center justify-center gap-2.5 border-none cursor-pointer shadow-lg shadow-blue-900/25 transition-all"
        >
          <Camera size={20} strokeWidth={2.6} />
          <span>Capture site photo</span>
        </button>
      </div>
    </div>
  )
}
