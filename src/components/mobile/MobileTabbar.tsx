'use client'

import React, { useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Home, FileText, Building2, UserCircle, Plus, X } from 'lucide-react'

export default function MobileTabbar() {
  const pathname = usePathname()
  const [showQuickAdd, setShowQuickAdd] = useState(false)

  const hideTabbarRoutes = [
    '/upload-bill',
    '/add-expense',
    '/site-photo',
    '/attendance',
    '/dpr',
    '/add',
    '/approvals',
    '/notifications'
  ]

  if (hideTabbarRoutes.some(route => pathname.includes(route))) {
    return null
  }

  const isOn = (segment: string) => pathname.includes(segment)

  const tab = (href: string, label: string, icon: React.ReactNode, segment: string) => {
    const active = isOn(segment)
    return (
      <Link
        href={href}
        className={`flex flex-col items-center justify-center gap-1 flex-1 py-2 transition-all active:scale-95 no-underline ${
          active ? 'text-blue-600 font-extrabold' : 'text-slate-400 hover:text-slate-600 font-semibold'
        }`}
      >
        <div className={`p-1 rounded-xl transition-all ${active ? 'bg-blue-50 text-blue-600' : ''}`}>
          {icon}
        </div>
        <span className="text-[10px] tracking-tight">{label}</span>
      </Link>
    )
  }

  const quickOptions = [
    { label: 'Add Expense', href: '/mobile/add-expense', bg: 'bg-[#e6f4ea]', text: 'text-[#137333]' },
    { label: 'Upload Bill', href: '/mobile/upload-bill', bg: 'bg-[#e8f0fe]', text: 'text-[#1a73e8]' },
    { label: 'Mark Attendance', href: '/mobile/attendance', bg: 'bg-[#fef7e0]', text: 'text-[#b06000]' },
    { label: 'Site Photos', href: '/mobile/site-photo', bg: 'bg-[#f3e8ff]', text: 'text-[#7e22ce]' },
    { label: 'Daily Report', href: '/mobile/dpr', bg: 'bg-[#e0e7ff]', text: 'text-[#4338ca]' },
    { label: 'Material In', href: '/mobile/upload-bill?type=MATERIAL', bg: 'bg-[#d1fae5]', text: 'text-[#047857]' },
    { label: 'Raise Issue', href: '/mobile/notifications', bg: 'bg-[#ffe4e6]', text: 'text-[#be123c]' },
  ]

  return (
    <>
      {/* Quick Add Modal Overlay */}
      {showQuickAdd && (
        <div className="fixed inset-0 z-50 flex flex-col justify-end max-w-[440px] mx-auto select-none">
          {/* Backdrop */}
          <div
            onClick={() => setShowQuickAdd(false)}
            className="absolute inset-0 bg-slate-950/60 backdrop-blur-xs animate-in fade-in duration-200"
          />

          {/* Bottom Modal Sheet */}
          <div className="relative bg-white rounded-t-[32px] pt-3 pb-10 px-6 shadow-2xl z-10 animate-in slide-in-from-bottom duration-250 border-t border-slate-100">
            {/* Drag Handle Bar */}
            <div className="w-12 h-1.5 bg-slate-200 rounded-full mx-auto mb-5" />

            <div className="flex items-center justify-between mb-6">
              <h2 className="text-[19px] font-black text-[#1e293b] m-0 tracking-tight">Quick add</h2>
              <button
                onClick={() => setShowQuickAdd(false)}
                className="w-8 h-8 rounded-full bg-slate-100 text-slate-500 hover:bg-slate-200 flex items-center justify-center border-none cursor-pointer p-0"
              >
                <X size={18} />
              </button>
            </div>

            {/* 3-Column Claude Design Grid */}
            <div className="grid grid-cols-3 gap-y-7 gap-x-2">
              {quickOptions.map((opt) => (
                <Link
                  key={opt.label}
                  href={opt.href}
                  onClick={() => setShowQuickAdd(false)}
                  className="flex flex-col items-center group no-underline text-inherit active:scale-90 transition-transform"
                >
                  <div className={`w-16 h-16 rounded-[20px] ${opt.bg} ${opt.text} flex items-center justify-center shadow-xs group-hover:scale-105 transition-transform`}>
                    <Plus size={30} strokeWidth={2.4} />
                  </div>
                  <span className="text-[11.5px] font-black text-[#1e293b] text-center tracking-tight leading-snug mt-2 max-w-[80px]">
                    {opt.label}
                  </span>
                </Link>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Bottom Navigation Bar */}
      <div className="fixed bottom-0 left-0 right-0 max-w-[440px] mx-auto bg-white/95 backdrop-blur-xl border-t border-slate-200 shadow-[0_-10px_25px_rgba(0,0,0,0.06)] z-40 h-[76px] px-2 flex items-center justify-between select-none">
        {tab('/mobile/home', 'Home', <Home size={22} strokeWidth={isOn('/home') ? 2.6 : 2} />, '/home')}
        {tab('/mobile/reports', 'Reports', <FileText size={22} strokeWidth={isOn('/reports') ? 2.6 : 2} />, '/reports')}

        {/* Elevated Center FAB Trigger */}
        <div className="flex-1 flex justify-center relative -top-6">
          <button
            onClick={() => setShowQuickAdd(true)}
            aria-label="Quick Add Menu"
            className="w-14 h-14 rounded-full bg-gradient-to-tr from-[#1e3a8a] via-[#2563eb] to-[#3b82f6] text-white flex items-center justify-center shadow-lg shadow-blue-600/35 ring-[6px] ring-slate-50 hover:scale-105 active:scale-95 transition-all border-none cursor-pointer p-0"
          >
            <Plus size={30} strokeWidth={3} className={`transition-transform duration-200 ${showQuickAdd ? 'rotate-45' : ''}`} />
          </button>
        </div>

        {tab('/mobile/sites', 'Projects', <Building2 size={22} strokeWidth={isOn('/sites') ? 2.6 : 2} />, '/sites')}
        {tab('/mobile/profile', 'Profile', <UserCircle size={22} strokeWidth={isOn('/profile') ? 2.6 : 2} />, '/profile')}
      </div>
    </>
  )
}
