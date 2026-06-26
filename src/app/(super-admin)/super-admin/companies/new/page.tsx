import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { prisma } from '@/lib/prisma'
import { revalidatePath } from 'next/cache'

async function createCompany(formData: FormData) {
  'use server'
  const name = formData.get('name') as string
  const email = formData.get('email') as string
  const phone = formData.get('phone') as string
  const gst = formData.get('gst') as string
  const city = formData.get('city') as string
  const state = formData.get('state') as string

  if (!name) return

  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-') + '-' + Math.random().toString(36).slice(2, 8)

  await prisma.company.create({
    data: { name, email: email || null, phone: phone || null, gst: gst || null, city: city || null, state: state || null, slug },
  })

  revalidatePath('/super-admin/companies')
  redirect('/super-admin/companies')
}

export default async function NewCompanyPage() {
  const session = await auth()
  if (session?.user?.role !== 'SUPER_ADMIN') redirect('/login')

  const plans = await prisma.subscriptionPlan.findMany({ orderBy: { price: 'asc' } })

  return (
    <>
      <div className="topbar">
        <div className="title">Create Company</div>
      </div>

      <div style={{ padding: '24px', maxWidth: 640 }}>
        <div className="ct-card">
          <form action={createCompany}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '18px' }}>
              <div style={{ gridColumn: '1 / -1' }}>
                <label style={{ display: 'block', fontSize: 12.5, fontWeight: 700, color: 'var(--mut)', marginBottom: 6 }}>Company Name *</label>
                <input name="name" required placeholder="Madras Construction Pvt Ltd"
                  style={{ width: '100%', border: '1.5px solid var(--line)', borderRadius: 10, padding: '10px 12px', fontSize: 14, fontFamily: 'inherit', outline: 'none', boxSizing: 'border-box' }} />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 12.5, fontWeight: 700, color: 'var(--mut)', marginBottom: 6 }}>Email</label>
                <input name="email" type="email" placeholder="admin@company.com"
                  style={{ width: '100%', border: '1.5px solid var(--line)', borderRadius: 10, padding: '10px 12px', fontSize: 14, fontFamily: 'inherit', outline: 'none', boxSizing: 'border-box' }} />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 12.5, fontWeight: 700, color: 'var(--mut)', marginBottom: 6 }}>Phone</label>
                <input name="phone" type="tel" placeholder="+91 98765 43210"
                  style={{ width: '100%', border: '1.5px solid var(--line)', borderRadius: 10, padding: '10px 12px', fontSize: 14, fontFamily: 'inherit', outline: 'none', boxSizing: 'border-box' }} />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 12.5, fontWeight: 700, color: 'var(--mut)', marginBottom: 6 }}>GST Number</label>
                <input name="gst" placeholder="22AAAAA0000A1Z5"
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
              {plans.length > 0 && (
                <div style={{ gridColumn: '1 / -1' }}>
                  <label style={{ display: 'block', fontSize: 12.5, fontWeight: 700, color: 'var(--mut)', marginBottom: 6 }}>Subscription Plan</label>
                  <select name="planId"
                    style={{ width: '100%', border: '1.5px solid var(--line)', borderRadius: 10, padding: '10px 12px', fontSize: 14, fontFamily: 'inherit', outline: 'none', boxSizing: 'border-box', background: '#fff' }}>
                    {plans.map(p => (
                      <option key={p.id} value={p.id}>{p.name} — ₹{p.price}/mo</option>
                    ))}
                  </select>
                </div>
              )}
            </div>

            <div style={{ marginTop: 24, display: 'flex', gap: 10 }}>
              <button type="submit"
                style={{ background: 'var(--p)', color: '#fff', border: 'none', borderRadius: 10, padding: '11px 24px', fontSize: 14, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>
                Create Company
              </button>
              <a href="/super-admin/companies"
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
