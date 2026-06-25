'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

const TABS = [
  { href: '/mobile/home', icon: '\u2302', label: 'Home' },
  { href: '/mobile/attendance', icon: '\u{1F4CB}', label: 'Attendance' },
  { href: '/mobile/add/expense', icon: null, label: null, fab: true },
  { href: '/mobile/add/dpr', icon: '\u{1F4DD}', label: 'DPR' },
  { href: '/mobile/more', icon: '\u22EF', label: 'More' },
]

export default function MobileTabbar() {
  const pathname = usePathname()

  return (
    <nav className="ct-tabbar">
      {TABS.map((tab, i) => {
        if (tab.fab) {
          return (
            <div key={i} style={{ flex: 1, display: 'flex', justifyContent: 'center' }}>
              <Link href="/mobile/add/expense">
                <button className="ct-fab" aria-label="Add expense">
                  <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="12" y1="5" x2="12" y2="19"/>
                    <line x1="5" y1="12" x2="19" y2="12"/>
                  </svg>
                </button>
              </Link>
            </div>
          )
        }
        const isActive = pathname === tab.href || pathname.startsWith(tab.href + '/')
        return (
          <Link key={tab.href} href={tab.href} className={`ct-tab ${isActive ? 'active' : ''}`}>
            <span style={{ fontSize: '22px' }}>{tab.icon}</span>
            <span>{tab.label}</span>
          </Link>
        )
      })}
    </nav>
  )
}
