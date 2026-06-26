'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  LayoutDashboard, Building2, Plus, Users, CreditCard,
  HardDrive, Layers, MessageCircle, FileText, Settings, Landmark
} from 'lucide-react'

const NAV_ITEMS = [
  { type: 'group', label: 'Platform' },
  { href: '/super-admin/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/super-admin/companies', label: 'Companies', icon: Building2 },
  { href: '/super-admin/companies/new', label: 'Create Company', icon: Plus },
  { href: '/super-admin/users', label: 'Users', icon: Users },
  { type: 'group', label: 'System' },
  { href: '/super-admin/subscriptions', label: 'Subscriptions', icon: CreditCard },
  { href: '/super-admin/storage', label: 'Storage', icon: HardDrive },
  { href: '/super-admin/module-controls', label: 'Module Controls', icon: Layers },
  { href: '/super-admin/support', label: 'Support', icon: MessageCircle },
  { href: '/super-admin/system-logs', label: 'System Logs', icon: FileText },
  { href: '/super-admin/settings', label: 'Settings', icon: Settings },
] as const

export default function SuperAdminSidebar({ companyCount = 0 }: { companyCount?: number }) {
  const pathname = usePathname()
  const isActive = (href: string) => pathname === href || pathname.startsWith(href + '/')

  return (
    <div className="w-[248px] flex-shrink-0 flex flex-col h-full bg-gradient-to-b from-[#0a1d33] to-[#08172a] text-[#cdd9e6] px-3.5 py-[18px]">
      {/* Brand */}
      <div className="flex items-center gap-2.5 px-2 pb-3.5">
        <div className="w-[34px] h-[34px] rounded-[10px] bg-gradient-to-br from-[#f3b43a] to-[#e08a0b] text-[#3a2a05] flex items-center justify-center flex-shrink-0">
          <FileText size={18} />
        </div>
        <div>
          <div className="text-[16px] font-extrabold text-white tracking-[-0.02em]">Civil Tracker</div>
          <div className="text-[10px] font-semibold text-[#7d94a8] tracking-[0.04em] uppercase">Super Admin</div>
        </div>
      </div>

      {/* Platform badge */}
      <div className="flex items-center gap-2 bg-[rgba(243,180,58,0.12)] border border-[rgba(243,180,58,0.25)] rounded-[10px] px-[11px] py-2 mb-3.5 text-[11.5px] font-bold text-[#f3b43a]">
        <Landmark size={14} />
        Platform · {companyCount} companies
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto -mx-1 px-1 scrollbar-none">
        {NAV_ITEMS.map((item, i) => {
          if ('type' in item) {
            return (
              <div key={i} className="text-[10px] font-bold text-[#5f778c] uppercase tracking-[0.08em] px-2.5 pt-3.5 pb-1.5">
                {item.label}
              </div>
            )
          }
          const Icon = item.icon
          const active = isActive(item.href)
          return (
            <Link
              key={item.href}
              href={item.href}
              className={[
                'flex items-center gap-[11px] px-[11px] py-[9px] rounded-[10px] text-[13.5px] font-semibold mb-0.5',
                'border-l-[2.5px] transition-colors duration-150',
                active
                  ? 'bg-[rgba(40,124,196,0.22)] text-white border-l-[#f3b43a]'
                  : 'text-[#b6c6d4] border-l-transparent hover:bg-white/[0.05] hover:text-white',
              ].join(' ')}
            >
              <Icon size={18} strokeWidth={1.8} />
              <span>{item.label}</span>
            </Link>
          )
        })}
      </nav>
    </div>
  )
}
