'use client'

import { useState, useEffect } from 'react'
import { getPendingChecklistPhotos, uploadChecklistPhotoAction } from '@/actions/checklists'
import { Camera, AlertTriangle, Loader2 } from 'lucide-react'

export function ChecklistPhotoNag() {
  const [pendingTasks, setPendingTasks] = useState<any[]>([])
  const [isOpen, setIsOpen] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)

  useEffect(() => {
    // Poll every 5 seconds
    const interval = setInterval(async () => {
      if (isOpen) return // Don't poll if modal is already open
      const tasks = await getPendingChecklistPhotos()
      if (tasks.length > 0) {
        setPendingTasks(tasks)
        setIsOpen(true)
      } else {
        setIsOpen(false)
      }
    }, 5000)
    
    // Initial fetch
    getPendingChecklistPhotos().then(tasks => {
      if (tasks.length > 0) {
        setPendingTasks(tasks)
        setIsOpen(true)
      }
    })

    return () => clearInterval(interval)
  }, [isOpen])

  if (!isOpen || pendingTasks.length === 0) return null

  const task = pendingTasks[0]

  const handleCapture = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) setPreviewUrl(URL.createObjectURL(file))
  }

  const handleSimulate = () => setPreviewUrl('https://images.unsplash.com/photo-1541888946425-d0fbb18f0317?auto=format&fit=crop&w=800&q=80')

  const handleUpload = async () => {
    if (!previewUrl) return
    setUploading(true)
    try {
      await uploadChecklistPhotoAction(task.taskId, task.siteId, previewUrl)
      setPreviewUrl(null)
      setIsOpen(false) // Close modal to fetch the next one
    } finally {
      setUploading(false)
    }
  }

  return (
    <div className="fixed inset-0 z-[9999] bg-slate-900/80 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-white w-full max-w-sm rounded-2xl shadow-2xl overflow-hidden animate-in fade-in zoom-in duration-200">
        <div className="bg-red-50 p-5 border-b border-red-100 flex flex-col items-center text-center">
          <div className="w-12 h-12 bg-red-100 text-red-600 rounded-full flex items-center justify-center mb-3 shadow-inner">
            <AlertTriangle className="w-6 h-6" />
          </div>
          <h2 className="text-lg font-black text-red-900 m-0 leading-tight">Photo Required</h2>
          <p className="text-xs font-bold text-red-700 mt-1">You must upload a site photo to verify this completed task.</p>
        </div>
        
        <div className="p-5">
          <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 mb-5">
            <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">{task.siteName} &middot; {task.stageName}</div>
            <div className="text-sm font-black text-slate-800 leading-snug">{task.taskName}</div>
          </div>

          {previewUrl ? (
            <div className="space-y-4">
              <div className="aspect-[4/3] rounded-xl overflow-hidden border border-slate-200 relative bg-slate-100">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={previewUrl} alt="Preview" className="w-full h-full object-cover" />
              </div>
              <button 
                onClick={handleUpload}
                disabled={uploading}
                className="w-full bg-[#1e40af] hover:bg-[#1e3a8a] text-white font-black text-sm py-3.5 rounded-xl flex items-center justify-center gap-2 transition-colors disabled:opacity-70"
              >
                {uploading ? <Loader2 className="w-5 h-5 animate-spin" /> : 'Upload & Continue'}
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3">
              <label className="flex flex-col items-center justify-center gap-2 p-4 border-2 border-dashed border-slate-300 rounded-xl bg-slate-50 cursor-pointer active:bg-slate-100 transition-colors">
                <Camera className="w-8 h-8 text-slate-400" />
                <span className="text-xs font-bold text-slate-600">Take Photo</span>
                <input type="file" accept="image/*" capture="environment" className="hidden" onChange={handleCapture} />
              </label>
              
              <button onClick={handleSimulate} className="flex flex-col items-center justify-center gap-2 p-4 border border-slate-200 rounded-xl bg-white hover:bg-slate-50 transition-colors">
                <div className="w-8 h-8 bg-blue-100 text-blue-600 rounded-full flex items-center justify-center">
                  <Camera className="w-4 h-4" />
                </div>
                <span className="text-xs font-bold text-slate-600">Simulate Photo</span>
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
