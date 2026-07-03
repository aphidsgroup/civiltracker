'use client'

import { useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Copy, Loader2 } from 'lucide-react'
import { cloneTemplate } from '@/actions/template-checklists'

export function CloneTemplateBtn({ templateId }: { templateId: string }) {
  const [isPending, startTransition] = useTransition()
  const router = useRouter()

  return (
    <button
      onClick={() => startTransition(async () => {
        const result = await cloneTemplate(templateId)
        if (result?.id) {
          router.push(`/checklists/${result.id}`)
        }
      })}
      disabled={isPending}
      className="w-full flex items-center justify-center gap-2 py-2.5 bg-slate-800 text-white rounded-lg text-sm font-bold shadow-sm hover:bg-slate-700 transition-colors disabled:opacity-50"
    >
      {isPending ? <Loader2 size={15} className="animate-spin" /> : <Copy size={15} />}
      {isPending ? 'Cloning...' : 'Clone & Edit'}
    </button>
  )
}
