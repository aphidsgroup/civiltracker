'use client'

import { usePathname } from 'next/navigation'
import type { SessionUser } from '@/types'
import Link from 'next/link'
import { Search, Bell, Plus, Menu } from 'lucide-react'

export default function DashboardTopbar({
  user,
  pendingApprovalsCount = 0,
  companyName,
}: {
  user: SessionUser
  pendingApprovalsCount?: number
  companyName?: string
}) {
  const pathname = usePathname()

  const getPageInfo = () => {
    if (pathname.includes('/sites/new')) return { title: 'New Site', crumb: 'Add a construction site' }
    if (pathname.includes('/sites')) return { title: 'Sites', crumb: 'Manage all construction sites' }
    if (pathname.includes('/expenses/new')) return { title: 'Add Expense', crumb: 'Log a new expense' }
    if (pathname.includes('/expenses')) return { title: 'Expenses', crumb: 'Track all site expenses' }
    if (pathname.includes('/bills/upload')) return { title: 'Upload Bill', crumb: 'Add vendor invoice' }
    if (pathname.includes('/bills')) return { title: 'Bills', crumb: 'Vendor and supplier invoices' }
    if (pathname.includes('/dpr')) return { title: 'Daily Reports', crumb: 'Site progress logs' }
    if (pathname.includes('/materials')) return { title: 'Materials', crumb: 'Inventory and stock tracking' }
    if (pathname.includes('/labour')) return { title: 'Labour & Salary', crumb: 'Workforce attendance and wages' }
    if (pathname.includes('/approvals')) return { title: 'Approvals', crumb: 'Pending requests and payments' }
    if (pathname.includes('/reports')) return { title: 'Reports', crumb: 'Financial and progress insights' }
    if (pathname.includes('/settings')) return { title: 'Settings', crumb: 'Company and team management' }
    if (pathname.includes('/purchase')) return { title: 'Purchase Orders', crumb: 'Material procurement' }
    if (pathname.includes('/vendors')) return { title: 'Vendors', crumb: 'Supplier and vendor management' }
    if (pathname.includes('/subcontractors')) return { title: 'Subcontractors', crumb: 'Subcontractor management' }
    if (pathname.includes('/boq')) return { title: 'BOQ & Budget', crumb: 'Bill of quantities and budgets' }
    if (pathname.includes('/tasks')) return { title: 'Tasks & Schedule', crumb: 'Project timeline and tasks' }
    if (pathname.includes('/documents')) return { title: 'Documents', crumb: 'Project files and documents' }
    if (pathname.includes('/clients')) return { title: 'Clients', crumb: 'Client management' }
    const todayStr = new Date().toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })
    return { title: 'Dashboard', crumb: `${companyName ?? 'Company'} · ${todayStr}` }
  }

  const { title, crumb } = getPageInfo()

  return (
    <div className="h-[60px] md:h-16 flex-shrink-0 bg-white border-b border-[#e4eaf0] flex items-center gap-3 md:gap-4 px-4 md:px-6">
      <button
        className="w-9 h-9 rounded-[10px] bg-[#f2f5f8] border border-[#e4eaf0] flex items-center justify-center text-[#16273a] lg:hidden flex-shrink-0"
        onClick={() => document.dispatchEvent(new CustomEvent('toggle-mobile-menu'))}
      >
        <Menu size={18} />
      </button>

      <div className="flex-1 min-w-0">
        <div className="text-[17px] md:text-[19px] font-extrabold text-[#16273a] tracking-[-0.02em] truncate">{title}</div>
        <div className="text-[11px] md:text-[12px] text-[#647387] font-semibold mt-0.5 truncate">{crumb}</div>
      </div>

      <div className="ml-auto flex items-center gap-2 md:gap-2.5 flex-shrink-0">
        {/* Hide search bar on mobile, show on tablet+ */}
        <div className="hidden md:flex items-center gap-2.5 bg-[#f2f5f8] border border-[#e4eaf0] rounded-[11px] px-3 py-2 w-60 text-[#647387]">
          <Search size={16} />
          <input
            className="bg-transparent border-none outline-none text-[13px] font-medium text-[#16273a] w-full placeholder:text-[#647387]"
            placeholder="Search sites, bills, vendors..."
          />
        </div>

        <Link
          href="/approvals"
          className="w-10 h-10 rounded-[11px] bg-[#f2f5f8] border border-[#e4eaf0] flex items-center justify-center text-[#16273a] relative"
        >
          <Bell size={18} />
          {pendingApprovalsCount > 0 && (
            <span className="absolute top-2 right-2 w-[7px] h-[7px] rounded-full bg-[#d9483b] border-[1.5px] border-white" />
          )}
        </Link>

        {pathname === '/bills' && (
          <Link href="/bills/upload" className="flex items-center gap-2 bg-gradient-to-r from-[#fc6e20] to-[#e85b0d] text-white text-[13.5px] font-bold px-3 py-2.5 md:px-4 rounded-[11px] shadow-[0_8px_16px_-8px_rgba(252,110,32,0.6)] flex-shrink-0">
            <Plus size={16} />
            <span className="hidden md:inline">Upload Bill</span>
          </Link>
        )}
        {pathname === '/expenses' && (
          <Link href="/expenses/new" className="flex items-center gap-2 bg-gradient-to-r from-[#fc6e20] to-[#e85b0d] text-white text-[13.5px] font-bold px-3 py-2.5 md:px-4 rounded-[11px] shadow-[0_8px_16px_-8px_rgba(252,110,32,0.6)] flex-shrink-0">
            <Plus size={16} />
            <span className="hidden md:inline">Add Expense</span>
          </Link>
        )}
        {pathname === '/sites' && (
          <Link href="/sites/new" className="flex items-center gap-2 bg-gradient-to-r from-[#fc6e20] to-[#e85b0d] text-white text-[13.5px] font-bold px-3 py-2.5 md:px-4 rounded-[11px] shadow-[0_8px_16px_-8px_rgba(252,110,32,0.6)] flex-shrink-0">
            <Plus size={16} />
            <span className="hidden md:inline">New Site</span>
          </Link>
        )}
      </div>
    </div>
  )
}
