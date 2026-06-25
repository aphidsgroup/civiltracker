import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import Link from 'next/link'

export default async function SuperAdminLayout({ children }: { children: React.ReactNode }) {
  const session = await auth()
  if (!session?.user || session.user.role !== 'SUPER_ADMIN') redirect('/login')

  return (
    <div className="ct app sa-layout">
      <div className="side" style={{ background: 'linear-gradient(180deg, #0a1d33, #08172a)' }}>
        <div className="brand">
          <div className="blogo" style={{ background: 'linear-gradient(135deg, #f3b43a, #e08a0b)', color: '#3a2a05' }}>
            <svg className="svg22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2l2.5 5 5.5.8-4 3.9.9 5.5L12 20l-4.9 2.6.9-5.5-4-3.9 5.5-.8z"/></svg>
          </div>
          <div className="bname">Civil Tracker<small style={{ color: '#7d94a8' }}>Super Admin</small></div>
        </div>
        
        <div className="nav" style={{ marginTop: '20px' }}>
          <div className="ngroup">Platform</div>
          <Link href="/super-admin/dashboard" className="navi"><svg className="svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="8" height="8" rx="1.5"/><rect x="13" y="3" width="8" height="5" rx="1.5"/><rect x="13" y="10" width="8" height="11" rx="1.5"/><rect x="3" y="13" width="8" height="8" rx="1.5"/></svg>Dashboard</Link>
          <Link href="/super-admin/companies" className="navi"><svg className="svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M3 21V8l6-4 6 4v13"/><path d="M15 21V11l6 4v6"/><path d="M7 9h0M7 13h0M7 17h0"/></svg>Companies</Link>
          <div className="ngroup">Billing</div>
          <Link href="/super-admin/subscriptions" className="navi"><svg className="svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="5" width="20" height="14" rx="2"/><path d="M2 10h20"/></svg>Subscriptions</Link>
          <div className="ngroup">Settings</div>
          <Link href="/super-admin/settings" className="navi"><svg className="svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 14a1.6 1.6 0 0 0 .3 1.8 2 2 0 1 1-2.8 2.8 1.6 1.6 0 0 0-2.7 1.1 2 2 0 1 1-4 0 1.6 1.6 0 0 0-2.7-1.1 2 2 0 1 1-2.8-2.8A1.6 1.6 0 0 0 3 14a2 2 0 1 1 0-4 1.6 1.6 0 0 0 1.7-2.7 2 2 0 1 1 2.8-2.8A1.6 1.6 0 0 0 10 3.7a2 2 0 1 1 4 0 1.6 1.6 0 0 0 2.7 1.1 2 2 0 1 1 2.8 2.8A1.6 1.6 0 0 0 20.3 10a2 2 0 1 1 0 4Z"/></svg>Settings</Link>
        </div>
      </div>
      <div className="main">
        <div className="topbar">
          <div><div className="ptitle">Super Admin</div><div className="pcrumb">Manage all platform data</div></div>
        </div>
        <div className="content">
          {children}
        </div>
      </div>
    </div>
  )
}
