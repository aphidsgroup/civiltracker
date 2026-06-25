'use client'

import React, { useState, useEffect } from 'react'

interface ResponsiveTableProps {
  desktopView: React.ReactNode
  mobileView: React.ReactNode
  breakpoint?: number
}

export default function ResponsiveTable({ desktopView, mobileView, breakpoint = 768 }: ResponsiveTableProps) {
  const [isMobile, setIsMobile] = useState(false)

  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth <= breakpoint)
    handleResize()
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [breakpoint])

  return (
    <div className="responsive-table-wrapper">
      {isMobile ? mobileView : desktopView}
    </div>
  )
}
