'use client'

import { useState } from 'react'
import Image from 'next/image'
import { CheckCircle2, XCircle, Loader2, Check, Clock, Trash2 } from 'lucide-react'
import { approvePhotoAction, rejectPhotoAction } from '@/actions/checklists'
import { deleteSitePhotoAction } from '@/actions/site-photos'

interface Photo {
  id: string
  secureUrl: string
  caption: string | null
  category: string | null
  createdAt: Date
  approvedForClient: boolean
  approvedAt: Date | null
  task?: {
    id: string
    name: string
    category?: {
      name: string
      stage?: { name: string }
    }
  } | null
}

interface Props {
  photo: Photo
  mode: 'pending' | 'approved'
}

export function PhotoApprovalCard({ photo, mode }: Props) {
  const [loading, setLoading] = useState<'approve' | 'reject' | 'delete' | null>(null)
  const [done, setDone] = useState<'approved' | 'rejected' | 'deleted' | null>(null)

  const handleApprove = async () => {
    setLoading('approve')
    try {
      await approvePhotoAction(photo.id)
      setDone('approved')
    } finally {
      setLoading(null)
    }
  }

  const handleReject = async () => {
    setLoading('reject')
    try {
      await rejectPhotoAction(photo.id)
      setDone('rejected')
    } finally {
      setLoading(null)
    }
  }

  const handleDelete = async () => {
    if (!confirm('Are you sure you want to delete this photo permanently?')) return
    setLoading('delete')
    try {
      await deleteSitePhotoAction(photo.id)
      setDone('deleted')
    } finally {
      setLoading(null)
    }
  }

  if (done === 'rejected' || done === 'deleted') return null

  return (
    <div className={`rounded-2xl overflow-hidden border shadow-sm bg-white flex flex-col ${mode === 'pending' ? 'border-amber-200' : 'border-emerald-200'}`}>
      {/* Photo */}
      <div className="relative aspect-[4/3] bg-slate-100">
        <Image src={photo.secureUrl} alt={photo.caption || 'Site photo'} fill className="object-cover" />

        {/* Status badge */}
        <div className={`absolute top-2 left-2 flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold ${mode === 'pending' ? 'bg-amber-500 text-white' : 'bg-emerald-500 text-white'}`}>
          {mode === 'pending' ? <Clock className="w-2.5 h-2.5" /> : <Check className="w-2.5 h-2.5 stroke-[3]" />}
          {mode === 'pending' ? 'Pending' : 'Approved'}
        </div>

        {done === 'approved' && (
          <div className="absolute inset-0 bg-emerald-500/20 flex items-center justify-center">
            <div className="bg-white rounded-full p-2 shadow-lg">
              <CheckCircle2 className="w-8 h-8 text-emerald-500" />
            </div>
          </div>
        )}
      </div>

      {/* Info */}
      <div className="p-3 flex-1 flex flex-col gap-2">
        {photo.task && (
          <div>
            <div className="text-xs font-bold text-slate-800 line-clamp-2">{photo.task.name}</div>
            {photo.task.category && (
              <div className="text-[10px] text-slate-400 mt-0.5">
                {photo.task.category.stage?.name} / {photo.task.category.name}
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

        {/* Action buttons — only for pending mode */}
        {mode === 'pending' && !done && (
          <div className="flex gap-2 pt-1">
            <button
              onClick={handleDelete}
              disabled={!!loading}
              className="flex items-center justify-center p-2 border border-slate-200 text-slate-500 hover:bg-red-50 hover:text-red-600 hover:border-red-200 rounded-xl transition-colors disabled:opacity-50"
              title="Delete Permanently"
            >
              {loading === 'delete' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
            </button>
            <button
              onClick={handleReject}
              disabled={!!loading}
              className="flex-1 flex items-center justify-center gap-1 py-2 border border-amber-200 text-amber-600 hover:bg-amber-50 rounded-xl text-xs font-bold transition-colors disabled:opacity-50"
            >
              {loading === 'reject' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <XCircle className="w-3.5 h-3.5" />}
              Reject
            </button>
            <button
              onClick={handleApprove}
              disabled={!!loading}
              className="flex-1 flex items-center justify-center gap-1 py-2 bg-emerald-500 hover:bg-emerald-600 text-white rounded-xl text-xs font-bold transition-colors disabled:opacity-50"
            >
              {loading === 'approve' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
              Approve
            </button>
          </div>
        )}

        {mode === 'approved' && (
          <div className="flex items-center gap-2 pt-1 mt-auto border-t border-slate-100 pt-3">
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 flex-shrink-0" />
            <span className="text-[10px] text-emerald-600 font-bold">Visible to client</span>
            
            <div className="ml-auto flex items-center gap-2">
              <button
                onClick={handleReject}
                disabled={!!loading}
                className="text-[10px] text-amber-500 hover:text-amber-600 font-bold transition-colors disabled:opacity-50"
              >
                {loading === 'reject' ? '...' : 'Revoke'}
              </button>
              <div className="w-px h-3 bg-slate-200" />
              <button
                onClick={handleDelete}
                disabled={!!loading}
                className="text-[10px] text-red-400 hover:text-red-600 font-bold transition-colors disabled:opacity-50 flex items-center gap-1"
              >
                {loading === 'delete' ? '...' : <><Trash2 className="w-3 h-3" /> Delete</>}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
