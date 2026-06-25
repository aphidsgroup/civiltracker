import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { redirect } from 'next/navigation'
import Link from 'next/link'

export default async function CreateSitePage() {
  const session = await auth()
  if (!session?.user?.companyId) redirect('/login')

  const clients = await prisma.user.findMany({
    where: { 
      role: 'CLIENT',
      companyMembers: { some: { companyId: session.user.companyId } }
    },
    orderBy: { name: 'asc' }
  })

  async function createSite(formData: FormData) {
    'use server'
    const session = await auth()
    if (!session?.user?.companyId) throw new Error('Unauthorized')

    const name = formData.get('name') as string
    const location = formData.get('location') as string
    const budget = Number(formData.get('budget'))
    const clientId = formData.get('clientId') as string || null
    
    await prisma.site.create({
      data: {
        name,
        slug: name.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
        location,
        budget,
        clientId,
        companyId: session.user.companyId,
        status: 'PLANNING',
      }
    })

    redirect('/sites')
  }

  return (
    <>
      <div className="topbar">
        <div className="title">Create Project Site</div>
      </div>
      
      <div style={{ padding: '24px' }}>
        <form action={createSite} className="formcard">
          <div className="fgrid">
            <div className="field span2">
              <label className="flabel">Project name</label>
              <input name="name" className="inp" placeholder="e.g. Marina Bay Sands Extension" required />
            </div>
            
            <div className="field span2">
              <label className="flabel">Location</label>
              <input name="location" className="inp" placeholder="e.g. 10 Bayfront Ave, Singapore" required />
            </div>
            
            <div className="field">
              <label className="flabel">Project budget (₹)</label>
              <input name="budget" type="number" className="inp" placeholder="10000000" required />
            </div>
            
            <div className="field">
              <label className="flabel">Assign Client (Optional)</label>
              <select name="clientId" className="inp" defaultValue="">
                <option value="">No client assigned yet</option>
                {clients.map(c => (
                  <option key={c.id} value={c.id}>{c.name} ({c.email})</option>
                ))}
              </select>
            </div>
          </div>
          
          <div className="formfoot">
            <Link href="/sites" className="btnG" style={{ textDecoration: 'none' }}>Cancel</Link>
            <button type="submit" className="btnP" style={{ border: 'none', fontFamily: 'inherit' }}>
              <svg className="svg18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12l4 4 10-10"/></svg>
              Create Project
            </button>
          </div>
        </form>
      </div>
    </>
  )
}
