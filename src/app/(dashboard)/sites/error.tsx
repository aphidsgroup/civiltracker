'use client'

import { useEffect } from 'react'
import { AlertTriangle, RefreshCw } from 'lucide-react'

export default function SitesError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error('[Sites Page Error]', error)
  }, [error])

  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4 text-center p-6">
      <div className="flex items-center justify-center w-14 h-14 bg-red-50 text-red-500 rounded-2xl border border-red-100">
        <AlertTriangle className="w-7 h-7" />
      </div>
      <h2 className="text-lg font-bold text-gray-900">Failed to load Sites</h2>
      <p className="text-sm text-gray-500 max-w-sm">
        {error?.message || 'An unexpected server error occurred.'}
      </p>
      {error?.digest && (
        <p className="text-xs text-gray-400 font-mono">Error ID: {error.digest}</p>
      )}
      <button
        onClick={reset}
        className="inline-flex items-center gap-2 px-4 py-2 bg-[#fc6e20] text-white text-sm font-bold rounded-lg hover:bg-[#e85b0d] transition-colors"
      >
        <RefreshCw className="w-4 h-4" />
        Try again
      </button>
    </div>
  )
}
