import { auth } from '@/lib/auth'
import prisma from '@/lib/prisma'
import Link from 'next/link'
import { formatCurrency } from '@/lib/utils'

export default async function MobileHome() {
  const session = await auth()
  const companyId = session?.user?.companyId

  const sites = await prisma.site.findMany({ where: { companyId }, take: 1 })
  const activeSite = sites[0]

  return (
    <>
      <div className="appbar">
        <div className="sitepill">
          <div className="sitedot">
            <svg className="svg18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>
          </div>
          <div>
            <div className="sitenm">{activeSite ? activeSite.name : 'No Active Site'}</div>
            <div className="sitesub">Current location</div>
          </div>
        </div>
        <div className="hbtns">
          <div className="sync ok"><span className="sdot"></span>Synced</div>
          <div className="bell">
            <svg className="svg22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>
            <b></b>
          </div>
        </div>
      </div>

      <div className="greet">
        <div>
          <div className="gname">Hi, {session?.user?.name?.split(' ')[0]}</div>
          <div className="grole">Site Engineer</div>
        </div>
        <div className="gdate">
          {new Date().toLocaleDateString('en-US', { weekday: 'long' })}<br/>
          {new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric' })}
        </div>
      </div>

      <div className="hero">
        <div className="herotop">
          <div className="herolbl">TODAY&apos;S SUMMARY</div>
          <div className="herochip">Pending sync: 0</div>
        </div>
        <div className="herorow">
          <div className="hstat">
            <div className="hnum"><small>₹</small>12,450</div>
            <div className="hsub">Expenses logged</div>
          </div>
          <div className="hstat">
            <div className="hnum">42</div>
            <div className="hsub">Labourers present</div>
          </div>
        </div>
        <div className="herobar">
          <div className="hbline"><span>Weekly Budget</span><span>62% used</span></div>
          <div className="htrack"><div className="hfill"></div></div>
        </div>
      </div>

      <div className="shead">
        <div className="stitle">Quick Actions</div>
      </div>
      <div className="qgrid">
        <Link href="/mobile/upload-bill" className="qtile" style={{ textDecoration: 'none', color: 'inherit' }}>
          <div className="ic ic-blue">
            <svg className="svg24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="12" y1="18" x2="12" y2="12"/><line x1="9" y1="15" x2="15" y2="15"/></svg>
          </div>
          <div className="qtitle">Upload Bill</div>
          <div className="qmeta">Vendor invoice</div>
        </Link>
        <Link href="/mobile/add-expense" className="qtile" style={{ textDecoration: 'none', color: 'inherit' }}>
          <div className="ic ic-amber">
            <svg className="svg24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 7a2 2 0 0 1 2-2h12v4M3 7v10a2 2 0 0 0 2 2h14V9H5a2 2 0 0 1-2-2Z"/><circle cx="16" cy="13" r="1.3" fill="currentColor"/></svg>
          </div>
          <div className="qtitle">Add Expense</div>
          <div className="qmeta">Petty cash</div>
        </Link>
        <Link href="/mobile/attendance" className="qtile" style={{ textDecoration: 'none', color: 'inherit' }}>
          <div className="ic ic-green">
            <svg className="svg24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
          </div>
          <div className="qtitle">Attendance</div>
          <div className="qmeta">Mark workers</div>
          <div className="qbadge">!</div>
        </Link>
        <Link href="/mobile/site-photo" className="qtile" style={{ textDecoration: 'none', color: 'inherit' }}>
          <div className="ic ic-violet">
            <svg className="svg24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>
          </div>
          <div className="qtitle">Site Photo</div>
          <div className="qmeta">Progress pic</div>
        </Link>
        <Link href="/mobile/dpr" className="qtile qwide" style={{ textDecoration: 'none' }}>
          <div className="ic">
            <svg className="svg24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
          </div>
          <div>
            <div className="qwtitle">Create Daily Report (DPR)</div>
            <div className="qwsub"><span className="duepip"></span>Due in 3 hours</div>
          </div>
        </Link>
      </div>

      <div className="shead">
        <div className="stitle">Recent Uploads</div>
        <div className="slink">See all</div>
      </div>
      <div className="card">
        <div className="lrow">
          <div className="licon"><svg className="svg24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"/><line x1="3" y1="6" x2="21" y2="6"/><path d="M16 10a4 4 0 0 1-8 0"/></svg></div>
          <div className="lmain">
            <div className="lt1">Cement Bags (Ultratech)</div>
            <div className="lt2">Materials · Sri Ram Traders</div>
            <div className="schip amber">Pending</div>
          </div>
          <div className="lright">
            <div className="lamt">₹8,400</div>
          </div>
        </div>
      </div>
    </>
  )
}
