import { prisma } from '@/lib/prisma'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { updateVendorAction } from '@/actions/vendors'
import { exitDeniedPage, resolveTenantPageAccess } from '@/lib/pages/tenant-page-access'

/* The live-authorized vendor update, then back to the list as before. */
async function updateVendor(formData: FormData) {
  'use server'
  await updateVendorAction(formData)
  redirect('/vendors')
}

export default async function EditVendorPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  // Same live permission and module `updateVendorAction` enforces.
  const gate = await resolveTenantPageAccess({ grants: [{ permission: 'materials.update', module: 'MATERIALS' }] })
  if (gate.status === 'denied') exitDeniedPage(gate, `/vendors/${id}/edit`)
  const { companyId } = gate.access

  // Exactly this vendor of this company, company-wide or on a live site of it.
  const vendor = await prisma.vendor.findFirst({
    where: { id, companyId, OR: [{ siteId: null }, { site: { companyId, deletedAt: null } }] },
  })

  if (!vendor) redirect('/vendors')

  return (
    <div className="min-h-screen bg-slate-50/50">
      <div className="flex items-center justify-between px-6 py-4 bg-white border-b border-slate-200">
        <div>
          <h1 className="text-xl font-extrabold text-slate-800">Edit Vendor</h1>
          <p className="text-xs text-slate-500 mt-0.5">Update supplier details</p>
        </div>
        <Link href="/vendors" className="text-sm text-slate-500 hover:text-slate-900 font-medium transition-colors">← Back</Link>
      </div>

      <div className="p-6 max-w-2xl mx-auto">
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
          <form action={updateVendor} className="space-y-5">
            <input type="hidden" name="id" value={vendor.id} />
            
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-1.5">Company Name *</label>
                <input
                  name="name" required defaultValue={vendor.name}
                  className="w-full border border-slate-300 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#fc6e20]/40 focus:border-[#fc6e20] transition-all"
                />
              </div>
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-1.5">Category</label>
                <input
                  name="category" placeholder="e.g. Cement Supplier" defaultValue={vendor.category || ''}
                  className="w-full border border-slate-300 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#fc6e20]/40 focus:border-[#fc6e20] transition-all"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-1.5">Phone</label>
                <input
                  name="phone" type="tel" defaultValue={vendor.phone || ''}
                  className="w-full border border-slate-300 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#fc6e20]/40 focus:border-[#fc6e20] transition-all"
                />
              </div>
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-1.5">Email</label>
                <input
                  name="email" type="email" defaultValue={vendor.email || ''}
                  className="w-full border border-slate-300 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#fc6e20]/40 focus:border-[#fc6e20] transition-all"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-1.5">GST Number</label>
                <input
                  name="gst" placeholder="GSTIN..." defaultValue={vendor.gst || ''}
                  className="w-full border border-slate-300 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#fc6e20]/40 focus:border-[#fc6e20] uppercase transition-all"
                />
              </div>
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-1.5">Payment Terms</label>
                <input
                  name="paymentTerms" placeholder="e.g. Net 30" defaultValue={vendor.paymentTerms || ''}
                  className="w-full border border-slate-300 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#fc6e20]/40 focus:border-[#fc6e20] transition-all"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-1.5">Address</label>
              <textarea
                name="address" rows={2} defaultValue={vendor.address || ''}
                className="w-full border border-slate-300 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#fc6e20]/40 focus:border-[#fc6e20] transition-all"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-1.5">Amount Payable (₹)</label>
                <input
                  name="amountPayable" type="number" step="0.01" defaultValue={Number(vendor.amountPayable) || ''}
                  className="w-full border border-slate-300 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#fc6e20]/40 focus:border-[#fc6e20] transition-all"
                />
              </div>
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-1.5">Status</label>
                <select
                  name="isActive" required defaultValue={vendor.isActive ? 'true' : 'false'}
                  className="w-full border border-slate-300 rounded-xl px-4 py-2.5 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#fc6e20]/40 focus:border-[#fc6e20] transition-all bg-white"
                >
                  <option value="true">Active</option>
                  <option value="false">Inactive</option>
                </select>
              </div>
            </div>

            <div className="pt-4 flex justify-end">
              <button
                type="submit"
                className="bg-[#fc6e20] hover:bg-[#e85b0d] text-white rounded-xl px-6 py-2.5 text-sm font-bold transition-colors shadow-sm"
              >
                Save Changes
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  )
}
