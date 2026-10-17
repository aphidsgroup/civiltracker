'use client'

import React, { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Building2, ChevronDown, Check } from 'lucide-react'

type Site = {
  id: string
  name: string
  companyName: string
  companyLogo?: string | null
}

export default function SiteSelectorClient({
  activeSite,
  allSites,
  companyName,
  companyLogo,
}: {
  activeSite: Site | null
  allSites: Site[]
  companyName?: string | null
  companyLogo?: string | null
}) {
  const [open, setOpen] = useState(false)
  const router = useRouter()

  const handleSelect = (siteId: string) => {
    setOpen(false)
    router.push(`/mobile/home?siteId=${siteId}`)
  }

  const displayLogo = activeSite?.companyLogo || companyLogo
  const displayCompanyName = activeSite?.companyName || companyName || 'Company'

  return (
    <div className="relative">
      <button 
        onClick={() => setOpen(!open)}
        className="flex items-center gap-2.5 bg-white px-3 py-2 rounded-[14px] border border-slate-200/60 shadow-sm max-w-[220px] active:scale-[0.98] transition-transform text-left"
      >
        {displayLogo ? (
          <img
            src={displayLogo}
            alt={displayCompanyName}
            className="w-7 h-7 rounded-[8px] object-contain bg-white border border-slate-200 p-0.5 flex-shrink-0 shadow-xs"
          />
        ) : (
          <div className="w-7 h-7 rounded-[8px] bg-[#fc6e20] flex items-center justify-center flex-shrink-0 text-white font-bold text-xs">
            {displayCompanyName.substring(0, 2).toUpperCase()}
          </div>
        )}
        <div className="min-w-0 flex-1">
          <div className="text-[13px] font-bold text-slate-900 truncate">
            {activeSite?.name ?? (allSites.length === 0 ? 'No Active Sites' : 'Select Project')}
          </div>
          <div className="text-[10px] text-slate-500 font-semibold truncate">{displayCompanyName}</div>
        </div>
        <ChevronDown size={14} className="text-slate-400 flex-shrink-0" />
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute top-full left-0 mt-2 w-[240px] bg-white rounded-xl shadow-xl border border-slate-100 z-50 overflow-hidden py-1 animate-in slide-in-from-top-2 duration-200">
            <div className="px-3 py-2 border-b border-slate-100 bg-slate-50">
              <div className="text-xs font-bold text-slate-600 uppercase tracking-wider">{displayCompanyName} Projects</div>
            </div>
            <div className="max-h-[300px] overflow-y-auto">
              {allSites.length === 0 ? (
                <div className="p-4 text-center text-sm text-slate-500">No sites found</div>
              ) : (
                allSites.map(site => (
                  <button
                    key={site.id}
                    onClick={() => handleSelect(site.id)}
                    className="w-full text-left px-4 py-3 flex items-center justify-between hover:bg-slate-50 active:bg-slate-100 transition-colors"
                  >
                    <div className="flex items-center gap-2.5 min-w-0 flex-1">
                      {site.companyLogo && (
                        <img
                          src={site.companyLogo}
                          alt={site.companyName}
                          className="w-6 h-6 rounded object-contain bg-white border border-slate-200 p-0.5 flex-shrink-0"
                        />
                      )}
                      <div className="min-w-0 flex-1">
                        <div className={`text-sm font-bold truncate ${site.id === activeSite?.id ? 'text-[#fc6e20]' : 'text-slate-800'}`}>
                          {site.name}
                        </div>
                        <div className="text-[10px] text-slate-500 font-medium truncate">{site.companyName}</div>
                      </div>
                    </div>
                    {site.id === activeSite?.id && <Check size={16} className="text-[#fc6e20] flex-shrink-0 ml-2" />}
                  </button>
                ))
              )}
            </div>
          </div>
        </>
      )}
    </div>
  )
}
