'use client'

import { useState, useEffect, useCallback } from 'react'
import { getPendingChecklistPhotos, uploadChecklistPhotoAction } from '@/actions/checklists'
import { Camera, AlertTriangle, Loader2, X, Upload } from 'lucide-react'

export function ChecklistPhotoNag() {
  const [pendingTasks, setPendingTasks] = useState<any[]>([])
  const [isOpen, setIsOpen] = useState(false)
  const [dismissed, setDismissed] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)

  const fetchPending = useCallback(async () => {
    const tasks = await getPendingChecklistPhotos()
    if (tasks.length > 0) {
      setPendingTasks(tasks)
      setDismissed(false)
      setIsOpen(true)
    } else {
      setPendingTasks([])
      setIsOpen(false)
    }
  }, [])

  useEffect(() => {
    // Initial fetch on mount
    fetchPending()

    // Re-alert every 10 seconds regardless of dismiss state
    const interval = setInterval(() => {
      fetchPending()
    }, 10000)

    return () => clearInterval(interval)
  }, [fetchPending])

  // Re-show alert after 10s even if dismissed, as long as tasks still pending
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
  }

  const handleCapture = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      setSelectedFile(file)
      setPreviewUrl(URL.createObjectURL(file))
    }
  }

  const handleUpload = async () => {
    if (!previewUrl || !selectedFile) return
    setUploading(true)
    try {
      const task = pendingTasks[0]
      await uploadChecklistPhotoAction(task.taskId, task.siteId, previewUrl)
      setPreviewUrl(null)
      setSelectedFile(null)
      setIsOpen(false)
      // Fetch again after short delay to get next pending task
      setTimeout(() => fetchPending(), 1500)
    } finally {
      setUploading(false)
    }
  }

  if (!isOpen || dismissed || pendingTasks.length === 0) return null

  const task = pendingTasks[0]

  return (
    <div className="fixed inset-0 z-[9999] bg-slate-900/80 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-white w-full max-w-sm rounded-2xl shadow-2xl overflow-hidden">

        {/* Header */}
        <div className="bg-red-50 p-5 border-b border-red-100 relative">
          {/* Close button */}
          <button
            onClick={handleClose}
            className="absolute top-3 right-3 w-7 h-7 flex items-center justify-center rounded-full bg-red-100 hover:bg-red-200 text-red-600 transition-colors"
            title="Close (will reappear in 10 seconds)"
          >
            <X className="w-4 h-4" />
          </button>

          <div className="flex flex-col items-center text-center">
            <div className="w-12 h-12 bg-red-100 text-red-600 rounded-full flex items-center justify-center mb-3 shadow-inner">
              <AlertTriangle className="w-6 h-6" />
            </div>
            <h2 className="text-lg font-black text-red-900 m-0 leading-tight">Photo Required</h2>
            <p className="text-xs font-bold text-red-700 mt-1">
              Upload a site photo to verify task completion.
            </p>
            <p className="text-[10px] text-red-500 mt-0.5">This reminder repeats every 10 seconds until uploaded.</p>
          </div>
        </div>

        <div className="p-5">
          {/* Task info */}
          <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 mb-5">
            <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">
              {task.siteName} &middot; {task.stageName}
            </div>
            <div className="text-sm font-black text-slate-800 leading-snug">{task.taskName}</div>
            {pendingTasks.length > 1 && (
              <div className="text-[10px] text-amber-600 font-bold mt-1.5">+{pendingTasks.length - 1} more task{pendingTasks.length > 2 ? 's' : ''} awaiting photos</div>
            )}
          </div>

          {previewUrl ? (
            <div className="space-y-4">
              <div className="aspect-[4/3] rounded-xl overflow-hidden border border-slate-200 relative bg-slate-100">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={previewUrl} alt="Preview" className="w-full h-full object-cover" />
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => { setPreviewUrl(null); setSelectedFile(null) }}
                  className="flex-1 border border-slate-200 text-slate-600 font-bold text-sm py-3 rounded-xl transition-colors hover:bg-slate-50"
                >
                  Retake
                </button>
                <button
                  onClick={handleUpload}
                  disabled={uploading}
                  className="flex-1 bg-[#1e40af] hover:bg-[#1e3a8a] text-white font-black text-sm py-3 rounded-xl flex items-center justify-center gap-2 transition-colors disabled:opacity-70"
                >
                  {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
                  {uploading ? 'Uploading...' : 'Upload Photo'}
                </button>
              </div>
            </div>
          ) : (
            <label className="flex flex-col items-center justify-center gap-3 p-6 border-2 border-dashed border-[#fc6e20]/40 rounded-xl bg-orange-50/50 cursor-pointer active:bg-orange-50 transition-colors w-full">
              <div className="w-14 h-14 bg-[#fc6e20] text-white rounded-full flex items-center justify-center shadow-md">
                <Camera className="w-7 h-7" />
              </div>
              <div className="text-center">
                <span className="text-sm font-black text-slate-700 block">Tap to Take / Upload Photo</span>
                <span className="text-xs text-slate-500 mt-0.5 block">Use your camera or select from gallery</span>
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
