import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { redirect } from 'next/navigation'
import { Layers, CheckCircle2 } from 'lucide-react'

const ALL_MODULES = [
  { key: 'expenses',       label: 'Expenses',         desc: 'Bill uploads, expense tracking, approvals' },
  { key: 'labour',         label: 'Labour',           desc: 'Attendance, salary runs, overtime' },
  { key: 'materials',      label: 'Materials',        desc: 'Inventory, requests, transactions' },
  { key: 'dpr',            label: 'Daily Progress',   desc: 'Site DPRs and photo logs' },
  { key: 'approvals',      label: 'Approvals',        desc: 'Multi-step approval workflows' },
  { key: 'vendors',        label: 'Vendors',          desc: 'Vendor directory and purchase orders' },
  { key: 'clients',        label: 'Clients',          desc: 'Client portal and invoicing' },
  { key: 'reports',        label: 'Reports',          desc: 'Export and analytics reports' },
  { key: 'tasks',          label: 'Tasks',            desc: 'Task management per site' },
  { key: 'documents',      label: 'Documents',        desc: 'Document storage and versioning' },
  { key: 'boq',            label: 'BOQ',              desc: 'Bill of Quantities management' },
  { key: 'subcontractors', label: 'Subcontractors',   desc: 'Subcontractor management' },
]

export default async function ModuleControlsPage() {
  const session = await auth()
  if (session?.user?.role !== 'SUPER_ADMIN') redirect('/dashboard')

  const companies = await prisma.company.findMany({
    select: { id: true, name: true, status: true, plan: true, modulesJson: true },
    orderBy: { name: 'asc' },
  })

  function statusBadge(status: string) {
    if (status === 'ACTIVE') return 'bg-emerald-100 text-emerald-800 border-emerald-200'
    if (status === 'TRIAL') return 'bg-amber-100 text-amber-800 border-amber-200'
    return 'bg-rose-100 text-rose-800 border-rose-200'
  }

  return (
    <>
      <div className="flex items-center justify-between px-8 py-5 border-b border-slate-200 bg-white">
        <div className="text-lg font-bold text-slate-800 flex items-center gap-2">
          <Layers className="text-[#fc6e20]" size={20} />
          Module Controls
        </div>
      </div>

      <div className="p-8 max-w-7xl mx-auto space-y-8">
        <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
          <div className="text-base font-bold text-slate-900 mb-1">Platform Modules</div>
          <div className="text-sm text-slate-500 mb-6">These modules are available to all companies. Per-company overrides can be configured via the company detail page.</div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {ALL_MODULES.map(mod => (
              <div key={mod.key} className="flex items-start gap-3.5 p-4 rounded-xl border border-slate-200 bg-slate-50/50 hover:bg-slate-50 transition-colors">
                <CheckCircle2 className="text-emerald-600 mt-0.5 flex-shrink-0" size={18} />
                <div className="flex-1 min-w-0">
                  <div className="font-semibold text-sm text-slate-800">{mod.label}</div>
                  <div className="text-xs text-slate-500 mt-1 leading-relaxed">{mod.desc}</div>
                </div>
                <span className="px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider rounded bg-[#fff7ed] text-[#e85b0d]">Core</span>
              </div>
            ))}
          </div>
        </div>

        <div className="space-y-4">
          <div className="text-xs font-bold tracking-wider uppercase text-slate-500 px-1">Per-Company Module Status</div>
          <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50/75 text-xs font-bold text-slate-500 uppercase tracking-wider">
                  <th className="py-3.5 px-6">Company</th>
                  <th className="py-3.5 px-6">Plan</th>
                  <th className="py-3.5 px-6">Status</th>
                  <th className="py-3.5 px-6">Overrides</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 text-sm">
                {companies.map(c => {
                  const mods = c.modulesJson as Record<string, boolean> | null
                  const customCount = mods ? Object.values(mods).filter(Boolean).length : 0
                  return (
                    <tr key={c.id} className="hover:bg-slate-50/50 transition-colors">
                      <td className="py-4 px-6 font-bold text-slate-900">{c.name}</td>
                      <td className="py-4 px-6">
                        <span className="px-2.5 py-1 text-xs font-semibold rounded-md bg-slate-100 text-slate-700 border border-slate-200">
                          {c.plan}
                        </span>
                      </td>
                      <td className="py-4 px-6">
                        <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-bold rounded-full border ${statusBadge(c.status)}`}>
                          <span className="w-1.5 h-1.5 rounded-full bg-current" />
                          {c.status}
                        </span>
                      </td>
                      <td className="py-4 px-6 text-slate-500">
                        {mods ? `${customCount} custom override${customCount === 1 ? '' : 's'}` : 'Default (All enabled)'}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </>
  )
}
