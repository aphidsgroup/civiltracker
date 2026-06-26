import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'

async function createSite(formData: FormData) {
  'use server'
  const { auth } = await import('@/lib/auth')
  const session = await auth()
  if (!session?.user?.companyId) return

  const name = formData.get('name') as string
  const address = formData.get('address') as string
  const city = formData.get('city') as string
  const state = formData.get('state') as string
  const projectType = formData.get('projectType') as string
  const budget = parseFloat(formData.get('budget') as string) || 0

  if (!name) return

  await prisma.site.create({
    data: {
      name,
      address: address || null,
      city: city || null,
      state: state || null,
      projectType: projectType || null,
      budget,
      companyId: session.user.companyId,
    },
  })

  revalidatePath('/sites')
  redirect('/sites')
}

export default async function NewSitePage() {
  const session = await auth()
  if (!session?.user) redirect('/login')

  return (
    <>
      <div className="topbar">
        <div className="title">New Site</div>
      </div>

      <div style={{ padding: '24px', maxWidth: 680 }}>
        <div className="ct-card">
          <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--mut)', marginBottom: 20, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Site Details</div>
          <form action={createSite}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '18px' }}>
              <div style={{ gridColumn: '1 / -1' }}>
                <label style={{ display: 'block', fontSize: 12.5, fontWeight: 700, color: 'var(--mut)', marginBottom: 6 }}>Site Name *</label>
                <input name="name" required placeholder="e.g. Marina Towers Block A"
                  style={{ width: '100%', border: '1.5px solid var(--line)', borderRadius: 10, padding: '10px 12px', fontSize: 14, fontFamily: 'inherit', outline: 'none', boxSizing: 'border-box' }} />
              </div>
              <div style={{ gridColumn: '1 / -1' }}>
                <label style={{ display: 'block', fontSize: 12.5, fontWeight: 700, color: 'var(--mut)', marginBottom: 6 }}>Address</label>
                <input name="address" placeholder="Street address"
                  style={{ width: '100%', border: '1.5px solid var(--line)', borderRadius: 10, padding: '10px 12px', fontSize: 14, fontFamily: 'inherit', outline: 'none', boxSizing: 'border-box' }} />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 12.5, fontWeight: 700, color: 'var(--mut)', marginBottom: 6 }}>City</label>
                <input name="city" placeholder="Chennai"
                  style={{ width: '100%', border: '1.5px solid var(--line)', borderRadius: 10, padding: '10px 12px', fontSize: 14, fontFamily: 'inherit', outline: 'none', boxSizing: 'border-box' }} />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 12.5, fontWeight: 700, color: 'var(--mut)', marginBottom: 6 }}>State</label>
                <input name="state" placeholder="Tamil Nadu"
                  style={{ width: '100%', border: '1.5px solid var(--line)', borderRadius: 10, padding: '10px 12px', fontSize: 14, fontFamily: 'inherit', outline: 'none', boxSizing: 'border-box' }} />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 12.5, fontWeight: 700, color: 'var(--mut)', marginBottom: 6 }}>Project Type</label>
                <select name="projectType"
                  style={{ width: '100%', border: '1.5px solid var(--line)', borderRadius: 10, padding: '10px 12px', fontSize: 14, fontFamily: 'inherit', outline: 'none', boxSizing: 'border-box', background: '#fff' }}>
                  <option value="">Select type</option>
                  <option value="RESIDENTIAL">Residential</option>
                  <option value="COMMERCIAL">Commercial</option>
                  <option value="INFRASTRUCTURE">Infrastructure</option>
                  <option value="INDUSTRIAL">Industrial</option>
                  <option value="RENOVATION">Renovation</option>
                </select>
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 12.5, fontWeight: 700, color: 'var(--mut)', marginBottom: 6 }}>Budget (₹)</label>
                <input name="budget" type="number" min="0" placeholder="5000000"
                  style={{ width: '100%', border: '1.5px solid var(--line)', borderRadius: 10, padding: '10px 12px', fontSize: 14, fontFamily: 'inherit', outline: 'none', boxSizing: 'border-box' }} />
              </div>
            </div>

            <div style={{ marginTop: 24, display: 'flex', gap: 10 }}>
              <button type="submit"
                style={{ background: 'var(--p)', color: '#fff', border: 'none', borderRadius: 10, padding: '11px 24px', fontSize: 14, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>
                Create Site
              </button>
              <a href="/sites"
                style={{ background: 'var(--bg)', color: 'var(--ink)', border: '1.5px solid var(--line)', borderRadius: 10, padding: '11px 20px', fontSize: 14, fontWeight: 600, textDecoration: 'none', display: 'inline-block' }}>
                Cancel
              </a>
            </div>
          </form>
        </div>
      </div>
    </>
  )
}
