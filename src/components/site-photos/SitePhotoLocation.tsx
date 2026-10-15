import { MapPin, MapPinOff, ExternalLink, ShieldAlert } from 'lucide-react'
import type { SitePhotoLocationView } from '@/lib/site-photo-location-view'
import { LOCATION_COLLECTION_NOTICE, LOCATION_DEVICE_REPORTED_NOTICE } from '@/lib/site-photo-location'

export function SitePhotoLocationBadge({ location }: { location: SitePhotoLocationView }) {
  if (location.status === 'UNAVAILABLE') {
    return (
      <div className="inline-flex items-center gap-1 text-[10px] font-bold text-slate-500" title="No device location was recorded for this photo">
        <MapPinOff className="w-3 h-3" />
        GPS unavailable
      </div>
    )
  }

  if (!location.exact) {
    return (
      <div className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-700" title={LOCATION_DEVICE_REPORTED_NOTICE}>
        <MapPin className="w-3 h-3" />
        GPS tagged
      </div>
    )
  }

  const { latitude, longitude, accuracyMeters, capturedAt, mapsUrl } = location.exact
  return (
    <div className="rounded-lg border border-emerald-200 bg-emerald-50/60 p-2 text-[10px] text-slate-700 space-y-1">
      <div className="flex items-center gap-1 font-bold text-emerald-800">
        <MapPin className="w-3 h-3" />
        GPS tagged · admin only
      </div>
      <div className="font-mono">
        {latitude.toFixed(6)}, {longitude.toFixed(6)} <span className="text-slate-500">±{Math.round(accuracyMeters)} m</span>
      </div>
      <div className="text-slate-500">
        Captured {new Date(capturedAt).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Kolkata' })}
      </div>
      <a
        href={mapsUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center gap-1 font-bold text-blue-700 hover:underline"
      >
        Open in Google Maps <ExternalLink className="w-3 h-3" />
      </a>
      <div className="flex items-start gap-1 text-slate-500">
        <ShieldAlert className="w-3 h-3 flex-shrink-0 mt-px" />
        <span>Device-reported location — strong operational evidence, not tamper-proof.</span>
      </div>
    </div>
  )
}

export function LocationCollectionNotice() {
  return (
    <div className="flex items-start gap-2 rounded-xl border border-blue-100 bg-blue-50 p-3 text-[11px] font-semibold text-blue-900 text-left">
      <MapPin className="w-4 h-4 flex-shrink-0 mt-px text-blue-700" />
      <span>{LOCATION_COLLECTION_NOTICE}</span>
    </div>
  )
}
