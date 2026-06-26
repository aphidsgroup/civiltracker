'use client'

import { useState, useEffect } from 'react'
import { signIn } from 'next-auth/react'
import { useRouter } from 'next/navigation'

const FEATURES = [
  { icon: '📋', title: 'Daily Progress Reports', desc: 'Site DPRs, photo logs and work tracking in real-time' },
  { icon: '💸', title: 'Expense & Bill Management', desc: 'Upload bills, track approvals and control petty cash' },
  { icon: '👷', title: 'Labour & Attendance', desc: 'Mark attendance, run salary and track overtime' },
  { icon: '📦', title: 'Materials & Inventory', desc: 'Stock levels, purchase requests and vendor orders' },
]

const DEMO_USERS = [
  { role: 'Super Admin', email: 'admin@civiltracker.in', password: 'Admin@123456', color: '#5b47b8' },
  { role: 'Company Admin', email: 'arun@madras-crafters.in', password: 'Admin@123456', color: '#13558e' },
  { role: 'Site Engineer', email: 'murugan@madras-crafters.in', password: 'Admin@123456', color: '#138a4e' },
]

const css = `
  @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap');

  * { box-sizing: border-box; margin: 0; padding: 0; }

  .login-root {
    min-height: 100vh;
    display: flex;
    font-family: 'Inter', system-ui, sans-serif;
  }

  /* LEFT PANEL */
  .login-left {
    width: 460px;
    flex-shrink: 0;
    background: linear-gradient(160deg,#091e36 0%,#0d3259 45%,#155291 100%);
    display: flex;
    flex-direction: column;
    justify-content: space-between;
    padding: 48px 44px;
  }

  /* RIGHT PANEL */
  .login-right {
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 48px 32px;
    background: #f0f4f8;
    min-height: 100vh;
  }

  .login-card {
    width: 100%;
    max-width: 420px;
  }

  /* INPUT FOCUS */
  .login-input:focus {
    border-color: #13558e !important;
    box-shadow: 0 0 0 3px rgba(19,85,142,0.12);
  }

  /* DEMO CARD HOVER */
  .demo-card:hover {
    border-color: #13558e !important;
    background: #f5f8fc !important;
  }

  /* SUBMIT BUTTON HOVER */
  .login-btn:hover:not(:disabled) {
    transform: translateY(-1px);
    box-shadow: 0 14px 32px -10px rgba(19,85,142,0.65) !important;
  }

  /* MOBILE — hide left panel, full-screen right */
  @media (max-width: 768px) {
    .login-left { display: none; }
    .login-right {
      background: linear-gradient(160deg,#091e36 0%,#0d3259 45%,#155291 100%);
      padding: 24px 20px;
      align-items: flex-start;
      padding-top: 48px;
    }
    .login-card {
      background: #fff;
      border-radius: 20px;
      padding: 32px 24px;
      box-shadow: 0 24px 64px -12px rgba(0,0,0,0.35);
    }
  }

  @media (max-width: 400px) {
    .login-right { padding: 16px 12px; padding-top: 32px; }
    .login-card { padding: 24px 18px; border-radius: 16px; }
  }
`

