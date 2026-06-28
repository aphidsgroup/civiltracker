'use client'

import { useState, useEffect } from 'react'
import { signIn } from 'next-auth/react'
import { Eye, EyeOff, Mail, ArrowRight } from 'lucide-react'

const FEATURES = [
  { icon: '📋', title: 'Daily Progress Reports', desc: 'Site DPRs, photo logs and work tracking in real-time' },
  { icon: '💸', title: 'Expense & Bill Management', desc: 'Upload bills, track approvals and control petty cash' },
  { icon: '👷', title: 'Labour & Attendance', desc: 'Mark attendance, run salary and track overtime' },
  { icon: '📦', title: 'Materials & Inventory', desc: 'Stock levels, purchase requests and vendor orders' },
]


export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [showPass, setShowPass] = useState(false)
  const [hydrated, setHydrated] = useState(false)

  useEffect(() => { setHydrated(true) }, [])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')
    try {
      const result = await signIn('credentials', { email, password, redirect: false })
      if (result?.error) {
        setError('Invalid email or password. Please try again.')
        setLoading(false)
      } else {
        window.location.href = '/'
      }
    } catch {
      setError('Something went wrong. Please try again.')
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex font-sans">
      {/* LEFT PANEL */}
      <div className="w-[460px] flex-shrink-0 hidden lg:flex flex-col justify-between p-12 bg-gradient-to-br from-slate-950 via-slate-900 to-slate-800 relative overflow-hidden">
        <div className="absolute top-0 right-0 w-64 h-64 bg-[#fc6e20]/10 blur-[100px] rounded-full pointer-events-none" />
        <div className="relative z-10">
          <div className="flex items-center gap-3 mb-10">
            <div className="w-[52px] h-[52px] rounded-full overflow-hidden shadow-[0_12px_28px_-6px_rgba(252,110,32,0.45)]">
              <img src="/icons/icon-192.png" alt="Buildogram Logo" className="w-full h-full object-cover" />
            </div>
            <div className="flex flex-col justify-center">
              <span className="font-black text-[26px] text-white tracking-tighter uppercase leading-none">Civil Tracker</span>
              <div className="flex justify-end w-full">
                <span className="font-bold text-[11px] text-[#fc6e20] uppercase tracking-widest leading-none mt-1">by Buildogram</span>
              </div>
            </div>
          </div>
          <div className="flex flex-col gap-5">
            {FEATURES.map(f => (
              <div key={f.title} className="flex items-start gap-3.5">
                <div className="w-10 h-10 rounded-[12px] bg-white/[0.08] border border-white/[0.1] flex items-center justify-center text-lg flex-shrink-0">{f.icon}</div>
                <div>
                  <div className="text-[13.5px] font-bold text-white mb-0.5">{f.title}</div>
                  <div className="text-[12px] font-medium text-white/50 leading-[1.45]">{f.desc}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
        <div className="text-[11.5px] font-semibold text-white/30 pt-8 border-t border-white/[0.08]">
          © 2026 Civil Tracker · Built for Indian construction teams
        </div>
      </div>

      {/* RIGHT PANEL */}
      <div className="flex-1 flex items-start lg:items-center justify-center p-6 pt-12 lg:p-12 bg-gradient-to-br from-slate-900 to-slate-800 lg:bg-[#f8fafc]">
        <div className="w-full max-w-[420px] bg-white rounded-[20px] p-8 shadow-[0_8px_32px_-8px_rgba(0,0,0,0.12)]">
          {/* Mobile Logo (hidden on desktop) */}
          <div className="flex items-center justify-center gap-3 mb-8 lg:hidden">
            <div className="w-12 h-12 rounded-full overflow-hidden shadow-md shadow-[#fc6e20]/30 shrink-0">
              <img src="/icons/icon-192.png" alt="Buildogram Logo" className="w-full h-full object-cover" />
            </div>
            <div className="flex flex-col justify-center">
              <span className="font-black text-[22px] text-[#0f172a] tracking-tighter uppercase leading-none">Civil Tracker</span>
              <div className="flex justify-end w-full">
                <span className="font-bold text-[9px] text-[#fc6e20] uppercase tracking-widest leading-none mt-1">by Buildogram</span>
              </div>
            </div>
          </div>

          <div className="text-[28px] font-black text-[#16273a] tracking-[-0.03em] mb-1 text-center">Welcome back</div>
          <div className="text-[14px] font-medium text-[#647387] mb-8 text-center">Sign in to your workspace</div>

          {error && (
            <div className="bg-[#fef0ee] text-[#c4392c] border border-[#f5c6c1] rounded-[10px] px-3.5 py-3 text-[13px] font-semibold mb-5 flex items-center gap-2">
              <span>⚠️</span> {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <div>
              <label className="block text-[12.5px] font-bold text-[#4a5a6a] mb-1.5">Email address</label>
              <div className="relative">
                <input type="email" placeholder="you@company.com" value={email}
                  onChange={e => setEmail(e.target.value)} required autoFocus autoComplete="email"
                  className="w-full bg-white border-[1.5px] border-[#dde5ee] rounded-[12px] py-[13px] pl-4 pr-11 text-[15px] font-medium text-[#16273a] outline-none transition-all focus:border-[#fc6e20] focus:shadow-[0_0_0_3px_rgba(252,110,32,0.12)]"
                />
                <Mail size={16} className="absolute right-3.5 top-1/2 -translate-y-1/2 text-[#8a9ab0] pointer-events-none" />
              </div>
            </div>
            <div>
              <label className="block text-[12.5px] font-bold text-[#4a5a6a] mb-1.5">Password</label>
              <div className="relative">
                <input type={showPass ? 'text' : 'password'} placeholder="••••••••" value={password}
                  onChange={e => setPassword(e.target.value)} required autoComplete="current-password"
                  className="w-full bg-white border-[1.5px] border-[#dde5ee] rounded-[12px] py-[13px] pl-4 pr-11 text-[15px] font-medium text-[#16273a] outline-none transition-all focus:border-[#fc6e20] focus:shadow-[0_0_0_3px_rgba(252,110,32,0.12)]"
                />
                <button type="button" tabIndex={-1} onClick={() => setShowPass(v => !v)}
                  className="absolute right-3.5 top-1/2 -translate-y-1/2 text-[#8a9ab0] bg-transparent border-none cursor-pointer p-1">
                  {showPass ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>
            <button type="submit" disabled={loading || !hydrated}
              className="w-full bg-gradient-to-r from-[#fc6e20] to-[#e85b0d] text-white text-[15px] font-bold py-[15px] rounded-[13px] flex items-center justify-center gap-2 shadow-[0_10px_28px_-10px_rgba(252,110,32,0.55)] hover:-translate-y-px hover:shadow-[0_14px_32px_-10px_rgba(252,110,32,0.65)] transition-all disabled:opacity-60 disabled:cursor-not-allowed mt-2">
              {loading ? 'Signing in…' : (<>Sign in <ArrowRight size={16} /></>)}
            </button>
          </form>

        </div>
      </div>
    </div>
  )
}
