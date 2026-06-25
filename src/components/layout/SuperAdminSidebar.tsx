'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

export default function SuperAdminSidebar({ companyCount = 0 }: { companyCount?: number }) {
  const pathname = usePathname()

  const isActive = (href: string) => pathname === href || pathname.startsWith(href + '/')

  const navLink = (href: string, label: string, icon: React.ReactNode) => (
    <Link key={href} href={href} className={`navi ${isActive(href) ? 'on' : ''}`}>
      {icon}
      <span>{label}</span>
    </Link>
  )

  return (
    <div className="side" style={{ background: 'linear-gradient(180deg, #0a1d33, #08172a)' }}>
      <div className="brand">
        <div className="blogo" style={{ background: 'linear-gradient(135deg, #f3b43a, #e08a0b)', color: '#3a2a05' }}>
          <svg className="svg22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2l2.5 5 5.5.8-4 3.9.9 5.5L12 20l-4.9 2.6.9-5.5-4-3.9 5.5-.8z"/></svg>
        </div>
        <div className="bname">Civil Tracker<small style={{ color: '#7d94a8' }}>Super Admin</small></div>
      </div>

      <div className="platform">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 21V8l6-4 6 4v13"/><path d="M15 21V11l6 4v6"/></svg>
        Platform · {companyCount} companies
      </div>

      <div className="nav">
        <div className="ngroup">Platform</div>
        {navLink('/super-admin/dashboard', 'Dashboard', <svg className="svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="8" height="8" rx="1.5"/><rect x="13" y="3" width="8" height="5" rx="1.5"/><rect x="13" y="10" width="8" height="11" rx="1.5"/><rect x="3" y="13" width="8" height="8" rx="1.5"/></svg>)}
        {navLink('/super-admin/companies', 'Companies', <svg className="svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M3 21V8l6-4 6 4v13"/><path d="M15 21V11l6 4v6"/><path d="M7 9h0M7 13h0M7 17h0"/></svg>)}
        {navLink('/super-admin/companies/new', 'Create Company', <svg className="svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M12 5v14M5 12h14"/></svg>)}
        {navLink('/super-admin/users', 'Users', <svg className="svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="9" cy="8" r="3"/><path d="M3 20a6 6 0 0 1 12 0"/><path d="M16 5.5a3 3 0 0 1 0 5M21 20a6 6 0 0 0-5-5.9"/></svg>)}

        <div className="ngroup">System</div>
        {navLink('/super-admin/subscriptions', 'Subscription Plans', <svg className="svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="5" width="20" height="14" rx="2"/><path d="M2 10h20"/></svg>)}
        {navLink('/super-admin/module-controls', 'Module Controls', <svg className="svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><path d="M17.5 14v7M14 17.5h7"/></svg>)}
        {navLink('/super-admin/storage', 'Storage Usage', <svg className="svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3"/><path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5"/></svg>)}

        <div className="ngroup">Support</div>
        {navLink('/super-admin/support', 'Support Tickets', <svg className="svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>)}
        {navLink('/super-admin/system-logs', 'System Logs', <svg className="svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>)}
        {navLink('/super-admin/settings', 'Settings', <svg className="svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 14a1.6 1.6 0 0 0 .3 1.8 2 2 0 1 1-2.8 2.8 1.6 1.6 0 0 0-2.7 1.1 2 2 0 1 1-4 0 1.6 1.6 0 0 0-2.7-1.1 2 2 0 1 1-2.8-2.8A1.6 1.6 0 0 0 3 14a2 2 0 1 1 0-4 1.6 1.6 0 0 0 1.7-2.7 2 2 0 1 1 2.8-2.8A1.6 1.6 0 0 0 10 3.7a2 2 0 1 1 4 0 1.6 1.6 0 0 0 2.7 1.1 2 2 0 1 1 2.8 2.8A1.6 1.6 0 0 0 20.3 10a2 2 0 1 1 0 4Z"/></svg>)}
      </div>
    </div>
  )
}
