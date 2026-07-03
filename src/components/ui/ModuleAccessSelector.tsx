'use client'

import { useState, useEffect } from 'react'

const MODULES = [
  { href: '/dashboard', label: 'Dashboard', group: 'Overview' },
  { href: '/sites', label: 'Sites', group: 'Overview' },
  { href: '/dpr', label: 'Daily Reports', group: 'Overview' },
  { href: '/expenses', label: 'Expenses', group: 'Finance' },
  { href: '/bills', label: 'Bills', group: 'Finance' },
  { href: '/approvals', label: 'Approvals', group: 'Finance' },
  { href: '/labour', label: 'Labour & Salary', group: 'Workforce' },
  { href: '/employees', label: 'Employees', group: 'Workforce' },
  { href: '/client-accounts', label: 'Client Accounts', group: 'Workforce' },
  { href: '/materials', label: 'Materials & Stock', group: 'Procurement' },
  { href: '/vendors', label: 'Vendors', group: 'Procurement' },
  { href: '/subcontractors', label: 'Subcontractors', group: 'Procurement' },
  { href: '/purchase', label: 'Purchase Orders', group: 'Procurement' },
  { href: '/boq', label: 'BOQ & Budget', group: 'Project' },
  { href: '/tasks', label: 'Tasks & Schedule', group: 'Project' },
  { href: '/documents', label: 'Documents', group: 'Workspace' },
  { href: '/clients', label: 'Billing Clients', group: 'Workspace' },
  { href: '/reports', label: 'Reports', group: 'Workspace' },
]

interface Props {
  initialModules?: string[]
}

export default function ModuleAccessSelector({ initialModules }: Props) {
  const [selected, setSelected] = useState<string[]>(
    initialModules || MODULES.map(m => m.href) // Default to all if not specified
  )

  const toggleModule = (href: string) => {
    setSelected(prev =>
      prev.includes(href) ? prev.filter(m => m !== href) : [...prev, href]
    )
  }

  const toggleAll = () => {
    if (selected.length === MODULES.length) {
      setSelected([])
    } else {
      setSelected(MODULES.map(m => m.href))
    }
  }

  // Group modules for display
  const groupedModules = MODULES.reduce((acc, module) => {
    if (!acc[module.group]) acc[module.group] = []
    acc[module.group].push(module)
    return acc
  }, {} as Record<string, typeof MODULES>)

  return (
    <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm">
      <input type="hidden" name="moduleControls" value={JSON.stringify(selected)} />
      
      <div className="flex items-center justify-between px-4 py-3 bg-slate-50 border-b border-slate-200">
        <div>
          <h3 className="text-sm font-bold text-slate-900">Module Access</h3>
          <p className="text-[11px] text-slate-500 font-medium">Select which dashboard sections this user can access.</p>
        </div>
        <button
          type="button"
          onClick={toggleAll}
          className="text-[11px] font-bold px-2.5 py-1.5 bg-white border border-slate-200 rounded text-slate-700 hover:bg-slate-50 transition-colors"
        >
          {selected.length === MODULES.length ? 'Deselect All' : 'Select All'}
        </button>
      </div>

      <div className="p-4 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-6">
        {Object.entries(groupedModules).map(([group, modules]) => (
          <div key={group} className="space-y-2">
            <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">{group}</h4>
            <div className="flex flex-col gap-2">
              {modules.map(m => (
                <label key={m.href} className="flex items-center gap-2.5 cursor-pointer group">
                  <div className="relative flex items-center justify-center">
                    <input
                      type="checkbox"
                      className="peer sr-only"
                      checked={selected.includes(m.href)}
                      onChange={() => toggleModule(m.href)}
                    />
                    <div className="w-4 h-4 rounded border border-slate-300 bg-white peer-checked:bg-[#fc6e20] peer-checked:border-[#fc6e20] transition-colors flex items-center justify-center group-hover:border-[#fc6e20]">
                      <svg className={`w-2.5 h-2.5 text-white ${selected.includes(m.href) ? 'opacity-100' : 'opacity-0'} transition-opacity`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                      </svg>
                    </div>
                  </div>
                  <span className="text-xs font-semibold text-slate-700 group-hover:text-slate-900 transition-colors select-none">{m.label}</span>
                </label>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
