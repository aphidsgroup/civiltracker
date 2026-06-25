import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { getInitials, formatDateTime } from '@/lib/utils'

export default async function CompaniesPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>
}) {
  const session = await auth()
  if (session?.user?.role !== 'SUPER_ADMIN') redirect('/dashboard')

  const resolvedSearchParams = await searchParams
  const tab = resolvedSearchParams.tab || 'all'

  const companies = await prisma.company.findMany({
    where: tab === 'all' ? {} : { status: tab.toUpperCase() as any },
    include: {
      members: { where: { role: 'COMPANY_ADMIN' }, include: { user: true } },
      sites: true,
      _count: { select: { members: true, sites: true } }
    },
    orderBy: { createdAt: 'desc' }
  })

  // Calculate totals for tabs
  const allCount = await prisma.company.count()
  const activeCount = await prisma.company.count({ where: { status: 'ACTIVE' } })
  const trialCount = await prisma.company.count({ where: { status: 'TRIAL' } })
  const suspendedCount = await prisma.company.count({ where: { status: 'SUSPENDED' } })

  const tabs = [
    { id: 'all', label: 'All Companies', count: allCount },
    { id: 'active', label: 'Active', count: activeCount },
    { id: 'trial', label: 'Trial', count: trialCount },
    { id: 'suspended', label: 'Suspended', count: suspendedCount },
  ]

  return (
    <>
      <div className="topbar">
        <div className="title">Company Directory</div>
        <Link href="/super-admin/companies/new" className="btn-primary" style={{ textDecoration: 'none' }}>
          <svg className="svg16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M12 5v14M5 12h14"/></svg>
          Add Company
        </Link>
      </div>
      
      <div style={{ padding: '24px' }}>
        <div className="tabs" style={{ display: 'flex', gap: '8px', marginBottom: '20px', background: '#fff', padding: '6px', borderRadius: '12px', border: '1px solid var(--line)', width: 'fit-content' }}>
          {tabs.map(t => (
            <Link 
              key={t.id} 
              href={`?tab=${t.id}`}
              style={{
                padding: '8px 16px',
                borderRadius: '8px',
                fontSize: '13px',
                fontWeight: 600,
                textDecoration: 'none',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                color: tab === t.id ? '#13558e' : 'var(--mut)',
                background: tab === t.id ? 'rgba(19,85,142,0.06)' : 'transparent'
              }}
            >
              {t.label}
              <span style={{ 
                background: tab === t.id ? '#13558e' : '#eef2f6', 
                color: tab === t.id ? '#fff' : 'var(--mut)',
                padding: '2px 6px',
                borderRadius: '4px',
                fontSize: '11px',
                fontWeight: 700
              }}>
                {t.count}
              </span>
            </Link>
          ))}
        </div>

        <div className="ct-card" style={{ overflowX: 'auto' }}>
          <table className="ct-table">
            <thead>
              <tr>
                <th>Company</th>
                <th>Owner</th>
                <th>Plan</th>
                <th>Sites</th>
                <th>Users</th>
                <th>Storage</th>
                <th>Status</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {companies.map(c => {
                const owner = c.members[0]?.user
                const maxUsers = 50 // Mock max users based on plan
                const maxSites = 10 // Mock max sites
                
                const sitePct = Math.min((c._count.sites / maxSites) * 100, 100)
                const userPct = Math.min((c._count.members / maxUsers) * 100, 100)
                
                let stCls = 'chip-green'
                if (c.status === 'TRIAL') stCls = 'chip-amber'
                if (c.status === 'SUSPENDED') stCls = 'chip-red'

                return (
                  <tr key={c.id}>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                        <div style={{ 
                          width: '40px', height: '40px', borderRadius: '10px', 
                          background: `linear-gradient(135deg, var(--p), var(--p3))`,
                          color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center',
                          fontSize: '14px', fontWeight: 700
                        }}>
                          {getInitials(c.name)}
                        </div>
                        <div>
                          <div style={{ fontWeight: 700, fontSize: '14px', color: 'var(--ink)' }}>{c.name}</div>
                          <div style={{ fontSize: '12px', color: 'var(--mut)', marginTop: '2px' }}>
                            {c.city} • since {new Date(c.createdAt).getFullYear()}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td>
                      <div style={{ fontWeight: 600, fontSize: '13px' }}>{owner?.name || 'No Owner'}</div>
                      <div style={{ fontSize: '12px', color: 'var(--mut)', marginTop: '2px' }}>{owner?.phone || owner?.email || '-'}</div>
                    </td>
                    <td>
                      <div className="chip chip-blue">{c.plan || 'PRO'}</div>
                    </td>
                    <td>
                      <div style={{ fontSize: '12px', fontWeight: 600, marginBottom: '6px' }}>{c._count.sites} of {maxSites} used</div>
                      <div className="ct-progress">
                        <div className={`ct-progress-fill ${sitePct > 90 ? 'red' : sitePct > 75 ? 'amber' : ''}`} style={{ width: `${sitePct}%` }}></div>
                      </div>
                    </td>
                    <td>
                      <div style={{ fontSize: '12px', fontWeight: 600, marginBottom: '6px' }}>{c._count.members} of {maxUsers} active</div>
                      <div className="ct-progress">
                        <div className={`ct-progress-fill ${userPct > 90 ? 'red' : userPct > 75 ? 'amber' : ''}`} style={{ width: `${userPct}%` }}></div>
                      </div>
                    </td>
                    <td>
                      <div style={{ fontWeight: 600, fontSize: '13px' }}>{(Number(c.storageUsed) / (1024 * 1024)).toFixed(1)} MB</div>
                    </td>
                    <td>
                      <div className={`chip ${stCls}`}>
                        <span className="chip-dot"></span>
                        {c.status}
                      </div>
                    </td>
                    <td>
                      <Link href={`/super-admin/companies/${c.id}`} style={{ textDecoration: 'none' }}>
                        <div className="btn-ghost" style={{ padding: '6px 12px', fontSize: '12px' }}>Manage</div>
                      </Link>
                    </td>
                  </tr>
                )
              })}
              
              {companies.length === 0 && (
                <tr>
                  <td colSpan={8} style={{ textAlign: 'center', padding: '40px', color: 'var(--mut)' }}>
                    No companies found for this status.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </>
  )
}
