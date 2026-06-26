'use client'

import { useState, useEffect } from 'react'
import { Smartphone, X } from 'lucide-react'

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

export default function PWAInstallBanner() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null)
  const [dismissed, setDismissed] = useState(false)
  const [installed, setInstalled] = useState(false)

  useEffect(() => {
    // Hide if already installed as PWA
    if (window.matchMedia('(display-mode: standalone)').matches) {
      setInstalled(true)
      return
    }

    const handler = (e: Event) => {
      e.preventDefault()
      setDeferredPrompt(e as BeforeInstallPromptEvent)
    }

    window.addEventListener('beforeinstallprompt', handler)
    window.addEventListener('appinstalled', () => setInstalled(true))

    return () => {
      window.removeEventListener('beforeinstallprompt', handler)
    }
  }, [])

  const handleInstall = async () => {
    if (deferredPrompt) {
      await deferredPrompt.prompt()
      const result = await deferredPrompt.userChoice
      if (result.outcome === 'accepted') setInstalled(true)
      setDeferredPrompt(null)
    } else {
      // iOS fallback: show instructions
      alert('To install: tap the Share button in your browser, then tap "Add to Home Screen"')
    }
  }

  if (installed || dismissed) return null

  return (
    <div className="bg-[#fc6e20] text-white rounded-[16px] p-3.5 flex items-center justify-between shadow-md">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-[10px] bg-white/20 flex items-center justify-center text-white/90 shrink-0">
          <Smartphone size={20} />
        </div>
        <div>
          <div className="text-[13px] font-bold">Install Civil Tracker</div>
          <div className="text-[10.5px] font-medium text-orange-100">Add to home screen · works offline on site</div>
        </div>
      </div>
      <div className="flex items-center gap-2">
        <button
          onClick={handleInstall}
          className="bg-white hover:bg-slate-50 text-[#fc6e20] text-[12px] font-extrabold px-4 py-2 rounded-lg transition-colors shadow-sm border-none cursor-pointer"
        >
          Install
        </button>
        <button
          onClick={() => setDismissed(true)}
          className="bg-white/20 hover:bg-white/30 text-white text-[12px] font-extrabold p-2 rounded-lg transition-colors border-none cursor-pointer"
        >
          <X size={14} />
        </button>
      </div>
    </div>
  )
}
