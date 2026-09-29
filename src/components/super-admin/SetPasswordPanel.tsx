'use client'

import { useState } from 'react'
import { KeyRound, Eye, EyeOff, Copy, CheckCircle2, Loader2 } from 'lucide-react'
import { resetUserPassword } from '@/actions/users'

interface Props {
  userId: string
  userName: string
  userEmail: string
}

export default function SetPasswordPanel({ userId, userName, userEmail }: Props) {
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [confirmEmail, setConfirmEmail] = useState('')
  const [showPass, setShowPass] = useState(false)
  const [showEntryPassword, setShowEntryPassword] = useState(false)
  const [showEntryConfirm, setShowEntryConfirm] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [setPassword_result, setSetPasswordResult] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    if (password.length < 6) { setError('Password must be at least 6 characters'); return }
    if (password !== confirm) { setError('Passwords do not match'); return }
    setLoading(true)
    try {
      // The server compares the typed email with the user's current email itself.
      await resetUserPassword(userId, password, confirmEmail)
      setSetPasswordResult(password)
      setPassword('')
      setConfirm('')
      setConfirmEmail('')
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to set password')
    } finally {
      setLoading(false)
    }
  }

  function copyToClipboard() {
    if (!setPassword_result) return
    navigator.clipboard.writeText(setPassword_result)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
      <div className="flex items-center gap-3 px-6 py-4 border-b border-slate-100 bg-amber-50/50">
        <div className="w-9 h-9 rounded-xl bg-amber-100 flex items-center justify-center flex-shrink-0">
          <KeyRound size={16} className="text-amber-600" />
        </div>
        <div>
          <div className="text-sm font-extrabold text-slate-800">Set Password</div>
        <div className="text-xs text-slate-500 font-medium">
          Set a new password for <span className="font-bold text-slate-700">{userName}</span> — masked by default, reveal only when needed
        </div>
        </div>
        </div>

      {/* Success banner with copyable password */}
      {setPassword_result && (
        <div className="mx-6 mt-5 p-4 bg-emerald-50 border border-emerald-200 rounded-xl flex items-center justify-between gap-3">
          <div>
            <div className="text-xs font-bold text-emerald-700 mb-1">✅ Password set successfully</div>
            <div className="flex items-center gap-2">
              <code className="text-sm font-mono font-bold text-emerald-900 bg-emerald-100 px-2 py-0.5 rounded">
                {showPass ? setPassword_result : '••••••••'}
              </code>
              <button
                type="button"
                onClick={() => setShowPass(v => !v)}
                className="text-emerald-600 hover:text-emerald-800 transition-colors"
              >
                {showPass ? <EyeOff size={14} /> : <Eye size={14} />}
              </button>
            </div>
          </div>
          <button
            type="button"
            onClick={copyToClipboard}
            className="flex items-center gap-1.5 px-3 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-lg transition-colors shrink-0"
          >
            {copied ? <CheckCircle2 size={13} /> : <Copy size={13} />}
            {copied ? 'Copied!' : 'Copy'}
          </button>
        </div>
      )}

      <form onSubmit={handleSubmit} className="p-6 space-y-4">
        {error && (
          <div className="p-3 bg-rose-50 border border-rose-200 rounded-lg text-sm text-rose-700 font-medium">
            {error}
          </div>
        )}
        <div>
          <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-1.5">
            New Password
          </label>
          <div className="relative">
            <input
              type={showEntryPassword ? 'text' : 'password'}
              value={password}
              onChange={e => setPassword(e.target.value)}
              required
              minLength={6}
              placeholder="Enter new password (min 6 chars)"
              className="w-full border border-slate-300 rounded-xl px-4 py-2.5 pr-11 text-sm text-slate-900 bg-white focus:outline-none focus:ring-2 focus:ring-[#fc6e20]/40 focus:border-[#fc6e20] transition-all"
            />
            <button
              type="button"
              onClick={() => setShowEntryPassword(v => !v)}
              aria-label={showEntryPassword ? 'Hide new password' : 'Show new password'}
              className="absolute inset-y-0 right-3 flex items-center text-slate-400 hover:text-slate-600"
            >
              {showEntryPassword ? <EyeOff size={15} /> : <Eye size={15} />}
            </button>
          </div>
        </div>
        <div>
          <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-1.5">
            Confirm Password
          </label>
          <div className="relative">
            <input
              type={showEntryConfirm ? 'text' : 'password'}
              value={confirm}
              onChange={e => setConfirm(e.target.value)}
              required
              minLength={6}
              placeholder="Re-enter new password"
              className="w-full border border-slate-300 rounded-xl px-4 py-2.5 pr-11 text-sm text-slate-900 bg-white focus:outline-none focus:ring-2 focus:ring-[#fc6e20]/40 focus:border-[#fc6e20] transition-all"
            />
            <button
              type="button"
              onClick={() => setShowEntryConfirm(v => !v)}
              aria-label={showEntryConfirm ? 'Hide confirm password' : 'Show confirm password'}
              className="absolute inset-y-0 right-3 flex items-center text-slate-400 hover:text-slate-600"
            >
              {showEntryConfirm ? <EyeOff size={15} /> : <Eye size={15} />}
            </button>
          </div>
        </div>
        <div>
          <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-1.5">
            Type <span className="font-mono normal-case">{userEmail}</span> to confirm
          </label>
          <input
            type="text"
            value={confirmEmail}
            onChange={e => setConfirmEmail(e.target.value)}
            required
            autoComplete="off"
            placeholder={userEmail}
            className="w-full border border-slate-300 rounded-xl px-4 py-2.5 text-sm text-slate-900 bg-white focus:outline-none focus:ring-2 focus:ring-[#fc6e20]/40 focus:border-[#fc6e20] transition-all font-mono"
          />
        </div>
        <button
          type="submit"
          disabled={loading || confirmEmail.trim() !== userEmail.trim()}
          className="w-full py-2.5 bg-[#fc6e20] hover:bg-[#e85b0d] disabled:opacity-60 text-white text-sm font-bold rounded-xl transition-colors cursor-pointer shadow-sm flex items-center justify-center gap-2"
        >
          {loading ? <><Loader2 size={14} className="animate-spin" /> Setting Password…</> : 'Set Password'}
        </button>
        <p className="text-[11px] text-slate-400 text-center">
          After setting, the password will appear above once for you to copy and share.
        </p>
      </form>
    </div>
  )
}
