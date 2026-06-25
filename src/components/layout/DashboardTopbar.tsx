'use client'

import Link from 'next/link'
import type { SessionUser } from '@/types'

export default function DashboardTopbar({ user }: { user: SessionUser }) {
  return (
    <header className="ct-topbar">
      <div style={{ flex: 1 }} />
      {/* Quick actions */}
      <Link href="/mobile/home" style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12.5px', fontWeight: 700, color: 'var(--mut)', textDecoration: 'none', padding: '7px 12px', borderRadius: '9px', border: '1px solid var(--line)', background: '#fff' }}>
        📱 Mobile View
      </Link>
      <div style={{ width: '1px', height: '22px', background: 'var(--line)' }} />
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        <div style={{ width: '32px', height: '32px', borderRadius: '50%', background: 'linear-gradient(135deg, #1d6fb5, #0c3c6a)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '12px', fontWeight: 800, color: '#fff' }}>
          {user.name?.split(' ').map((n: string) => n[0]).join('').toUpperCase().slice(0,2)}
        </div>
        <div>
          <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--ink)', lineHeight: 1.2 }}>{user.name}</div>
          <div style={{ fontSize: '10.5px', color: 'var(--mut)', fontWeight: 600 }}>{user.role?.replace(/_/g, ' ')}</div>
        </div>
      </div>
    </header>
  )
}
