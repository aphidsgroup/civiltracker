'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Home, FileText, BarChart3, UserCircle, Plus } from 'lucide-react'

export default function MobileTabbar() {
  const pathname = usePathname()
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

  return (
    <div className="fixed bottom-0 left-0 right-0 max-w-[440px] mx-auto bg-white/95 backdrop-blur-xl border-t border-slate-200 shadow-[0_-10px_25px_rgba(0,0,0,0.06)] z-50 h-[76px] px-2 flex items-center justify-between select-none">
      {tab('/mobile/home', 'Home', <Home size={22} strokeWidth={isOn('/home') ? 2.6 : 2} />, '/home')}
      {tab('/mobile/reports', 'Reports', <FileText size={22} strokeWidth={isOn('/reports') ? 2.6 : 2} />, '/reports')}

      {/* Elevated Center FAB */}
      <div className="flex-1 flex justify-center relative -top-6">
        <Link
          href="/mobile/add"
          aria-label="Quick Actions Hub"
          className="w-14 h-14 rounded-full bg-gradient-to-tr from-blue-600 via-indigo-600 to-blue-500 text-white flex items-center justify-center shadow-lg shadow-blue-600/35 ring-[6px] ring-slate-50 hover:scale-105 active:scale-95 transition-all"
        >
          <Plus size={28} strokeWidth={3} />
        </Link>
      </div>

      {tab('/mobile/sites', 'Portfolio', <BarChart3 size={22} strokeWidth={isOn('/sites') ? 2.6 : 2} />, '/sites')}
      {tab('/mobile/profile', 'Profile', <UserCircle size={22} strokeWidth={isOn('/profile') ? 2.6 : 2} />, '/profile')}
    </div>
  )
}
