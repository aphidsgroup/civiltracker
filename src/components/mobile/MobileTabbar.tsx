'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

export default function MobileTabbar() {
  const pathname = usePathname()

  return (
    <div className="tabbar">
      <Link href="/mobile/home" className={`tab ${pathname.includes('/home') ? 'on' : ''}`}>
        <svg className="svg24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>
        <div className="tablbl">Home</div>
      </Link>

      <Link href="/mobile/sites" className={`tab ${pathname.includes('/sites') ? 'on' : ''}`}>
        <svg className="svg24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round"><rect x="5" y="3" width="14" height="18" rx="1.5"/><path d="M9 7h2M13 7h2M9 11h2M13 11h2M9 15h2M13 15h2"/></svg>
        <div className="tablbl">Sites</div>
      </Link>

      <div className="fabwrap">
        <Link href="/mobile/add" className="fab">
          <svg className="svg28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M12 5v14M5 12h14"/></svg>
        </Link>
      </div>

      <Link href="/mobile/reports" className={`tab ${pathname.includes('/reports') ? 'on' : ''}`}>
        <svg className="svg24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round"><path d="M3 20h18M6 20v-6M12 20v-12M18 20v-9"/></svg>
        <div className="tablbl">Reports</div>
      </Link>

      <Link href="/mobile/profile" className={`tab ${pathname.includes('/profile') ? 'on' : ''}`}>
        <svg className="svg24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
        <div className="tablbl">Profile</div>
      </Link>
    </div>
  )
}
