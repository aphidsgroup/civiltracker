'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import type { SessionUser } from '@/types'
import { getInitials } from '@/lib/utils'

export default function DashboardSidebar({ user, pendingApprovalsCount = 0 }: { user: SessionUser; pendingApprovalsCount?: number }) {
  const pathname = usePathname()

  const navs = [
    { label: 'Overview', type: 'group' },
    { href: '/dashboard', label: 'Dashboard', icon: <svg className="svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="8" height="8" rx="1.5"/><rect x="13" y="3" width="8" height="5" rx="1.5"/><rect x="13" y="10" width="8" height="11" rx="1.5"/><rect x="3" y="13" width="8" height="8" rx="1.5"/></svg> },
    { href: '/sites', label: 'Sites', icon: <svg className="svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="5" y="3" width="14" height="18" rx="1.5"/><path d="M9 7h2M13 7h2M9 11h2M13 11h2M9 15h2M13 15h2"/></svg> },
    { href: '/dpr', label: 'Daily Reports', icon: <svg className="svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="6" y="4" width="12" height="17" rx="2"/><path d="M9 4V3h6v1"/><path d="M9 10h6M9 14h6M9 18h3"/></svg> },
    { label: 'Finance', type: 'group' },
    { href: '/expenses', label: 'Expenses', icon: <svg className="svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M3 7a2 2 0 0 1 2-2h12v4M3 7v10a2 2 0 0 0 2 2h14V9H5a2 2 0 0 1-2-2Z"/><circle cx="16" cy="13" r="1.3" fill="currentColor"/></svg> },
    { href: '/bills', label: 'Bills', icon: <svg className="svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M6 3h8l4 4v14H6z"/><path d="M14 3v4h4"/><path d="M9 13h6M9 17h4"/></svg> },
    { href: '/approvals', label: 'Approvals', badge: pendingApprovalsCount > 0 ? String(pendingApprovalsCount) : undefined, icon: <svg className="svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M9 12l2 2 4-4"/><circle cx="12" cy="12" r="9"/></svg> },
    { label: 'Workforce', type: 'group' },
    { href: '/labour', label: 'Labour & Salary', icon: <svg className="svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="9" cy="8" r="3"/><path d="M3 20a6 6 0 0 1 12 0"/><path d="M16 5.5a3 3 0 0 1 0 5M21 20a6 6 0 0 0-5-5.9"/></svg> },
    { label: 'Procurement', type: 'group' },
    { href: '/materials', label: 'Materials & Stock', icon: <svg className="svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/></svg> },
    { href: '/vendors', label: 'Vendors', icon: <svg className="svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"/></svg> },
    { href: '/subcontractors', label: 'Subcontractors', icon: <svg className="svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg> },
    { href: '/purchase', label: 'Purchase Orders', icon: <svg className="svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/><path d="M9 16l2 2 4-4"/></svg> },
    { label: 'Project', type: 'group' },
    { href: '/boq', label: 'BOQ & Budget', icon: <svg className="svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg> },
    { href: '/tasks', label: 'Tasks & Schedule', icon: <svg className="svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/><path d="M8 14h.01M12 14h.01M16 14h.01M8 18h.01M12 18h.01"/></svg> },
    { label: 'Workspace', type: 'group' },
    { href: '/documents', label: 'Documents', icon: <svg className="svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg> },
    { href: '/clients', label: 'Clients', icon: <svg className="svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg> },
    { href: '/reports', label: 'Reports', icon: <svg className="svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M21.21 15.89A10 10 0 1 1 8 2.83"/><path d="M22 12A10 10 0 0 0 12 2v10z"/></svg> },
    { href: '/settings', label: 'Settings', icon: <svg className="svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 14a1.6 1.6 0 0 0 .3 1.8 2 2 0 1 1-2.8 2.8 1.6 1.6 0 0 0-2.7 1.1 2 2 0 1 1-4 0 1.6 1.6 0 0 0-2.7-1.1 2 2 0 1 1-2.8-2.8A1.6 1.6 0 0 0 3 14a2 2 0 1 1 0-4 1.6 1.6 0 0 0 1.7-2.7 2 2 0 1 1 2.8-2.8A1.6 1.6 0 0 0 10 3.7a2 2 0 1 1 4 0 1.6 1.6 0 0 0 2.7 1.1 2 2 0 1 1 2.8 2.8A1.6 1.6 0 0 0 20.3 10a2 2 0 1 1 0 4Z"/></svg> },
  ]

  return (
    <div className="side">
      <div className="brand">
        <div className="blogo">
          <svg className="svg22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><rect x="5" y="3" width="14" height="18" rx="1.5"/><path d="M9 7h2M13 7h2M9 11h2M13 11h2M9 15h2M13 15h2"/></svg>
        </div>
        <div className="bname">Civil Tracker<small>Company workspace</small></div>
      </div>
      
      <div className="coswitch">
        <div className="coava">{getInitials(user.companyName || 'C')}</div>
        <div style={{ flex: 1 }}>
          <div className="conm">{user.companyName || 'Company'}</div>
          <div className="coplan">Standard Plan</div>
        </div>
        <svg className="svg16" viewBox="0 0 24 24" fill="none" stroke="#8aa0b3" strokeWidth="2.2" strokeLinecap="round"><path d="M8 9l4 4 4-4M8 15l4-4 4 4"/></svg>
      </div>

      <div className="nav">
        {navs.map((n, idx) => {
          if (n.type === 'group') {
            return <div key={idx} className="ngroup">{n.label}</div>
          }
          const isActive = pathname === n.href || pathname.startsWith(n.href + '/')
          return (
            <Link key={n.href} href={n.href!} className={`navi ${isActive ? 'on' : ''}`}>
              {n.icon}
              {n.label}
              {n.badge && <span className="nbadge">{n.badge}</span>}
            </Link>
          )
        })}
      </div>

      <div className="userbox">
        <div className="uava">{getInitials(user.name)}</div>
        <div style={{ flex: 1 }}>
          <div className="unm">{user.name}</div>
          <div className="url">{user.role.replace(/_/g, ' ')}</div>
        </div>
      </div>
    </div>
  )
}
