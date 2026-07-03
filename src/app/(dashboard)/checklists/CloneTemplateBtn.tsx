'use client'

import { useTransition } from 'react'
import { Copy } from 'lucide-react'
import { cloneTemplate } from '@/actions/template-checklists'

export function CloneTemplateBtn({ templateId }: { templateId: string }) {
  const [isPending, startTransition] = useTransition()

  return (
    <button
      onClick={() => startTransition(async () => {
        await cloneTemplate(templateId)
      })}
      disabled={isPending}
      className="w-full flex items-center justify-center gap-2 py-2 bg-slate-800 text-white rounded-lg text-sm font-bold shadow-sm hover:bg-slate-700 transition-colors disabled:opacity-50"
    >
      <Copy size={16} />
      {isPending ? 'Cloning...' : 'Clone to Edit'}
    </button>
  )
}
