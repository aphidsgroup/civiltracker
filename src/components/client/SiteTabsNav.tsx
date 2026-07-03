'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

export function SiteTabsNav({ siteId }: { siteId: string }) {
  const pathname = usePathname()

  const tabs = [
    { name: 'Overview', href: `/sites/${siteId}` },
    { name: 'DPR', href: `/sites/${siteId}/dpr` },
    { name: 'Expenses', href: `/sites/${siteId}/expenses` },
    { name: 'Bills', href: `/sites/${siteId}/bills` },
    { name: 'Labour', href: `/sites/${siteId}/labour` },
    { name: 'Subcontractors', href: `/sites/${siteId}/subcontractors` },
    { name: 'Materials', href: `/sites/${siteId}/materials` },
    { name: 'Checklist', href: `/sites/${siteId}/checklist` },
    { name: 'BOQ', href: `/sites/${siteId}/boq` },
  ]

  return (
    <div className="flex items-center gap-2 border-b border-slate-200 mb-6 overflow-x-auto px-4 md:px-0">
      {tabs.map(tab => {
        const isActive = pathname === tab.href
        return (
          <Link
            key={tab.name}
            href={tab.href}
            className={`px-3 py-2 text-sm font-semibold whitespace-nowrap cursor-pointer border-b-2 transition-colors ${
              isActive 
                ? 'text-blue-600 border-blue-600' 
                : 'text-slate-600 hover:text-slate-900 border-transparent hover:border-slate-300'
            } ${tab.name === 'Checklist' && !isActive ? '!text-[#fc6e20] hover:!border-[#fc6e20]' : ''}`}
          >
            {tab.name}
          </Link>
        )
      })}
    </div>
  )
}
