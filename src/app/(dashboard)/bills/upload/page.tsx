import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { Upload, Check } from 'lucide-react'

export default async function UploadBillPage() {
  const session = await auth()
  if (!session?.user?.companyId) redirect('/login')

  const sites = await prisma.site.findMany({
    where: { companyId: session.user.companyId, deletedAt: null },
    orderBy: { name: 'asc' }
  })

  async function uploadBill(_formData: FormData) {
    'use server'
    const session = await auth()
    if (!session?.user?.companyId) throw new Error('Unauthorized')

    // In a real implementation this would upload to Cloudinary and create the DB record
    // For now we just mock the process and redirect
    
    redirect('/dashboard') // Should redirect to /bills which doesn't exist yet
  }

  return (
    <>
      <div className="flex items-center justify-between pb-6 border-b border-slate-200 mb-6">
        <h1 className="text-2xl font-bold text-slate-900">Upload Bill</h1>
      </div>
      
      <div className="max-w-2xl">
        <form action={uploadBill} className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="flex flex-col md:col-span-2">
              <label className="text-xs font-bold text-slate-500 mb-1.5">Upload bill document</label>
              <div className="border-2 border-dashed border-blue-300 rounded-xl p-8 flex flex-col items-center justify-center text-center bg-blue-50/50 hover:bg-blue-50 cursor-pointer transition-colors">
                <Upload className="w-10 h-10 text-blue-800" />
                <div className="font-bold text-sm mt-1 text-slate-900">Click to upload or drag & drop</div>
                <div className="text-xs text-slate-500">PDF, JPG, PNG or HEIC (max 10MB)</div>
                <input type="file" name="file" className="hidden" accept="image/*,.pdf" />
              </div>
            </div>
            
            <div className="flex flex-col md:col-span-2">
              <label className="text-xs font-bold text-slate-500 mb-1.5">Project site</label>
              <select name="siteId" className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white" required>
                <option value="">Select site...</option>
                {sites.map(s => (
                  <option key={s.id} value={s.id}>{s.name} ({s.location})</option>
                ))}
              </select>
            </div>
            
            <div className="flex flex-col">
              <label className="text-xs font-bold text-slate-500 mb-1.5">Vendor / Supplier</label>
              <input name="vendor" className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white" placeholder="Vendor name" required />
            </div>
            <div className="flex flex-col">
              <label className="text-xs font-bold text-slate-500 mb-1.5">Bill number</label>
              <input name="billNo" className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white" placeholder="e.g. INV-2026-001" />
            </div>
            
            <div className="flex flex-col">
              <label className="text-xs font-bold text-slate-500 mb-1.5">Amount (₹)</label>
              <input name="amount" type="number" step="0.01" className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white" placeholder="0.00" required />
            </div>
            <div className="flex flex-col">
              <label className="text-xs font-bold text-slate-500 mb-1.5">Bill Date</label>
              <input name="date" type="date" className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white" defaultValue={new Date().toISOString().split('T')[0]} required />
            </div>
            
            <div className="flex flex-col md:col-span-2">
              <label className="text-xs font-bold text-slate-500 mb-1.5">Notes (Optional)</label>
              <textarea name="notes" className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white min-h-[100px]" placeholder="Any additional information..."></textarea>
            </div>
          </div>
          
          <div className="mt-6 pt-4 border-t border-slate-100 flex items-center justify-end gap-3">
            <Link href="/dashboard" className="px-4 py-2 text-sm font-semibold text-slate-700 bg-slate-100 border border-slate-200 rounded-lg hover:bg-slate-200 transition-colors">Cancel</Link>
            <button type="submit" className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-bold text-white bg-blue-600 rounded-lg hover:bg-blue-700 cursor-pointer transition-colors shadow-sm">
              <Check className="w-4 h-4" />
              Upload Bill
            </button>
          </div>
        </form>
      </div>
    </>
  )
}
