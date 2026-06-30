'use client'

import { useState } from 'react'
import { KeyRound, Lock, EyeOff, Eye, Loader2, CheckCircle2 } from 'lucide-react'
import { changeSuperAdminPassword } from '@/actions/super-admin'
import toast from 'react-hot-toast'

export default function SuperAdminPasswordForm() {
  const [password, setPassword] = useState('')
  const [showPass, setShowPass] = useState(false)
  const [loading, setLoading] = useState(false)
  const [success, setSuccess] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!password || password.length < 6) {
      toast.error('Password must be at least 6 characters')
      return
    }

    setLoading(true)
    setSuccess(false)
    try {
      await changeSuperAdminPassword(password)
      setSuccess(true)
      setPassword('')
      toast.success('Password updated successfully')
      
      // Reset success message after 3 seconds
      setTimeout(() => setSuccess(false), 3000)
    } catch (err: any) {
      toast.error(err.message || 'Failed to update password')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
      <div className="text-base font-bold text-slate-900 mb-1 tracking-tight flex items-center gap-2">
        <KeyRound size={16} className="text-[#fc6e20]" />
        Security
      </div>
      <div className="text-sm text-slate-500 mb-5">
        Update your super admin master password
      </div>

      <form onSubmit={handleSubmit} className="space-y-4 max-w-sm">
        <div>
          <label className="block text-[12.5px] font-bold text-slate-700 mb-1.5">New Password</label>
          <div className="relative">
            <Lock size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
            <input
              type={showPass ? 'text' : 'password'}
              placeholder="Enter new password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              required
              minLength={6}
              className="w-full bg-white border border-slate-200 rounded-xl py-2.5 pl-9 pr-10 text-sm font-medium text-slate-900 outline-none transition-all focus:border-[#fc6e20] focus:ring-2 focus:ring-[#fc6e20]/10"
            />
            <button
              type="button"
              tabIndex={-1}
              onClick={() => setShowPass(!showPass)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 focus:outline-none"
            >
              {showPass ? <EyeOff size={15} /> : <Eye size={15} />}
            </button>
          </div>
        </div>

        <button
          type="submit"
          disabled={loading || password.length < 6}
          className="w-full sm:w-auto bg-slate-900 text-white hover:bg-slate-800 disabled:opacity-50 disabled:cursor-not-allowed text-xs font-bold py-2.5 px-5 rounded-xl flex items-center justify-center gap-2 transition-colors shadow-sm"
        >
          {loading ? (
            <><Loader2 size={14} className="animate-spin" /> Updating...</>
          ) : success ? (
            <><CheckCircle2 size={14} className="text-green-400" /> Updated</>
          ) : (
            'Change Password'
          )}
        </button>
      </form>
    </div>
  )
}
