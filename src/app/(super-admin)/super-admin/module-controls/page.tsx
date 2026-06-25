import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { redirect } from 'next/navigation'

const ALL_MODULES = [
  { key: 'expenses',       label: 'Expenses',         desc: 'Bill uploads, expense tracking, approvals' },
  { key: 'labour',         label: 'Labour',            desc: 'Attendance, salary runs, overtime' },
  { key: 'materials',      label: 'Materials',         desc: 'Inventory, requests, transactions' },
  { key: 'dpr',            label: 'Daily Progress',    desc: 'Site DPRs and photo logs' },
  { key: 'approvals',      label: 'Approvals',         desc: 'Multi-step approval workflows' },
  { key: 'vendors',        label: 'Vendors',           desc: 'Vendor directory and purchase orders' },
  { key: 'clients',        label: 'Clients',           desc: 'Client portal and invoicing' },
  { key: 'reports',        label: 'Reports',           desc: 'Export and analytics reports' },
  { key: 'tasks',          label: 'Tasks',             desc: 'Task management per site' },
  { key: 'documents',      label: 'Documents',         desc: 'Document storage and versioning' },
  { key: 'boq',            label: 'BOQ',               desc: 'Bill of Quantities management' },
  { key: 'subcontractors', label: 'Subcontractors',    desc: 'Subcontractor management' },
]

export default async function ModuleControlsPage() {
  const session = await auth()
  if (session?.user?.role !== 'SUPER_ADMIN') redirect('/dashboard')

  const companies = await prisma.company.findMany({
    select: { id: true, name: true, status: true, plan: true, modulesJson: true },
    orderBy: { name: 'asc' },
  })

  return (
    <>
      <div className="topbar">
        <div className="title">Module Controls</div>
      </div>

      <div style={{ padding: '24px' }}>
        <div className="ct-card" style={{ padding: 20, marginBottom: 24 }}>
          <div style={{ fontWeight: 800, fontSize: 15, marginBottom: 4 }}>Platform Modules</div>
          <div style={{ fontSize: 13, color: 'var(--mut)', marginBottom: 20 }}>These modules are available to all companies. Per-company overrides can be set via the company detail page.</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(260px,1fr))', gap: 12 }}>
            {ALL_MODULES.map(mod => (
              <div key={mod.key} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px', borderRadius: 12, border: '1px solid var(--line)', background: '#fafcfe' }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 700, fontSize: 13 }}>{mod.label}</div>
                  <div style={{ fontSize: 11, color: 'var(--mut)', marginTop: 2 }}>{mod.desc}</div>
                </div>
                <div style={{ width: 40, height: 22, borderRadius: 11, background: 'var(--p)', position: 'relative', flexShrink: 0 }}>
                  <div style={{ position: 'absolute', right: 3, top: 3, width: 16, height: 16, borderRadius: '50%', background: '#fff', boxShadow: '0 1px 3px rgba(0,0,0,.2)' }}></div>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 12, color: 'var(--mut)' }}>PER-COMPANY MODULE STATUS</div>
        <div className="ct-card" style={{ overflowX: 'auto' }}>
          <table className="ct-table">
            <thead>
              <tr>
                <th>Company</th>
                <th>Plan</th>
                <th>Status</th>
                <th>Custom Modules</th>
              </tr>
            </thead>
            <tbody>
              {companies.map(c => {
                const mods = c.modulesJson as Record<string, boolean> | null
                const customCount = mods ? Object.values(mods).filter(Boolean).length : 0
                return (
                  <tr key={c.id}>
                    <td style={{ fontWeight: 700, fontSize: 14 }}>{c.name}</td>
                    <td><span className="chip chip-blue" style={{ fontSize: 11 }}>{c.plan}</span></td>
                    <td>
                      <span className={`chip ${c.status === 'ACTIVE' ? 'chip-green' : c.status === 'TRIAL' ? 'chip-amber' : 'chip-red'}`} style={{ fontSize: 11 }}>
                        <span className="chip-dot"></span>{c.status}
                      </span>
                    </td>
                    <td style={{ fontSize: 13, color: 'var(--mut)' }}>
                      {mods ? `${customCount} overrides` : 'Default (all enabled)'}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>
    </>
  )
}
