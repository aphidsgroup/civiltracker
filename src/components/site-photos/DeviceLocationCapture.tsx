'use client'

import { useCallback, useRef, useState } from 'react'
import { Loader2, MapPin, MapPinOff, RefreshCw } from 'lucide-react'
import { captureDeviceLocation, type DeviceLocationTelemetry } from '@/lib/browser-location'

// One-shot location capture tied to an explicit photo action. No watchers,
// no background polling.
export function useDeviceLocation() {
  const [location, setLocation] = useState<DeviceLocationTelemetry | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const requestId = useRef(0)

  const acquire = useCallback(async () => {
    const id = ++requestId.current
    setLoading(true)
    setError(null)
    setLocation(null)
    try {
      const fix = await captureDeviceLocation()
      if (id === requestId.current) setLocation(fix)
      return fix
    } catch (err) {
      if (id === requestId.current) setError(err instanceof Error ? err.message : 'Could not get device location.')
      return null
    } finally {
      if (id === requestId.current) setLoading(false)
    }
  }, [])

  const reset = useCallback(() => {
    requestId.current++
    setLocation(null)
    setError(null)
    setLoading(false)
  }, [])

  return { location, error, loading, acquire, reset }
}

export function DeviceLocationStatus({
  location,
  error,
  loading,
  onRetry,
}: {
  location: DeviceLocationTelemetry | null
  error: string | null
  loading: boolean
  onRetry: () => void
}) {
  if (loading) {
    return (
      <div className="inline-flex items-center gap-1 px-3 py-1 rounded-full bg-slate-50 border border-slate-200 text-slate-700 text-[10px] font-black">
        <Loader2 size={11} className="animate-spin" />
        <span>Getting device location…</span>
      </div>
    )
  }
  if (location) {
    return (
      <div className="inline-flex items-center gap-1 px-3 py-1 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-800 text-[10px] font-black">
        <MapPin size={11} className="text-emerald-600" />
        <span>GPS tagged (±{Math.round(location.accuracyMeters)} m) ✓</span>
      </div>
    )
  }
  return (
    <div className="space-y-1.5">
      <div role="alert" className="flex items-start gap-1.5 px-3 py-2 rounded-xl bg-red-50 border border-red-200 text-red-700 text-[11px] font-bold text-left">
        <MapPinOff size={13} className="flex-shrink-0 mt-px" />
        <span>{error || 'Device location is required for site photo evidence.'} Photo cannot be submitted without it.</span>
      </div>
      <button
        type="button"
        onClick={onRetry}
        className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-slate-200 bg-white text-slate-700 text-[11px] font-bold cursor-pointer"
      >
        <RefreshCw size={12} /> Retry location
      </button>
    </div>
  )
}
