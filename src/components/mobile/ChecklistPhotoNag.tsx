'use client'

import { useState, useEffect, useCallback } from 'react'
import { getPendingChecklistPhotos, uploadChecklistPhotoAction } from '@/actions/checklists'
import { compressImage } from '@/lib/compress-image'
import { Camera, AlertTriangle, Loader2, X, Upload, CheckCircle2 } from 'lucide-react'

export function ChecklistPhotoNag() {
  const [pendingTasks, setPendingTasks] = useState<any[]>([])
  const [isOpen, setIsOpen] = useState(false)
  const [dismissed, setDismissed] = useState(false)
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [status, setStatus] = useState<'idle' | 'uploading' | 'success'>('idle')
  const [errorMsg, setErrorMsg] = useState<string | null>(null)

  const fetchPending = useCallback(async () => {
    try {
      const tasks = await getPendingChecklistPhotos()
      if (tasks.length > 0) {
        setPendingTasks(tasks)
        setDismissed(false)
        setIsOpen(true)
      } else {
        setPendingTasks([])
        setIsOpen(false)
      }
    } catch { /* silent */ }
  }, [])

  useEffect(() => {
    fetchPending()
    const interval = setInterval(fetchPending, 10000)
    return () => clearInterval(interval)
  }, [fetchPending])

  // Re-show after 10s even if dismissed
  useEffect(() => {
    if (!dismissed || pendingTasks.length === 0) return
    const timer = setTimeout(() => {
      setDismissed(false)
      setIsOpen(true)
    }, 10000)
    return () => clearTimeout(timer)
  }, [dismissed, pendingTasks.length])

  const handleClose = () => {
    setDismissed(true)
    setIsOpen(false)
    setPreviewUrl(null)
    setSelectedFile(null)
    setStatus('idle')
    setErrorMsg(null)
  }

  const handleCapture = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setSelectedFile(file)
    setPreviewUrl(URL.createObjectURL(file))
    setStatus('idle')
    setErrorMsg(null)
  }

  const handleUpload = async () => {
    if (!selectedFile || !pendingTasks[0]) return
    const task = pendingTasks[0]
    setStatus('uploading')
    setErrorMsg(null)

    try {
      // Step 0: Compress image client-side before upload
      const compressed = await compressImage(selectedFile)

      // Step 1: Upload compressed file to Cloudinary via /api/upload
      const fd = new FormData()
      fd.append('file', compressed)
      fd.append('module', 'SITE_PHOTO')
      fd.append('siteId', task.siteId)

      const res = await fetch('/api/upload', { method: 'POST', body: fd })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err?.error || 'Upload failed')
      }
      const { url: cloudinaryUrl } = await res.json()

      // Step 2: Save the real Cloudinary URL to the database
      await uploadChecklistPhotoAction(task.taskId, task.siteId, cloudinaryUrl)

      setStatus('success')
      setPreviewUrl(null)
      setSelectedFile(null)

      // Refresh pending list after a short delay
      setTimeout(() => {
        setStatus('idle')
        setIsOpen(false)
        fetchPending()
      }, 1800)
    } catch (err: any) {
      setErrorMsg(err?.message || 'Upload failed. Please try again.')
      setStatus('idle')
    }
  }

  if (!isOpen || dismissed || pendingTasks.length === 0) return null

  const task = pendingTasks[0]

  return (
    <div className="fixed inset-0 z-[9999] bg-slate-900/80 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-white w-full max-w-sm rounded-2xl shadow-2xl overflow-hidden">

        {/* Header */}
        <div className="bg-red-50 p-5 border-b border-red-100 relative">
          <button
            onClick={handleClose}
            className="absolute top-3 right-3 w-7 h-7 flex items-center justify-center rounded-full bg-red-100 hover:bg-red-200 text-red-600 transition-colors"
            title="Close (reappears in 10 seconds)"
          >
            <X className="w-4 h-4" />
          </button>
          <div className="flex flex-col items-center text-center">
            <div className="w-12 h-12 bg-red-100 text-red-600 rounded-full flex items-center justify-center mb-3 shadow-inner">
              <AlertTriangle className="w-6 h-6" />
            </div>
            <h2 className="text-lg font-black text-red-900 m-0 leading-tight">Photo Required</h2>
            <p className="text-xs font-bold text-red-700 mt-1">Upload a site photo to verify this task.</p>
            <p className="text-[10px] text-red-400 mt-0.5">Reminds every 10 seconds until uploaded.</p>
          </div>
        </div>

        <div className="p-5">
          {/* Task info */}
          <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 mb-4">
            <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">
              {task.siteName} &middot; {task.stageName}
            </div>
            <div className="text-sm font-black text-slate-800 leading-snug">{task.taskName}</div>
            {pendingTasks.length > 1 && (
              <div className="text-[10px] text-amber-600 font-bold mt-1.5">
                +{pendingTasks.length - 1} more task{pendingTasks.length > 2 ? 's' : ''} awaiting photos
              </div>
            )}
          </div>

          {/* Success state */}
          {status === 'success' && (
            <div className="flex flex-col items-center justify-center py-6 gap-2">
              <CheckCircle2 className="w-12 h-12 text-emerald-500" />
              <div className="font-black text-emerald-700 text-base">Photo Uploaded!</div>
              <div className="text-xs text-slate-500">Awaiting admin approval...</div>
            </div>
          )}

          {/* Preview + upload */}
          {status !== 'success' && previewUrl && (
            <div className="space-y-3">
              {/* Real preview from local blob (just for preview — actual upload uses the File object) */}
              <div className="aspect-[4/3] rounded-xl overflow-hidden border border-slate-200 bg-slate-100">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={previewUrl} alt="Preview" className="w-full h-full object-cover" />
              </div>
              {errorMsg && (
                <div className="text-xs text-red-600 font-semibold bg-red-50 border border-red-100 rounded-xl p-2 text-center">{errorMsg}</div>
              )}
              <div className="flex gap-2">
                <button
                  onClick={() => { setPreviewUrl(null); setSelectedFile(null); setErrorMsg(null) }}
                  disabled={status === 'uploading'}
                  className="flex-1 border border-slate-200 text-slate-600 font-bold text-sm py-3 rounded-xl hover:bg-slate-50 transition-colors disabled:opacity-50"
                >
                  Retake
                </button>
                <button
                  onClick={handleUpload}
                  disabled={status === 'uploading'}
                  className="flex-1 bg-[#fc6e20] hover:bg-[#e85b0d] text-white font-black text-sm py-3 rounded-xl flex items-center justify-center gap-2 transition-colors disabled:opacity-70"
                >
                  {status === 'uploading'
                    ? <><Loader2 className="w-4 h-4 animate-spin" /> Uploading...</>
                    : <><Upload className="w-4 h-4" /> Upload Photo</>
                  }
                </button>
              </div>
            </div>
          )}

          {/* Photo picker */}
          {status !== 'success' && !previewUrl && (
            <label className="flex flex-col items-center justify-center gap-3 p-6 border-2 border-dashed border-[#fc6e20]/40 rounded-xl bg-orange-50/50 cursor-pointer active:bg-orange-50 transition-colors w-full">
              <div className="w-14 h-14 bg-[#fc6e20] text-white rounded-full flex items-center justify-center shadow-md">
                <Camera className="w-7 h-7" />
              </div>
              <div className="text-center">
                <span className="text-sm font-black text-slate-700 block">Tap to Take / Upload Photo</span>
                <span className="text-xs text-slate-500 mt-0.5 block">Use camera or select from gallery</span>
              </div>
              <input
                type="file"
                accept="image/*"
                capture="environment"
                className="hidden"
                onChange={handleCapture}
              />
            </label>
          )}
        </div>
      </div>
    </div>
  )
}
