'use client'

import { usePathname } from 'next/navigation'

export default function SuperAdminTopbar() {
  const pathname = usePathname()

  const getPageInfo = () => {
    if (pathname.includes('/companies/new')) return { title: 'Create Company', crumb: 'Add a new workspace' }
    if (pathname.includes('/companies/')) return { title: 'Company Details', crumb: 'Manage company settings' }
    if (pathname.includes('/companies')) return { title: 'Companies', crumb: 'All platform companies' }
    if (pathname.includes('/users')) return { title: 'Users', crumb: 'All platform users' }
    if (pathname.includes('/subscriptions')) return { title: 'Subscriptions', crumb: 'Plan and billing management' }
    if (pathname.includes('/storage')) return { title: 'Storage', crumb: 'Cloudinary usage across companies' }
    if (pathname.includes('/support')) return { title: 'Support', crumb: 'Support tickets' }
    if (pathname.includes('/logs')) return { title: 'System Logs', crumb: 'Platform activity logs' }
    if (pathname.includes('/settings')) return { title: 'Settings', crumb: 'Platform configuration' }
    const today = new Date().toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })
    return { title: 'Platform Dashboard', crumb: `All companies · ${today}` }
  }

  const { title, crumb } = getPageInfo()

  return (
    <div className="topbar">
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
        <button className="hamburger-btn" onClick={() => document.dispatchEvent(new CustomEvent('toggle-mobile-menu'))}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" width="20" height="20">
            <path d="M4 6h16M4 12h16M4 18h16"/>
          </svg>
        </button>
        <div>
          <div className="ptitle">{title}</div>
          <div className="pcrumb">{crumb}</div>
        </div>
      </div>
      <div className="search" style={{ marginLeft: 'auto' }}>
        <svg className="svg18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="11" cy="11" r="7"/><path d="M21 21l-4-4"/></svg>
        <input placeholder="Search companies, users..." />
      </div>
    </div>
  )
}
