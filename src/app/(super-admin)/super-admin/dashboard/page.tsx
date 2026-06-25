import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import Link from 'next/link'
import { redirect } from 'next/navigation'

export default async function SuperAdminDashboard() {
  const session = await auth()
  if (session?.user?.role !== 'SUPER_ADMIN') redirect('/dashboard')

  const totalCompanies = await prisma.company.count({ where: { deletedAt: null } })
  const activeCompanies = await prisma.company.count({ where: { deletedAt: null, status: 'ACTIVE' } })
  const trialCompanies = await prisma.company.count({ where: { deletedAt: null, status: 'TRIAL' } })
  const suspendedCompanies = await prisma.company.count({ where: { deletedAt: null, status: 'SUSPENDED' } })

  const totalSites = await prisma.site.count({ where: { deletedAt: null } })
  const totalUsers = await prisma.user.count({ where: { deletedAt: null } })
  
  const storageAgg = await prisma.company.aggregate({
    where: { deletedAt: null },
    _sum: { storageUsed: true }
  })
  const totalStorageGb = ((storageAgg._sum.storageUsed || 0) / (1024 * 1024 * 1024)).toFixed(1)

  const topCompanies = await prisma.company.findMany({
    where: { deletedAt: null },
    orderBy: { createdAt: 'desc' },
    take: 5,
    include: {
      _count: {
        select: { sites: true, members: true }
      }
    }
  })

  return (
    <>
      <div className="kpis">
        <div className="kpi feat">
          <div className="klbl">Total companies</div>
          <div className="knum">{totalCompanies}</div>
          <div className="ksub"><span>▲</span>Platform total</div>
        </div>
        <div className="kpi">
          <div className="klbl">Active</div>
          <div className="knum">{activeCompanies}</div>
          <div className="ksub up"><span>●</span>{Math.round((activeCompanies / (totalCompanies || 1)) * 100)}% of base</div>
        </div>
        <div className="kpi">
          <div className="klbl">On trial</div>
          <div className="knum">{trialCompanies}</div>
          <div className="ksub warn"><span>●</span>Free trials</div>
        </div>
        <div className="kpi">
          <div className="klbl">Suspended</div>
          <div className="knum">{suspendedCompanies}</div>
          <div className="ksub down"><span>●</span>Billing failed</div>
        </div>
        <div className="kpi">
          <div className="klbl">Monthly revenue</div>
          <div className="knum">₹6.4 L</div>
          <div className="ksub up"><span>▲</span>+12% MoM</div>
        </div>
      </div>
      
      <div className="minirow">
        <div className="mini">
          <div className="miic ic-blue">
            <svg className="svg22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="5" y="3" width="14" height="18" rx="1.5"/><path d="M9 7h2M13 7h2M9 11h2M13 11h2"/></svg>
          </div>
          <div><div className="min">{totalSites}</div><div className="mil">Total sites</div></div>
        </div>
        <div className="mini">
          <div className="miic ic-violet">
            <svg className="svg22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="9" cy="8" r="3"/><path d="M3 20a6 6 0 0 1 12 0"/><path d="M16 5.5a3 3 0 0 1 0 5"/></svg>
          </div>
          <div><div className="min">{totalUsers}</div><div className="mil">Total users</div></div>
        </div>
        <div className="mini">
          <div className="miic ic-green">
            <svg className="svg22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><ellipse cx="12" cy="6" rx="8" ry="3"/><path d="M4 6v12c0 1.7 3.6 3 8 3s8-1.3 8-3V6"/></svg>
          </div>
          <div><div className="min">{totalStorageGb} GB</div><div className="mil">Cloudinary storage</div></div>
        </div>
        <div className="mini">
          <div className="miic ic-red">
            <svg className="svg22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
          </div>
          <div><div className="min">7</div><div className="mil">Open tickets</div></div>
        </div>
      </div>
      
      <div className="dgrid">
        <div className="colL">
          <div className="card">
            <div className="chead">
              <div><div className="ctitle">Companies</div><div className="csub">{totalCompanies} total · sorted by recent</div></div>
              <Link href="/super-admin/companies" className="clink">Manage all</Link>
            </div>
            <div className="cbody" style={{ paddingTop: '4px' }}>
              {topCompanies.map(c => (
                <div key={c.id} className="lrow">
                  <div className="lava" style={{ background: '#13558e', color: '#fff' }}>{c.name.substring(0, 2).toUpperCase()}</div>
                  <div className="lmain">
                    <div className="lt1">{c.name}</div>
                    <div className="lt2">{c.city || 'Unknown'} · {c._count.sites} sites · {c._count.members} users</div>
                  </div>
                  <div className="schip mut">{c.plan}</div>
                  <div className={`schip ${c.status === 'ACTIVE' ? 'green' : c.status === 'TRIAL' ? 'amber' : 'red'}`} style={{ marginLeft: '8px' }}>
                    <span className="sdot"></span>{c.status}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
        
        <div className="colR">
          <div className="card">
            <div className="chead"><div className="ctitle">Storage usage</div></div>
            <div className="cbody">
              <div className="storebig">{totalStorageGb} GB <small>/ 500 GB</small></div>
              <div className="stract">
                <div className="sttrack">
                  <div className="sfill" style={{ width: `${Math.min((Number(totalStorageGb) / 500) * 100, 100)}%` }}></div>
                </div>
              </div>
              <div className="smeta">Cloudinary · {((Number(totalStorageGb) / 500) * 100).toFixed(1)}% of plan capacity used</div>
            </div>
          </div>
        </div>
      </div>
    </>
  )
}
