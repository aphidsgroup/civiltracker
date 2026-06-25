'use client'

import { useState, useEffect } from 'react'
import { signIn } from 'next-auth/react'
import { useRouter } from 'next/navigation'

export default function LoginPage() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const [hydrated, setHydrated] = useState(false)
  
  useEffect(() => { setHydrated(true) }, [])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')
    
    const emailVal = email || (document.querySelector('input[name="email"]') as HTMLInputElement)?.value || ''
    const passwordVal = password || (document.querySelector('input[name="password"]') as HTMLInputElement)?.value || ''
    
    const result = await signIn('credentials', { email: emailVal, password: passwordVal, redirect: false })
    if (result?.error) {
      setError('Invalid email or password')
      setLoading(false)
    } else {
      router.push('/')
    }
  }

  return (
    <div style={{ minHeight: '100vh', background: 'linear-gradient(135deg, #0c2640 0%, #0e3e69 50%, #1a64a6 100%)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px' }}>
      <div style={{ width: '100%', maxWidth: '420px' }}>
        <div style={{ textAlign: 'center', marginBottom: '32px' }}>
          <div style={{ width: '56px', height: '56px', borderRadius: '16px', background: 'linear-gradient(135deg, #f3b43a, #e08a0b)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px', boxShadow: '0 12px 28px -8px rgba(243,180,58,0.5)' }}>
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#3a2a05" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="5" y="3" width="14" height="18" rx="1.5"/>
              <path d="M9 7h2M13 7h2M9 11h2M13 11h2M9 15h2M13 15h2"/>
            </svg>
          </div>
          <h1 style={{ color: '#fff', fontSize: '28px', fontWeight: 800, letterSpacing: '-0.03em', margin: '0 0 6px' }}>Civil Tracker</h1>
          <p style={{ color: 'rgba(255,255,255,0.7)', fontSize: '13px', fontWeight: 500, margin: 0 }}>Construction Management Platform</p>
        </div>
        <div style={{ background: '#fff', borderRadius: '24px', padding: '32px', boxShadow: '0 32px 64px -16px rgba(0,0,0,0.4)' }}>
          <h2 style={{ fontSize: '20px', fontWeight: 800, color: '#16273a', margin: '0 0 8px', letterSpacing: '-0.02em' }}>Sign in</h2>
          <p style={{ color: '#647387', fontSize: '13px', fontWeight: 500, margin: '0 0 24px' }}>Enter your credentials to access your workspace</p>
          {error && <div style={{ background: '#fbe6e3', color: '#c4392c', borderRadius: '10px', padding: '12px 14px', fontSize: '13px', fontWeight: 600, marginBottom: '16px' }}>{error}</div>}
          <form onSubmit={handleSubmit} action="javascript:void(0);">
            <div style={{ marginBottom: '14px' }}>
              <label className="ct-label">Email address</label>
              <input type="email" name="email" className="ct-input" placeholder="you@company.com" value={email} onChange={e => setEmail(e.target.value)} required autoFocus />
            </div>
            <div style={{ marginBottom: '20px' }}>
              <label className="ct-label">Password</label>
              <input type="password" name="password" className="ct-input" placeholder="••••••••" value={password} onChange={e => setPassword(e.target.value)} required />
            </div>
            <button type="submit" data-hydrated={hydrated ? "true" : undefined} disabled={loading} style={{ width: '100%', background: loading ? '#9aa8b6' : 'linear-gradient(135deg, #13558e, #1d6fb5)', color: '#fff', fontSize: '15px', fontWeight: 700, padding: '14px', borderRadius: '12px', border: 'none', cursor: loading ? 'not-allowed' : 'pointer', boxShadow: '0 8px 20px -8px rgba(19,85,142,0.6)' }}>
              {loading ? 'Signing in...' : 'Sign in'}
            </button>
          </form>
          <div style={{ marginTop: '20px', padding: '14px', background: '#f2f5f8', borderRadius: '12px', fontSize: '11.5px', color: '#647387', fontWeight: 500 }}>
            <div style={{ fontWeight: 700, color: '#16273a', marginBottom: '8px' }}>Demo credentials</div>
            <div>Super Admin: <strong>admin@civiltracker.in</strong> / Admin@123456</div>
            <div>Company Admin: <strong>arun@madras-crafters.in</strong> / Admin@123456</div>
            <div>Site Engineer: <strong>murugan@madras-crafters.in</strong> / Admin@123456</div>
          </div>
        </div>
      </div>
    </div>
  )
}
