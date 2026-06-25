import { auth } from '@/lib/auth'
import prisma from '@/lib/prisma'
import Link from 'next/link'
import { formatCurrency } from '@/lib/utils'

export default async function CompanyDashboard() {
  const session = await auth()
  
  return (
    <>
      <div className="kpis">
        <div className="kpi feat">
          <div className="klbl">Total Site Spend</div>
          <div className="knum">₹14.2 L</div>
          <div className="ksub"><span>▲</span>+8% from last month</div>
        </div>
        <div className="kpi">
          <div className="klbl">Pending Approvals</div>
          <div className="knum">12</div>
          <div className="ksub warn"><span>●</span>5 high priority</div>
        </div>
        <div className="kpi">
          <div className="klbl">Active Labourers</div>
          <div className="knum">184</div>
          <div className="ksub up"><span>●</span>Across 4 sites</div>
        </div>
        <div className="kpi">
          <div className="klbl">Upcoming Bills</div>
          <div className="knum">₹3.8 L</div>
          <div className="ksub down"><span>●</span>Due this week</div>
        </div>
      </div>
      
      <div className="dgrid">
        <div className="colL">
          <div className="card">
            <div className="chead">
              <div>
                <div className="ctitle">Active Sites</div>
                <div className="csub">Sorted by highest spend</div>
              </div>
              <Link href="/sites" className="clink">View all</Link>
            </div>
            <div className="cbody" style={{ padding: 0 }}>
              <table className="ct-table">
                <thead>
                  <tr>
                    <th>Site Name</th>
                    <th>Manager</th>
                    <th>Progress</th>
                    <th>Spend</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td>
                      <div className="conm">Anna Nagar Metro</div>
                      <div className="csub">Chennai, TN</div>
                    </td>
                    <td>Ramesh K.</td>
                    <td>
                      <div className="ct-progress" style={{ width: '100px' }}><div className="ct-progress-fill" style={{ width: '68%' }}></div></div>
                      <div className="csub" style={{ marginTop: '4px' }}>68% complete</div>
                    </td>
                    <td className="conm">₹8.4 L</td>
                    <td><span className="chip chip-green"><span className="chip-dot"></span>Active</span></td>
                  </tr>
                  <tr>
                    <td>
                      <div className="conm">Tidel Park Extension</div>
                      <div className="csub">Taramani, TN</div>
                    </td>
                    <td>Suresh M.</td>
                    <td>
                      <div className="ct-progress" style={{ width: '100px' }}><div className="ct-progress-fill amber" style={{ width: '32%' }}></div></div>
                      <div className="csub" style={{ marginTop: '4px' }}>32% complete</div>
                    </td>
                    <td className="conm">₹4.2 L</td>
                    <td><span className="chip chip-amber"><span className="chip-dot"></span>Delayed</span></td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>
        
        <div className="colR">
          <div className="card">
            <div className="chead">
              <div>
                <div className="ctitle">Recent Activity</div>
                <div className="csub">Latest expenses and updates</div>
              </div>
            </div>
            <div className="cbody">
              <div className="dgrid" style={{ gap: '14px', display: 'flex', flexDirection: 'column' }}>
                <div style={{ display: 'flex', gap: '12px' }}>
                  <div style={{ width: '32px', height: '32px', borderRadius: '50%', background: '#e2f3ea', color: '#0f7a45', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <svg className="svg16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
                  </div>
                  <div>
                    <div style={{ fontSize: '13px', fontWeight: 600 }}>Bill Approved</div>
                    <div style={{ fontSize: '12px', color: 'var(--mut)', marginTop: '2px' }}>₹45,000 to Sri Ram Traders</div>
                    <div style={{ fontSize: '10.5px', color: '#8aa0b3', marginTop: '4px' }}>2 hours ago</div>
                  </div>
                </div>
                <div style={{ display: 'flex', gap: '12px' }}>
                  <div style={{ width: '32px', height: '32px', borderRadius: '50%', background: '#e7f0fb', color: '#13558e', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <svg className="svg16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="12" y1="18" x2="12" y2="12"/><line x1="9" y1="15" x2="15" y2="15"/></svg>
                  </div>
                  <div>
                    <div style={{ fontSize: '13px', fontWeight: 600 }}>New Expense Uploaded</div>
                    <div style={{ fontSize: '12px', color: 'var(--mut)', marginTop: '2px' }}>Cement bags at Anna Nagar</div>
                    <div style={{ fontSize: '10.5px', color: '#8aa0b3', marginTop: '4px' }}>5 hours ago</div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  )
}