export default function LoginPage() {
  const router = useRouter()
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
        // Reload session then redirect based on role
        router.push('/')
        router.refresh()
      }
    } catch {
      setError('Something went wrong. Please try again.')
      setLoading(false)
    }
  }

  function fillDemo(u: typeof DEMO_USERS[0]) {
    setEmail(u.email)
    setPassword(u.password)
    setError('')
  }

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: css }} />
      <div className="login-root">

        {/* LEFT PANEL — hidden on mobile via CSS */}
        <div className="login-left">
          <div>
            <div style={{ width: 52, height: 52, borderRadius: 16, background: 'linear-gradient(135deg,#f3b43a,#e08a0b)', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 12px 28px -6px rgba(243,180,58,0.45)', marginBottom: 20 }}>
              <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#3a2a05" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="5" y="3" width="14" height="18" rx="1.5"/><path d="M9 7h2M13 7h2M9 11h2M13 11h2M9 15h2M13 15h2"/>
              </svg>
            </div>
            <div style={{ fontSize: 26, fontWeight: 900, color: '#fff', letterSpacing: '-0.03em', marginBottom: 6 }}>Civil Tracker</div>
            <div style={{ fontSize: 13, fontWeight: 500, color: 'rgba(255,255,255,0.55)', letterSpacing: '0.06em', textTransform: 'uppercase' }}>Construction Management Platform</div>
            <div style={{ marginTop: 40, display: 'flex', flexDirection: 'column', gap: 20 }}>
              {FEATURES.map(f => (
                <div key={f.title} style={{ display: 'flex', alignItems: 'flex-start', gap: 14 }}>
                  <div style={{ width: 40, height: 40, borderRadius: 12, background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, flexShrink: 0 }}>{f.icon}</div>
                  <div>
                    <div style={{ fontSize: 13.5, fontWeight: 700, color: '#fff', marginBottom: 3 }}>{f.title}</div>
                    <div style={{ fontSize: 12, fontWeight: 500, color: 'rgba(255,255,255,0.5)', lineHeight: 1.45 }}>{f.desc}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
          <div style={{ fontSize: 11.5, fontWeight: 600, color: 'rgba(255,255,255,0.3)', paddingTop: 32, borderTop: '1px solid rgba(255,255,255,0.08)' }}>
            © 2026 Civil Tracker · Built for Indian construction teams
          </div>
        </div>

        {/* RIGHT PANEL */}
        <div className="login-right">
          <div className="login-card">
            <div style={{ fontSize: 28, fontWeight: 800, color: '#16273a', letterSpacing: '-0.03em', marginBottom: 6 }}>Welcome back</div>
            <div style={{ fontSize: 14, fontWeight: 500, color: '#647387', marginBottom: 32 }}>Sign in to your workspace</div>

            {error && (
              <div style={{ background: '#fef0ee', color: '#c4392c', border: '1px solid #f5c6c1', borderRadius: 10, padding: '12px 14px', fontSize: 13, fontWeight: 600, marginBottom: 20, display: 'flex', alignItems: 'center', gap: 8 }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
                {error}
              </div>
            )}

            <form onSubmit={handleSubmit}>
              <div style={{ marginBottom: 18 }}>
                <label style={{ display: 'block', fontSize: 12.5, fontWeight: 700, color: '#4a5a6a', marginBottom: 7 }}>Email address</label>
                <div style={{ position: 'relative' }}>
                  <input
                    className="login-input"
                    type="email"
                    placeholder="you@company.com"
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    required
                    autoFocus
                    autoComplete="email"
                    style={{ width: '100%', background: '#fff', border: '1.5px solid #dde5ee', borderRadius: 12, padding: '13px 44px 13px 16px', fontSize: 15, fontWeight: 500, fontFamily: 'inherit', color: '#16273a', outline: 'none', transition: 'border-color 0.15s, box-shadow 0.15s' }}
                  />
                  <span style={{ position: 'absolute', right: 14, top: '50%', transform: 'translateY(-50%)', color: '#8a9ab0', display: 'flex', pointerEvents: 'none' }}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>
                  </span>
                </div>
              </div>

              <div style={{ marginBottom: 18 }}>
                <label style={{ display: 'block', fontSize: 12.5, fontWeight: 700, color: '#4a5a6a', marginBottom: 7 }}>Password</label>
                <div style={{ position: 'relative' }}>
                  <input
                    className="login-input"
                    type={showPass ? 'text' : 'password'}
                    placeholder="••••••••"
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    required
                    autoComplete="current-password"
                    style={{ width: '100%', background: '#fff', border: '1.5px solid #dde5ee', borderRadius: 12, padding: '13px 44px 13px 16px', fontSize: 15, fontWeight: 500, fontFamily: 'inherit', color: '#16273a', outline: 'none', transition: 'border-color 0.15s, box-shadow 0.15s' }}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPass(v => !v)}
                    tabIndex={-1}
                    aria-label={showPass ? 'Hide password' : 'Show password'}
                    style={{ position: 'absolute', right: 14, top: '50%', transform: 'translateY(-50%)', color: '#8a9ab0', background: 'none', border: 'none', cursor: 'pointer', display: 'flex', padding: 4 }}
                  >
                    {showPass
                      ? <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>
                      : <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                    }
                  </button>
                </div>
              </div>

              <button
                type="submit"
                className="login-btn"
                disabled={loading || !hydrated}
                style={{ width: '100%', background: loading || !hydrated ? '#c5d1dd' : 'linear-gradient(135deg,#13558e 0%,#1d6fb5 100%)', color: '#fff', fontSize: 15, fontWeight: 700, padding: '15px', borderRadius: 13, border: 'none', cursor: loading || !hydrated ? 'not-allowed' : 'pointer', fontFamily: 'inherit', boxShadow: loading || !hydrated ? 'none' : '0 10px 28px -10px rgba(19,85,142,0.55)', marginTop: 8, letterSpacing: '-0.01em', transition: 'all 0.2s' }}
              >
                {loading ? 'Signing in…' : 'Sign in →'}
              </button>
            </form>

            <div style={{ marginTop: 28 }}>
              <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#8a9ab0', marginBottom: 10, display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ flex: 1, height: 1, background: '#e4eaf0' }}></span>
                Try with demo account
                <span style={{ flex: 1, height: 1, background: '#e4eaf0' }}></span>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {DEMO_USERS.map(u => (
                  <button
                    key={u.email}
                    type="button"
                    className="demo-card"
                    onClick={() => fillDemo(u)}
                    style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '11px 14px', borderRadius: 11, border: '1.5px solid #e4eaf0', background: '#fff', cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left', width: '100%', transition: 'all 0.15s' }}
                  >
                    <div style={{ width: 8, height: 8, borderRadius: '50%', background: u.color, flexShrink: 0 }}></div>
                    <div>
                      <div style={{ fontSize: 12.5, fontWeight: 700, color: '#16273a' }}>{u.role}</div>
                      <div style={{ fontSize: 11.5, color: '#7a8fa3', fontWeight: 500, marginTop: 1 }}>{u.email}</div>
                    </div>
                    <div style={{ marginLeft: 'auto', color: '#b0bec8', fontSize: 14 }}>↗</div>
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  )
}
