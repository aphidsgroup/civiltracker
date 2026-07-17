'use client'

import { useState, useEffect } from 'react'

/**
 * LiveClock — renders a ticking IST date/time that updates every second.
 * Uses Asia/Kolkata timezone for all formatting.
 *
 * @param showTime  – show HH:MM:SS (default true)
 * @param showDate  – show day/date/month/year (default true)
 * @param compact   – shorter format (e.g. "Thu, 17 Jul" without year/time)
 * @param className – additional CSS class
 */

const IST = 'Asia/Kolkata'

function getNow() {
  return new Date()
}

export default function LiveClock({
  showTime = true,
  showDate = true,
  compact = false,
  className = '',
}: {
  showTime?: boolean
  showDate?: boolean
  compact?: boolean
  className?: string
}) {
  const [now, setNow] = useState<Date | null>(null)

  useEffect(() => {
    setNow(getNow())
    const id = setInterval(() => setNow(getNow()), 1000)
    return () => clearInterval(id)
  }, [])

  // Avoid hydration mismatch — render nothing until client mounts
  if (!now) return null

  const dateStr = now.toLocaleDateString('en-IN', {
    timeZone: IST,
    weekday: compact ? undefined : 'short',
    day: 'numeric',
    month: 'short',
    year: compact ? undefined : 'numeric',
  })

  const timeStr = now.toLocaleTimeString('en-IN', {
    timeZone: IST,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: true,
  })

  if (compact) {
    return (
      <span className={className}>
        {showDate && dateStr}
        {showDate && showTime && ' · '}
        {showTime && timeStr}
      </span>
    )
  }

  return (
    <span className={className}>
      {showDate && dateStr}
      {showDate && showTime && ' · '}
      {showTime && <span className="font-mono tracking-tight">{timeStr}</span>}
    </span>
  )
}
