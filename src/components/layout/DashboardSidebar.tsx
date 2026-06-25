'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { signOut } from 'next-auth/react'
import type { SessionUser } from '@/types'

const NAV = [
  { group: 'Overview', items: [
    { href: '/dashboard', icon: '▦', label: 'Dashboard' },
    { href: '/sites', icon: '🏗', label: 'Sites' },
  ]},
  { group: 'Finance', items: [
    { href: '/expenses', icon: '💳', label: 'Expenses & Bills' },
    { href: '/bills', icon: '🧾', label: 'Bill Approval' },
    { href: '/payments', icon: '💰', label: 'Client Payments' },
  ]},
  { group: 'Labour', items: [
    { href: '/labour', icon: '👷', label: 'Labour' },
    { href: '/attendance', icon: '📋', label: 'Attendance' },
    { href: '/salary', icon: '💵', label: 'Salary Runs' },
  ]},
  { group: 'Materials', items: [
    { href: '/materials', icon: '🧱', label: 'Materials' },
    { href: '/purchase', icon: '📦', label: 'Purchase' },
    { href: '/vendors', icon: '🚛', label: 'Vendors' },
  ]},
  { group: 'Planning', items: [
    { href: '/tasks', icon: '✅', label: 'Tasks' },
    { href: '/boq', icon: '📐', label: 'BOQ' },
    { href: '/dpr', icon: '📝', label: 'DPR' },
  ]},
  { group: 'Manage', items: [
    { href: '/documents', icon: '📁', label: 'Documents' },
    { href: '/subcontractors', icon: '🔨', label: 'Subcontractors' },
    { href: '/clients', icon: '🤝', label: 'Clients' },
    { href: '/reports', icon: '📊', label: 'Reports' },
    { href: '/settings', icon: '⚙️', label: 'Settings' },
  ]},
]

export default function DashboardSidebar({ user }: { user: SessionUser }) {
  const pathname = usePathname()

  return (
    <nav className="ct-sidebar">
      {/* Logo */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '0 4px 18px' }}>
        <div style={{ width: '34px', height: '34px', borderRadius: '10px', background: 'linear-gradient(135deg, #f3b43a, #e08a0b)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '17px', flexShrink: 0 }}>📋</div>
        <div>
          <div style={{ fontWeight: 800, fontSize: '14px', color: '#fff', lineHeight: 1.2 }}>Civil Tracker</div>
          <div style={{ fontSize: '10px', color: '#6b889f', fontWeight: 600 }}>{user.companyName ?? 'Platform'}</div>
        </div>
      </div>

      {/* Nav */}
      <div style={{ flex: 1, overflowY: 'auto' }}>
        {NAV.map(group => (
          <div key={group.group}>
            <div className="ct-nav-group">{group.group}</div>
            {group.items.map(item => (
              <Link
                key={item.href}
                href={item.href}
                className={`ct-nav-item ${pathname === item.href || (item.href !== '/dashboard' && pathname.startsWith(item.href)) ? 'active' : ''}`}
              >
                <span style={{ fontSize: '15px', width: '20px', textAlign: 'center' }}>{item.icon}</span>
                {item.label}
              </Link>
            ))}
          </div>
        ))}
      </div>

      {/* User */}
      <div style={{ borderTop: '1px solid rgba(255,255,255,0.07)', paddingTop: '14px', marginTop: '8px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '8px 10px', borderRadius: '10px', background: 'rgba(255,255,255,0.05)' }}>
          <div style={{ width: '32px', height: '32px', borderRadius: '50%', background: 'linear-gradient(135deg, #1d6fb5, #0c3c6a)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '12px', fontWeight: 800, color: '#fff' }}>
            {user.name?.split(' ').map((n: string) => n[0]).join('').toUpperCase().slice(0,2)}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: '12.5px', fontWeight: 700, color: '#fff', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{user.name}</div>
            <div style={{ fontSize: '10.5px', color: '#6b889f', fontWeight: 600 }}>{user.role?.replace(/_/g, ' ')}</div>
          </div>
          <button onClick={() => signOut({ callbackUrl: '/login' })} style={{ background: 'none', border: 'none', color: '#6b889f', cursor: 'pointer', padding: '4px', fontSize: '14px' }} title="Sign out">↪</button>
        </div>
      </div>
    </nav>
  )
}
