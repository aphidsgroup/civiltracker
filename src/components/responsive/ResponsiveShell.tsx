'use client'

import React, { useState, useEffect } from 'react'
import { usePathname } from 'next/navigation'

interface ResponsiveShellProps {
  children: React.ReactNode
  sidebar: React.ReactNode
  topbar: React.ReactNode
  layoutClass: string
}

export default function ResponsiveShell({ children, sidebar, topbar, layoutClass }: ResponsiveShellProps) {
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false)
  const pathname = usePathname()

  // Close mobile menu when pathname changes
  useEffect(() => {
    // eslint-disable-next-line
    setIsMobileMenuOpen(false)
  }, [pathname])

  // Listen for custom toggle event from topbars
  useEffect(() => {
    const handleToggle = () => setIsMobileMenuOpen(prev => !prev)
    document.addEventListener('toggle-mobile-menu', handleToggle)
    return () => document.removeEventListener('toggle-mobile-menu', handleToggle)
  }, [])

  return (
    <div className={`ct app ${layoutClass}`}>
      {/* Desktop/Tablet Sidebar (Hidden on Mobile via CSS) */}
      <div className="desktop-sidebar-container">
        {sidebar}
      </div>

      {/* Mobile Drawer Sidebar */}
      {isMobileMenuOpen && (
        <div className="mobile-drawer-overlay" onClick={() => setIsMobileMenuOpen(false)}>
          <div className="mobile-drawer-content" onClick={(e) => e.stopPropagation()}>
            <button className="mobile-drawer-close" onClick={() => setIsMobileMenuOpen(false)}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M18 6L6 18M6 6l12 12"/></svg>
            </button>
            {sidebar}
          </div>
        </div>
      )}

      <div className="main">
        {topbar}
        <div className="content">
          {children}
        </div>
      </div>
    </div>
  )
}
