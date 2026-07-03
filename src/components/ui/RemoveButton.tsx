'use client'

import { Trash2 } from 'lucide-react'

export default function RemoveButton({
  name,
  message,
}: {
  name: string
  message?: string
}) {
  const confirmMsg = message ?? `Remove "${name}"? All data is kept.`
  return (
    <button
      type="submit"
      className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-bold text-rose-600 bg-rose-50 hover:bg-rose-100 border border-rose-200 rounded-lg transition-colors cursor-pointer"
      onClick={(e) => {
        if (!confirm(confirmMsg)) e.preventDefault()
      }}
    >
      <Trash2 size={11} /> Remove
    </button>
  )
}
