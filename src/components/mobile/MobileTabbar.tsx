'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Home, FileText, BarChart3, UserCircle, Plus } from 'lucide-react'

export default function MobileTabbar() {
  const pathname = usePathname()
  const isOn = (segment: string) => pathname.includes(segment)

  const tab = (href: string, label: string, icon: React.ReactNode, segment: string) => (
    <Link
      href={href}
      className={[
        'flex-1 flex flex-col items-center gap-1 pt-[3px]',
        isOn(segment) ? 'text-[#13558e]' : 'text-[#9aa8b6]',
      ].join(' ')}
    >
      {icon}
      <span className="text-[10px] font-bold">{label}</span>
    </Link>
  )

  return (
    <div className="flex-shrink-0 h-[84px] bg-white border-t border-[#e4eaf0] flex px-2 pt-[9px] shadow-[0_-6px_18px_-10px_rgba(16,40,70,0.12)] relative">
      {tab('/mobile/home', 'Home', <Home size={24} strokeWidth={2.3} />, '/home')}
      {tab('/mobile/reports', 'Reports', <FileText size={24} strokeWidth={2.3} />, '/reports')}

      {/* FAB */}
      <div className="flex-1 flex justify-center">
        <Link
          href="/mobile/add"
          className="w-[58px] h-[58px] rounded-[20px] bg-gradient-to-br from-[#13558e] to-[#1d6fb5] text-white flex items-center justify-center -mt-[26px] shadow-[0_12px_24px_-8px_rgba(19,85,142,0.7)] ring-[5px] ring-[#eef2f6]"
        >
          <Plus size={28} strokeWidth={2.5} />
        </Link>
      </div>

      {tab('/mobile/sites', 'Charts', <BarChart3 size={24} strokeWidth={2.3} />, '/sites')}
      {tab('/mobile/profile', 'Profile', <UserCircle size={24} strokeWidth={2.3} />, '/profile')}
    </div>
  )
}
