'use client'

import { useMemo, useState } from 'react'
import { AlertTriangle, Trash2 } from 'lucide-react'

interface Props {
  entityLabel: string
  confirmText: string
  buttonText?: string
  helperText?: string
  variant?: 'inline' | 'card'
  /**
   * 'typed' (default) requires the user to type confirmText exactly before the button unlocks —
   * used for permanent, unrecoverable super-admin deletes.
   * 'confirm' shows a plain native confirm() dialog and submits a `dangerConfirmed` flag instead —
   * for reversible/soft dashboard actions where typing friction isn't proportionate.
   */
  mode?: 'typed' | 'confirm'
}

export default function DangerConfirmSubmit({
  entityLabel,
  confirmText,
  buttonText = 'Delete',
  helperText,
  variant = 'inline',
  mode = 'typed',
}: Props) {
  const [typed, setTyped] = useState('')
  const isMatch = useMemo(() => typed.trim() === confirmText.trim(), [typed, confirmText])

  if (mode === 'confirm') {
    const handleClick = (e: React.MouseEvent<HTMLButtonElement>) => {
      if (!window.confirm(`${buttonText} "${entityLabel}"? ${helperText ?? 'This can be reversed by an admin later.'}`)) {
        e.preventDefault()
      }
    }

    if (variant === 'card') {
      return (
        <div className="bg-rose-50 border border-rose-200 rounded-2xl p-4 sm:p-5 space-y-3">
          <div className="flex items-start gap-3">
            <div className="w-9 h-9 rounded-xl bg-rose-100 flex items-center justify-center flex-shrink-0">
              <AlertTriangle size={16} className="text-rose-700" />
            </div>
            <div>
              <div className="text-sm font-extrabold text-rose-900">Confirm action</div>
              <p className="text-xs text-rose-800 mt-1 leading-relaxed">
                {helperText ?? <>This will affect <span className="font-bold">{entityLabel}</span>.</>}
              </p>
            </div>
          </div>

          <input type="hidden" name="dangerConfirmed" value="true" />
          <button
            type="submit"
            onClick={handleClick}
            className="inline-flex items-center gap-2 px-4 py-2.5 bg-rose-600 hover:bg-rose-700 text-white text-sm font-bold rounded-xl transition-colors cursor-pointer"
          >
            <Trash2 size={14} /> {buttonText}
          </button>
        </div>
      )
    }

    return (
      <div className="flex flex-col items-end gap-2 max-w-sm">
        <input type="hidden" name="dangerConfirmed" value="true" />
        <button
          type="submit"
          onClick={handleClick}
          className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-bold text-white bg-rose-600 hover:bg-rose-700 rounded-lg transition-colors cursor-pointer"
        >
          <Trash2 size={12} /> {buttonText}
        </button>
      </div>
    )
  }

  if (variant === 'card') {
    return (
      <div className="bg-rose-50 border border-rose-200 rounded-2xl p-4 sm:p-5 space-y-3">
        <div className="flex items-start gap-3">
          <div className="w-9 h-9 rounded-xl bg-rose-100 flex items-center justify-center flex-shrink-0">
            <AlertTriangle size={16} className="text-rose-700" />
          </div>
          <div>
            <div className="text-sm font-extrabold text-rose-900">Danger zone</div>
            <p className="text-xs text-rose-800 mt-1 leading-relaxed">
              Permanently delete <span className="font-bold">{entityLabel}</span>. This action cannot be undone.
            </p>
          </div>
        </div>

        <div>
          <label className="block text-[11px] font-bold uppercase tracking-wider text-rose-700 mb-1.5">
            Type <span className="font-mono normal-case bg-white/80 px-1.5 py-0.5 rounded border border-rose-200">{confirmText}</span> to confirm
          </label>
          <input
            name="dangerConfirmText"
            value={typed}
            onChange={e => setTyped(e.target.value)}
            placeholder={confirmText}
            autoComplete="off"
            className="w-full border border-rose-300 rounded-xl px-3.5 py-2.5 text-sm text-slate-900 bg-white focus:outline-none focus:ring-2 focus:ring-rose-300 focus:border-rose-400"
          />
          <p className="mt-1.5 text-[11px] text-rose-700">
            {helperText ?? 'This submit button stays locked until the text matches exactly.'}
          </p>
        </div>

        <button
          type="submit"
          disabled={!isMatch}
          className="inline-flex items-center gap-2 px-4 py-2.5 bg-rose-600 hover:bg-rose-700 disabled:bg-rose-200 disabled:text-rose-500 disabled:cursor-not-allowed text-white text-sm font-bold rounded-xl transition-colors cursor-pointer"
        >
          <Trash2 size={14} /> {buttonText}
        </button>
      </div>
    )
  }

  return (
    <div className="flex flex-col items-end gap-2 max-w-sm">
      <label className="text-[11px] font-bold text-rose-700 text-right leading-relaxed">
        Type <span className="font-mono bg-rose-50 border border-rose-200 rounded px-1.5 py-0.5">{confirmText}</span> to unlock delete
      </label>
      <input
        name="dangerConfirmText"
        value={typed}
        onChange={e => setTyped(e.target.value)}
        placeholder={confirmText}
        autoComplete="off"
        className="w-full border border-rose-300 rounded-lg px-3 py-2 text-sm text-slate-900 bg-white focus:outline-none focus:ring-2 focus:ring-rose-300 focus:border-rose-400"
      />
      <button
        type="submit"
        disabled={!isMatch}
        className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-bold text-white bg-rose-600 hover:bg-rose-700 disabled:bg-rose-200 disabled:text-rose-500 disabled:cursor-not-allowed rounded-lg transition-colors cursor-pointer"
      >
        <Trash2 size={12} /> {buttonText}
      </button>
    </div>
  )
}
