'use client'

import { usePathname } from 'next/navigation'
import type { SessionUser } from '@/types'
import Link from 'next/link'

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
    <div className="topbar">
      <div style={{ display: 'flex', alignItems: 'center' }}>
        <button className="hamburger-btn" onClick={() => document.dispatchEvent(new CustomEvent('toggle-mobile-menu'))}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" width="20" height="20">
            <path d="M4 6h16M4 12h16M4 18h16"/>
          </svg>
        </button>
        <div>
          <div className="ptitle">{title}</div>
          <div className="pcrumb">{crumb}</div>
        </div>
      </div>

      <div className="search">
        <svg className="svg18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="11" cy="11" r="7"/><path d="M21 21l-4-4"/></svg>
        <input placeholder="Search sites, bills, vendors..." />
      </div>

      <Link href="/approvals" className="tbtn" style={{ textDecoration: 'none', position: 'relative' }}>
        <svg className="svg18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>
        {pendingApprovalsCount > 0 && <b>{pendingApprovalsCount}</b>}
      </Link>

      {pathname === '/bills' && (
        <Link href="/bills/upload" className="addbtn">
          <svg className="svg18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.3" strokeLinecap="round"><path d="M12 5v14M5 12h14"/></svg>
          Upload Bill
        </Link>
      )}
      {pathname === '/expenses' && (
        <Link href="/expenses/new" className="addbtn">
          <svg className="svg18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.3" strokeLinecap="round"><path d="M12 5v14M5 12h14"/></svg>
          Add Expense
        </Link>
      )}
      {pathname === '/sites' && (
        <Link href="/sites/new" className="addbtn">
          <svg className="svg18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.3" strokeLinecap="round"><path d="M12 5v14M5 12h14"/></svg>
          New Site
        </Link>
      )}
    </div>
  )
}
