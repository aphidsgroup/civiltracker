import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { redirect } from 'next/navigation'
import Link from 'next/link'

export default async function UploadBillPage() {
  const session = await auth()
  if (!session?.user?.companyId) redirect('/login')

  const sites = await prisma.site.findMany({
    where: { companyId: session.user.companyId, deletedAt: null },
    orderBy: { name: 'asc' }
  })

  async function uploadBill(formData: FormData) {
    'use server'
    const session = await auth()
    if (!session?.user?.companyId) throw new Error('Unauthorized')

    // In a real implementation this would upload to Cloudinary and create the DB record
    // For now we just mock the process and redirect
    
    redirect('/dashboard') // Should redirect to /bills which doesn't exist yet
  }

  return (
    <>
      <div className="topbar">
        <div className="title">Upload Bill</div>
      </div>
      
      <div style={{ padding: '24px' }}>
        <form action={uploadBill} className="formcard">
          <div className="fgrid">
            <div className="field span2">
              <label className="flabel">Upload bill document</label>
              <div className="ct-upload-zone">
                <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#13558e" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
                <div style={{ fontWeight: 700, fontSize: '14px', marginTop: '4px' }}>Click to upload or drag & drop</div>
                <div style={{ fontSize: '13px', color: 'var(--mut)' }}>PDF, JPG, PNG or HEIC (max 10MB)</div>
                <input type="file" name="file" style={{ display: 'none' }} accept="image/*,.pdf" />
              </div>
            </div>
            
            <div className="field span2">
              <label className="flabel">Project site</label>
              <select name="siteId" className="inp" required>
                <option value="">Select site...</option>
                {sites.map(s => (
                  <option key={s.id} value={s.id}>{s.name} ({s.location})</option>
                ))}
              </select>
            </div>
            
            <div className="field">
              <label className="flabel">Vendor / Supplier</label>
              <input name="vendor" className="inp" placeholder="Vendor name" required />
            </div>
            <div className="field">
              <label className="flabel">Bill number</label>
              <input name="billNo" className="inp" placeholder="e.g. INV-2026-001" />
            </div>
            
            <div className="field">
              <label className="flabel">Amount (₹)</label>
              <input name="amount" type="number" step="0.01" className="inp" placeholder="0.00" required />
            </div>
            <div className="field">
              <label className="flabel">Bill Date</label>
              <input name="date" type="date" className="inp" defaultValue={new Date().toISOString().split('T')[0]} required />
            </div>
            
            <div className="field span2">
              <label className="flabel">Notes (Optional)</label>
              <textarea name="notes" className="ct-textarea" placeholder="Any additional information..."></textarea>
            </div>
          </div>
          
          <div className="formfoot">
            <Link href="/dashboard" className="btnG" style={{ textDecoration: 'none' }}>Cancel</Link>
            <button type="submit" className="btnP" style={{ border: 'none', fontFamily: 'inherit' }}>
              <svg className="svg18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12l4 4 10-10"/></svg>
              Upload Bill
            </button>
          </div>
        </form>
      </div>
    </>
  )
}
