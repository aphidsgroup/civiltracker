'use client'

import { useState } from 'react'
import { softDeleteSite, restoreSite } from '@/actions/site'
import { Trash2, RefreshCw, Loader2 } from 'lucide-react'

export function SiteCardActions({ siteId, siteName, isDeleted }: { siteId: string, siteName: string, isDeleted: boolean }) {
  const [loading, setLoading] = useState(false)

  const handleDelete = async (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    const typed = window.prompt(`Type "${siteName}" to schedule this site for deletion. It will be permanently removed in 15 days.`)
    if (typed === null) return
    
    setLoading(true)
    try {
      await softDeleteSite(siteId, typed)
    } finally {
      setLoading(false)
    }
  }

  const handleRestore = async (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setLoading(true)
    try {
      await restoreSite(siteId)
    } finally {
      setLoading(false)
    }
  }

  if (loading) {
    return (
      <button disabled className="p-1.5 text-slate-400 bg-slate-50 rounded-lg">
        <Loader2 className="w-4 h-4 animate-spin" />
      </button>
    )
  }

  if (isDeleted) {
    return (
      <button 
        onClick={handleRestore}
        className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-50 text-blue-700 hover:bg-blue-100 rounded-lg text-xs font-bold transition-colors shadow-sm"
      >
        <RefreshCw className="w-3.5 h-3.5" />
        Restore Site
      </button>
    )
  }

  return (
    <button 
      onClick={handleDelete}
      className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
      title="Delete Site"
    >
      <Trash2 className="w-4 h-4" />
    </button>
  )
}
