'use client'

import { usePathname } from 'next/navigation'
import { Search, Menu } from 'lucide-react'

export default function SuperAdminTopbar() {
  const pathname = usePathname()

  const getPageInfo = () => {
    if (pathname.includes('/companies/new')) return { title: 'Create Company', crumb: 'Add a new workspace' }
    if (pathname.includes('/companies/')) return { title: 'Company Details', crumb: 'Manage company settings' }
    if (pathname.includes('/companies')) return { title: 'Companies', crumb: 'All platform companies' }
    if (pathname.includes('/users')) return { title: 'Users', crumb: 'All platform users' }
    if (pathname.includes('/subscriptions')) return { title: 'Subscriptions', crumb: 'Plan and billing management' }
    if (pathname.includes('/storage')) return { title: 'Storage', crumb: 'Cloudinary usage across companies' }
    if (pathname.includes('/support')) return { title: 'Support', crumb: 'Support tickets' }
    if (pathname.includes('/logs')) return { title: 'System Logs', crumb: 'Platform activity logs' }
    if (pathname.includes('/settings')) return { title: 'Settings', crumb: 'Platform configuration' }
    const today = new Date().toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })
    return { title: 'Platform Dashboard', crumb: `All companies · ${today}` }
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
            placeholder="Search companies, users..."
          />
        </div>
      </div>
    </div>
  )
}
