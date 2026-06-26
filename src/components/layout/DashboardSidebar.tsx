'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import type { SessionUser } from '@/types'
import { getInitials } from '@/lib/utils'
import {
  LayoutDashboard, FileText, Receipt, CheckCircle2, Users, Package,
  ShoppingCart, DollarSign, BarChart3, Settings, Layers, Building2,
  Truck, ClipboardList, FolderOpen, UserCircle, CalendarCheck
} from 'lucide-react'

const NAV_ITEMS = [
  { type: 'group', label: 'Overview' },
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/sites', label: 'Sites', icon: Building2 },
  { href: '/dpr', label: 'Daily Reports', icon: ClipboardList },
  { type: 'group', label: 'Finance' },
  { href: '/expenses', label: 'Expenses', icon: DollarSign },
  { href: '/bills', label: 'Bills', icon: Receipt },
  { href: '/approvals', label: 'Approvals', icon: CheckCircle2, badge: true },
  { type: 'group', label: 'Workforce' },
  { href: '/labour', label: 'Labour & Salary', icon: Users },
  { type: 'group', label: 'Procurement' },
  { href: '/materials', label: 'Materials & Stock', icon: Package },
  { href: '/vendors', label: 'Vendors', icon: Truck },
  { href: '/subcontractors', label: 'Subcontractors', icon: Users },
  { href: '/purchase', label: 'Purchase Orders', icon: ShoppingCart },
  { type: 'group', label: 'Project' },
  { href: '/boq', label: 'BOQ & Budget', icon: Layers },
  { href: '/tasks', label: 'Tasks & Schedule', icon: CalendarCheck },
  { type: 'group', label: 'Workspace' },
  { href: '/documents', label: 'Documents', icon: FolderOpen },
  { href: '/clients', label: 'Clients', icon: UserCircle },
  { href: '/reports', label: 'Reports', icon: BarChart3 },
  { href: '/settings', label: 'Settings', icon: Settings },
] as const

export default function DashboardSidebar({
  user,
  pendingApprovalsCount = 0,
  companyName,
  companyPlan,
  companyCity,
}: {
  user: SessionUser
  pendingApprovalsCount?: number
  companyName?: string
  companyPlan?: string
  companyCity?: string
}) {
  const pathname = usePathname()

  return (
    <div className="w-[250px] flex-shrink-0 flex flex-col h-full bg-gradient-to-b from-[#0c2640] to-[#0a2138] text-[#cdd9e6] px-3.5 py-[18px]">
      {/* Brand */}
      <div className="flex items-center gap-2.5 px-2 pb-4">
        <div className="w-[34px] h-[34px] rounded-[10px] bg-gradient-to-br from-[#1d6fb5] to-[#3a9bdf] flex items-center justify-center text-white flex-shrink-0">
          <FileText size={18} />
        </div>
        <div>
          <div className="text-[16px] font-extrabold text-white tracking-[-0.02em]">Civil Tracker</div>
        </div>
      </div>

      {/* Company pill */}
      {companyName && (
        <div className="flex items-center gap-2.5 mx-2.5 mb-4 px-2.5 py-2 bg-white/[0.07] border border-white/[0.09] rounded-[12px]">
          <div className="w-[30px] h-[30px] rounded-[8px] bg-[#f3b43a] text-[#3a2a05] font-extrabold text-[11px] flex items-center justify-center flex-shrink-0">
            {companyName.substring(0, 2).toUpperCase()}
          </div>
          <div className="min-w-0">
            <div className="text-[13px] font-bold text-white truncate">{companyName}</div>
            <div className="text-[10.5px] text-white/55 mt-0.5">
              {companyPlan?.replace(/_/g, ' ')}{companyCity ? ` · ${companyCity}` : ''}
            </div>
          </div>
        </div>
      )}

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
          const isActive = pathname === item.href ||
            (item.href !== '/dashboard' && pathname.startsWith(item.href + '/'))
          const showBadge = 'badge' in item && item.badge && pendingApprovalsCount > 0
          return (
            <Link
              key={item.href}
              href={item.href}
              className={[
                'flex items-center gap-[11px] px-[11px] py-[9px] rounded-[10px] text-[13.5px] font-semibold mb-0.5',
                'border-l-[2.5px] transition-colors duration-150',
                isActive
                  ? 'bg-[rgba(40,124,196,0.22)] text-white border-l-[#f3b43a]'
                  : 'text-[#b6c6d4] border-l-transparent hover:bg-white/[0.05] hover:text-white',
              ].join(' ')}
            >
              <Icon size={18} strokeWidth={1.8} />
              <span>{item.label}</span>
              {showBadge && (
                <span className="ml-auto text-[10.5px] font-extrabold bg-[#d9483b] text-white min-w-[19px] h-[19px] rounded-[10px] flex items-center justify-center px-1.5">
                  {pendingApprovalsCount}
                </span>
              )}
            </Link>
          )
        })}
      </nav>

      {/* User */}
      <div className="flex items-center gap-2.5 p-2.5 border-t border-white/[0.08] mt-2">
        <div className="w-[34px] h-[34px] rounded-[10px] bg-white/[0.12] text-white font-extrabold text-[13px] flex items-center justify-center flex-shrink-0">
          {getInitials(user.name ?? user.email ?? '?')}
        </div>
        <div className="min-w-0">
          <div className="text-[13px] font-bold text-white truncate">{user.name ?? 'User'}</div>
          <div className="text-[10.5px] text-[#8aa0b3] truncate">
            {user.role?.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}
          </div>
        </div>
      </div>
    </div>
  )
}
