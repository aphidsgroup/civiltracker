import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { redirect } from 'next/navigation'

export default async function StoragePage() {
  const session = await auth()
  if (session?.user?.role !== 'SUPER_ADMIN') redirect('/dashboard')

  const companies = await prisma.company.findMany({
    select: {
      id: true, name: true, plan: true, storageLimitMb: true, storageUsed: true, status: true,
      _count: { select: { sites: true } },
    },
    orderBy: { storageUsed: 'desc' },
  })

  const totalAgg = await prisma.company.aggregate({ _sum: { storageUsed: true, storageLimitMb: true } })
  const totalUsedMb = Number(totalAgg._sum.storageUsed || 0) / (1024 * 1024)
  const totalLimitMb = Number(totalAgg._sum.storageLimitMb || 0)
  const mediaCount = await prisma.mediaAsset.count()

  return (
    <>
      <div className="topbar">
        <div className="title">Storage Usage</div>
      </div>

      <div style={{ padding: '24px' }}>
        <div className="kpis" style={{ marginBottom: '24px' }}>
          <div className="kpi">
            <div className="klbl">Total Used</div>
            <div className="knum">{totalUsedMb.toFixed(1)} MB</div>
            <div className="ksub"><span>●</span> Across all companies</div>
          </div>
          <div className="kpi">
            <div className="klbl">Total Allotted</div>
            <div className="knum">{(totalLimitMb / 1024).toFixed(1)} GB</div>
            <div className="ksub"><span>●</span> Combined limits</div>
          </div>
          <div className="kpi">
            <div className="klbl">Media Assets</div>
            <div className="knum">{mediaCount}</div>
            <div className="ksub"><span>●</span> Cloudinary files</div>
          </div>
          <div className="kpi">
            <div className="klbl">Companies</div>
            <div className="knum">{companies.length}</div>
          </div>
        </div>

        <div className="ct-card" style={{ overflowX: 'auto' }}>
          <table className="ct-table">
            <thead>
              <tr>
                <th>Company</th>
                <th>Plan</th>
                <th>Sites</th>
                <th>Used</th>
                <th>Limit</th>
                <th>Usage</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {companies.map(c => {
                const usedMb = Number(c.storageUsed) / (1024 * 1024)
                const limitMb = c.storageLimitMb
                const pct = Math.min((usedMb / limitMb) * 100, 100)
                const barColor = pct > 90 ? 'var(--red)' : pct > 75 ? 'var(--amber)' : 'var(--p)'
                return (
                  <tr key={c.id}>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <div style={{ width: 36, height: 36, borderRadius: 10, background: 'linear-gradient(135deg,var(--p),#1d6fb5)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 13, flexShrink: 0 }}>
                          {c.name.substring(0, 2).toUpperCase()}
                        </div>
                        <div style={{ fontWeight: 700, fontSize: 14 }}>{c.name}</div>
                      </div>
                    </td>
                    <td><span className="chip chip-blue" style={{ fontSize: 11 }}>{c.plan}</span></td>
                    <td style={{ fontSize: 13, fontWeight: 600 }}>{c._count.sites}</td>
                    <td style={{ fontSize: 13, fontWeight: 700 }}>{usedMb.toFixed(2)} MB</td>
                    <td style={{ fontSize: 13, color: 'var(--mut)' }}>{limitMb} MB</td>
                    <td style={{ minWidth: 140 }}>
                      <div style={{ fontSize: 11, fontWeight: 700, marginBottom: 4, color: pct > 90 ? 'var(--red)' : 'var(--mut)' }}>{pct.toFixed(1)}%</div>
                      <div className="ct-progress">
                        <div className="ct-progress-fill" style={{ width: `${pct}%`, background: barColor }}></div>
                      </div>
                    </td>
                    <td>
                      <span className={`chip ${c.status === 'ACTIVE' ? 'chip-green' : c.status === 'TRIAL' ? 'chip-amber' : 'chip-red'}`} style={{ fontSize: 11 }}>
                        <span className="chip-dot"></span>{c.status}
                      </span>
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
