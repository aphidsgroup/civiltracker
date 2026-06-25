import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { formatCurrency, formatDateTime, formatDate } from '@/lib/utils'

export default async function SiteDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const session = await auth()
  if (!session?.user?.companyId) redirect('/login')
  const { id } = await params

  const site = await prisma.site.findFirst({
    where: { id, companyId: session.user.companyId, deletedAt: null },
    include: {
      dprs: { orderBy: { date: 'desc' }, take: 1, include: { createdBy: true } },
    }
  })

  if (!site) redirect('/sites')

  const budget = Number(site.budget) || 0
  const spent = Number(site.spent) || 0
  const progress = site.progress || 0
  const latestDpr = site.dprs[0]

  return (
    <>
      <div className="pageact">
        <div className="filtbar" style={{ gap: '10px' }}>
          <Link href="/sites" className="backb2" style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', fontWeight: 700, color: '#647387', cursor: 'pointer', textDecoration: 'none' }}>
            <svg className="svg16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M15 6l-6 6 6 6"/></svg>
            Sites
          </Link>
          <div style={{ fontSize: '17px', fontWeight: 800 }}>{site.name}</div>
          <div className="schip green"><span className="sdot"></span>{site.status.replace('_', ' ')}</div>
        </div>
        <div className="miniact">Share to client</div>
      </div>
      
      <div className="tabs">
        <div className="tab on">Overview</div>
        <div className="tab">DPR</div>
        <div className="tab">Expenses</div>
        <div className="tab">Bills</div>
        <div className="tab">Labour</div>
        <div className="tab">Materials</div>
        <div className="tab">Tasks</div>
        <div className="tab">BOQ</div>
      </div>
      
      <div className="statrow">
        <div className="statc dark">
          <div className="statn">{progress}%</div>
          <div className="statl">Overall progress • {site.currentStage || 'Planning'} stage</div>
        </div>
        <div className="statc">
          <div className="statn">{formatCurrency(spent)}</div>
          <div className="statl">Spent of {formatCurrency(budget)}</div>
        </div>
        <div className="statc">
          <div className="statn">-</div>
          <div className="statl">Labour present</div>
        </div>
        <div className="statc">
          <div className="statn" style={{ color: '#a96c08' }}>0</div>
          <div className="statl">Pending approvals</div>
        </div>
      </div>
      
      <div className="dgrid">
        <div className="colL">
          <div className="card">
            <div className="chead"><div className="ctitle">Budget vs Actual by head</div></div>
            <div className="cbody">
              <div style={{ padding: '20px', textAlign: 'center', color: 'var(--mut)', fontSize: '13px' }}>
                Detailed budget breakdown is not configured for this project.
              </div>
            </div>
          </div>
          
          <div className="card">
            <div className="chead">
              <div className="ctitle">Today&apos;s site update</div>
              <div className="csub">
                {latestDpr ? `From DPR • ${formatDateTime(latestDpr.createdAt)}` : 'No recent updates'}
              </div>
            </div>
            <div className="cbody">
              <div style={{ fontSize: '13.5px', lineHeight: 1.6, color: '#3a4b5c', fontWeight: 500 }}>
                {latestDpr ? latestDpr.workDone : 'No DPRs submitted for this site yet.'}
              </div>
            </div>
          </div>
        </div>
        
        <div className="colR">
          <div className="card">
            <div className="chead"><div className="ctitle">Site facts</div></div>
            <div className="cbody">
              <div className="metarow"><span className="metak">Client</span><span className="metav">{site.clientName || '-'}</span></div>
              <div className="metarow"><span className="metak">Contract</span><span className="metav">Item-rate • {formatCurrency(budget)}</span></div>
              <div className="metarow"><span className="metak">Start</span><span className="metav">{formatDate(site.startDate)}</span></div>
              <div className="metarow"><span className="metak">Handover</span><span className="metav">{formatDate(site.handoverDate)}</span></div>
              <div className="metarow"><span className="metak">Location</span><span className="metav">{site.location}</span></div>
            </div>
          </div>
        </div>
      </div>
    </>
  )
}
