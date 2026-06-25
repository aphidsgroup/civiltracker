import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { slugify } from '@/lib/utils'

export default async function CreateCompanyPage() {
  const session = await auth()
  if (session?.user?.role !== 'SUPER_ADMIN') redirect('/dashboard')

  async function createCompany(formData: FormData) {
    'use server'
    const name = formData.get('name') as string
    const slug = formData.get('slug') as string || slugify(name)
    const ownerName = formData.get('ownerName') as string
    const ownerEmail = formData.get('ownerEmail') as string
    const ownerPhone = formData.get('ownerPhone') as string
    const plan = formData.get('plan') as string || 'PRO'
    
    // Create the company and owner in a transaction
    await prisma.$transaction(async (tx) => {
      const company = await tx.company.create({
        data: {
          name,
          slug,
          plan,
          status: 'ACTIVE',
        }
      })
      
      await tx.user.create({
        data: {
          name: ownerName,
          email: ownerEmail,
          phone: ownerPhone,
          passwordHash: '', // Need a password hash placeholder
          role: 'COMPANY_ADMIN',
          companyMembers: {
            create: {
              companyId: company.id,
              role: 'COMPANY_ADMIN'
            }
          }
        }
      })
    })

    redirect('/super-admin/companies')
  }

  return (
    <>
      <div className="topbar">
        <div className="title">Create Company</div>
      </div>
      
      <div style={{ padding: '24px' }}>
        <form action={createCompany} className="formcard">
          <div className="fgrid">
            <div className="field span2">
              <label className="flabel">Company logo</label>
              <div className="upbox">
                <div className="upic">
                  <svg className="svg22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M3 8a2 2 0 0 1 2-2h2l1.4-2h5.2L20 6a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><circle cx="12" cy="12.5" r="3.2"/></svg>
                </div>
                <div>
                  <div style={{ fontWeight: 700, fontSize: '13px' }}>Upload logo to Cloudinary</div>
                  <div className="cos">PNG or SVG • square • max 2 MB</div>
                </div>
              </div>
            </div>
            
            <div className="field">
              <label className="flabel">Company name</label>
              <input name="name" className="inp" placeholder="e.g. Chola Builders" required />
            </div>
            <div className="field">
              <label className="flabel">Workspace slug</label>
              <input name="slug" className="inp" placeholder="chola-builders" />
            </div>
            
            <div className="field">
              <label className="flabel">Owner name</label>
              <input name="ownerName" className="inp" placeholder="Full name" required />
            </div>
            <div className="field">
              <label className="flabel">Owner email</label>
              <input name="ownerEmail" type="email" className="inp" placeholder="owner@company.com" required />
            </div>
            
            <div className="field">
              <label className="flabel">Owner phone</label>
              <input name="ownerPhone" className="inp" placeholder="+91 ..........." />
            </div>
            <div className="field">
              <label className="flabel">GST number</label>
              <input name="gst" className="inp" placeholder="33XXXXX...." />
            </div>
            
            <div className="field span2">
              <label className="flabel">Registered address</label>
              <input name="address" className="inp" placeholder="Street, area, city, Tamil Nadu" />
            </div>
            
            <div className="field">
              <label className="flabel">User limit</label>
              <input name="userLimit" type="number" className="inp" defaultValue={50} />
            </div>
            <div className="field">
              <label className="flabel">Storage limit (GB)</label>
              <input name="storageLimit" type="number" className="inp" defaultValue={20} />
            </div>
          </div>
          
          <div className="formfoot">
            <Link href="/super-admin/companies" className="btnG" style={{ textDecoration: 'none' }}>Cancel</Link>
            <button type="submit" className="btnP" style={{ border: 'none', fontFamily: 'inherit' }}>
              <svg className="svg18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12l4 4 10-10"/></svg>
              Create & send admin login
            </button>
          </div>
        </form>
      </div>
    </>
  )
}
