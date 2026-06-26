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

export default function LoginPage() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [showPass, setShowPass] = useState(false)
  const [hydrated, setHydrated] = useState(false)

  useEffect(() => {
    const timer = setTimeout(() => setHydrated(true), 0)
    return () => clearTimeout(timer)
  }, [])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')
    const emailVal = email || (document.querySelector('input[name="email"]') as HTMLInputElement)?.value || ''
    const passwordVal = password || (document.querySelector('input[name="password"]') as HTMLInputElement)?.value || ''
    const result = await signIn('credentials', { email: emailVal, password: passwordVal, redirect: false })
    if (result?.error) {
      setError('Invalid email or password. Please try again.')
      setLoading(false)
    } else {
      router.push('/')
    }
  }

  function fillDemo(u: typeof DEMO_USERS[0]) {
    setEmail(u.email)
    setPassword(u.password)
    setError('')
  }

  const css = `
    @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap');
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: 'Inter', system-ui, sans-serif; }
    .login-root {
      min-height: 100vh;
      display: flex;
      background: #f0f4f8;
    }
    .login-left {
      width: 480px;
      flex-shrink: 0;
      background: linear-gradient(160deg, #091e36 0%, #0d3259 45%, #155291 100%);
      display: flex;
      flex-direction: column;
      justify-content: space-between;
      padding: 48px 44px;
      position: relative;
      overflow: hidden;
    }
    .login-left::before {
      content: '';
      position: absolute;
      right: -80px; top: -80px;
      width: 320px; height: 320px;
      border-radius: 50%;
      background: rgba(255,255,255,0.04);
    }
    .login-left::after {
      content: '';
      position: absolute;
      left: -60px; bottom: -60px;
      width: 240px; height: 240px;
      border-radius: 50%;
      background: rgba(255,255,255,0.03);
    }
    .brand-logo {
      width: 52px; height: 52px;
      border-radius: 16px;
      background: linear-gradient(135deg, #f3b43a, #e08a0b);
      display: flex; align-items: center; justify-content: center;
      box-shadow: 0 12px 28px -6px rgba(243,180,58,0.45);
      margin-bottom: 20px;
    }
    .brand-name {
      font-size: 26px; font-weight: 900;
      color: #fff; letter-spacing: -0.03em;
      margin-bottom: 6px;
    }
    .brand-tagline {
      font-size: 13px; font-weight: 500;
      color: rgba(255,255,255,0.55);
      letter-spacing: 0.02em;
      text-transform: uppercase;
    }
    .feature-list { margin-top: 40px; display: flex; flex-direction: column; gap: 20px; }
    .feature-item { display: flex; align-items: flex-start; gap: 14px; }
    .feature-icon {
      width: 40px; height: 40px; border-radius: 12px;
      background: rgba(255,255,255,0.08);
      display: flex; align-items: center; justify-content: center;
      font-size: 18px; flex-shrink: 0;
      border: 1px solid rgba(255,255,255,0.1);
    }
    .feature-title { font-size: 13.5px; font-weight: 700; color: #fff; margin-bottom: 3px; }
    .feature-desc { font-size: 12px; font-weight: 500; color: rgba(255,255,255,0.5); line-height: 1.45; }
    .left-footer {
      font-size: 11.5px; font-weight: 600;
      color: rgba(255,255,255,0.3);
      padding-top: 32px;
      border-top: 1px solid rgba(255,255,255,0.08);
    }
    .login-right {
      flex: 1;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 48px 32px;
    }
    .login-card {
      width: 100%;
      max-width: 420px;
    }
    .login-heading {
      font-size: 28px; font-weight: 800;
      color: #16273a; letter-spacing: -0.03em;
      margin-bottom: 6px;
    }
    .login-subheading {
      font-size: 14px; font-weight: 500;
      color: #647387; margin-bottom: 32px;
    }
    .form-group { margin-bottom: 18px; }
    .form-label {
      display: block; font-size: 12.5px; font-weight: 700;
      color: #4a5a6a; margin-bottom: 7px; letter-spacing: 0.01em;
    }
    .form-input-wrap { position: relative; }
    .form-input {
      width: 100%;
      background: #fff;
      border: 1.5px solid #dde5ee;
      border-radius: 12px;
      padding: 13px 44px 13px 16px;
      font-size: 14.5px; font-weight: 500;
      font-family: inherit;
      color: #16273a;
      outline: none;
      transition: border-color 0.15s, box-shadow 0.15s;
    }
    .form-input:focus {
      border-color: #13558e;
      box-shadow: 0 0 0 3px rgba(19,85,142,0.1);
    }
    .form-input::placeholder { color: #a8b8c8; font-weight: 400; }
    .input-icon {
      position: absolute; right: 14px; top: 50%; transform: translateY(-50%);
      color: #8a9ab0; display: flex; align-items: center;
    }
    .toggle-pass { cursor: pointer; background: none; border: none; padding: 0; color: #8a9ab0; display: flex; }
    .error-box {
      background: #fef0ee; color: #c4392c; border: 1px solid #f5c6c1;
      border-radius: 10px; padding: 12px 14px;
      font-size: 13px; font-weight: 600; margin-bottom: 20px;
      display: flex; align-items: center; gap: 8px;
    }
    .submit-btn {
      width: 100%;
      background: linear-gradient(135deg, #13558e 0%, #1d6fb5 100%);
      color: #fff; font-size: 15px; font-weight: 700;
      padding: 15px; border-radius: 13px; border: none;
      cursor: pointer; font-family: inherit;
      box-shadow: 0 10px 28px -10px rgba(19,85,142,0.55);
      transition: opacity 0.15s, transform 0.1s;
      margin-top: 8px;
      letter-spacing: -0.01em;
    }
    .submit-btn:hover:not(:disabled) { opacity: 0.92; transform: translateY(-1px); }
    .submit-btn:active:not(:disabled) { transform: translateY(0); }
    .submit-btn:disabled { background: #c5d1dd; box-shadow: none; cursor: not-allowed; }
    .demo-section { margin-top: 28px; }
    .demo-label {
      font-size: 11px; font-weight: 700; text-transform: uppercase;
      letter-spacing: 0.08em; color: #8a9ab0; margin-bottom: 10px;
      display: flex; align-items: center; gap: 8px;
    }
    .demo-label::before, .demo-label::after {
      content: ''; flex: 1; height: 1px; background: #e4eaf0;
    }
    .demo-cards { display: flex; flex-direction: column; gap: 8px; }
    .demo-card {
      display: flex; align-items: center; gap: 12px;
      padding: 11px 14px; border-radius: 11px;
      border: 1.5px solid #e4eaf0; background: #fff;
      cursor: pointer; transition: border-color 0.12s, background 0.12s;
      width: 100%;
      font-family: inherit;
      text-align: left;
    }
    .demo-card:hover { border-color: #b8cee4; background: #f7fafd; }
    .demo-dot {
      width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0;
    }
    .demo-role { font-size: 12.5px; font-weight: 700; color: #16273a; }
    .demo-email { font-size: 11.5px; color: #7a8fa3; font-weight: 500; margin-top: 1px; }
    .demo-arrow { margin-left: auto; color: #b0bec8; font-size: 14px; }
    @media (max-width: 800px) {
      .login-left { display: none; }
      .login-right { background: linear-gradient(160deg, #091e36 0%, #0d3259 45%, #155291 100%); }
      .login-card {
        background: #fff;
        border-radius: 24px;
        padding: 32px 28px;
        box-shadow: 0 32px 64px -16px rgba(0,0,0,0.4);
      }
      .mobile-brand {
        display: flex !important;
        align-items: center; gap: 12px; margin-bottom: 28px;
      }
    }
    .mobile-brand { display: none; }
  `

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: css }} />

      <div className="login-root">
        {/* LEFT PANEL */}
        <div className="login-left">
          <div>
            <div className="brand-logo">
              <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#3a2a05" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="5" y="3" width="14" height="18" rx="1.5"/>
                <path d="M9 7h2M13 7h2M9 11h2M13 11h2M9 15h2M13 15h2"/>
              </svg>
            </div>
            <div className="brand-name">Civil Tracker</div>
            <div className="brand-tagline">Construction Management Platform</div>

            <div className="feature-list">
              {FEATURES.map(f => (
                <div key={f.title} className="feature-item">
                  <div className="feature-icon">{f.icon}</div>
                  <div>
                    <div className="feature-title">{f.title}</div>
                    <div className="feature-desc">{f.desc}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="left-footer">
            &copy; 2026 Civil Tracker &middot; Built for Indian construction teams
          </div>
        </div>

        {/* RIGHT PANEL */}
        <div className="login-right">
          <div className="login-card">
            {/* Mobile brand header */}
            <div className="mobile-brand">
              <div style={{ width: 40, height: 40, borderRadius: 12, background: 'linear-gradient(135deg,#f3b43a,#e08a0b)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#3a2a05" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="5" y="3" width="14" height="18" rx="1.5"/>
                  <path d="M9 7h2M13 7h2M9 11h2M13 11h2M9 15h2M13 15h2"/>
                </svg>
              </div>
              <div style={{ fontWeight: 800, fontSize: 20, color: '#16273a', letterSpacing: '-0.02em' }}>Civil Tracker</div>
            </div>

            <div className="login-heading">Welcome back</div>
            <div className="login-subheading">Sign in to your workspace</div>

            {error && (
              <div className="error-box">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="10"/>
                  <line x1="12" y1="8" x2="12" y2="12"/>
                  <line x1="12" y1="16" x2="12.01" y2="16"/>
                </svg>
                {error}
              </div>
            )}

            <form onSubmit={handleSubmit}>
              <div className="form-group">
                <label className="form-label">Email address</label>
                <div className="form-input-wrap">
                  <input
                    type="email"
                    name="email"
                    className="form-input"
                    placeholder="you@company.com"
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    required
                    autoFocus
                  />
                  <span className="input-icon">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/>
                      <polyline points="22,6 12,13 2,6"/>
                    </svg>
                  </span>
                </div>
              </div>

              <div className="form-group">
                <label className="form-label">Password</label>
                <div className="form-input-wrap">
                  <input
                    type={showPass ? 'text' : 'password'}
                    name="password"
                    className="form-input"
                    placeholder="••••••••"
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    required
                  />
                  <button type="button" className="input-icon toggle-pass" onClick={() => setShowPass(v => !v)} tabIndex={-1}>
                    {showPass
                      ? <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>
                      : <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                    }
                  </button>
                </div>
              </div>

              <button
                type="submit"
                className="submit-btn"
                disabled={loading || !hydrated}
              >
                {loading ? 'Signing in…' : 'Sign in →'}
              </button>
            </form>

            <div className="demo-section">
              <div className="demo-label">Try with demo account</div>
              <div className="demo-cards">
                {DEMO_USERS.map(u => (
                  <button key={u.email} className="demo-card" type="button" onClick={() => fillDemo(u)}>
                    <div className="demo-dot" style={{ background: u.color }}></div>
                    <div>
                      <div className="demo-role">{u.role}</div>
                      <div className="demo-email">{u.email}</div>
                    </div>
                    <div className="demo-arrow">&#8599;</div>
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
