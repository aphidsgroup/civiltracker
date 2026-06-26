import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { redirect } from 'next/navigation'
import Link from 'next/link'

async function createBoqItem(formData: FormData) {
  'use server'
  const session = await auth()
  if (!session?.user?.companyId) throw new Error('Unauthorized')

  const companyId = session.user.companyId
  const siteId = formData.get('siteId') as string
  const category = formData.get('category') as string
  const description = formData.get('description') as string
  const unit = formData.get('unit') as string
  const quantity = parseFloat(formData.get('quantity') as string) || 0
  const rate = parseFloat(formData.get('rate') as string) || 0
  const gstPercent = parseFloat(formData.get('gstPercent') as string) || 0

  if (!description || !siteId || quantity === 0 || rate === 0) return

  const amount = quantity * rate
  const gstAmount = amount * (gstPercent / 100)
  const totalWithGst = amount + gstAmount

  await prisma.bOQItem.create({
    data: {
      companyId,
      siteId,
      category: category || 'General',
      description,
      unit,
      quantity,
      rate,
      amount,
      gstPercent,
      totalWithGst,
      clientApproved: false,
    },
  })

  redirect('/boq')
}

export default async function NewBoqItemPage() {
  const session = await auth()
  if (!session?.user?.companyId) redirect('/login')

  const sites = await prisma.site.findMany({
    where: { companyId: session.user.companyId, status: 'ACTIVE' },
    select: { id: true, name: true }
  })

  return (
    <div className="min-h-screen bg-gray-50/50">
      <div className="flex items-center px-6 py-4 bg-white border-b border-gray-200">
        <h1 className="text-xl font-semibold text-gray-900">Add BOQ Item</h1>
      </div>
      
      <div className="p-6 max-w-2xl">
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6">
          <form action={createBoqItem}>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="sm:col-span-2">
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">Item Description / Particulars *</label>
                <textarea name="description" required rows={3} placeholder="Provide details for earthwork, concrete, masonry, etc."
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-[#fc6e20] focus:border-transparent" />
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">Project / Site *</label>
                <select name="siteId" required
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-[#fc6e20] focus:border-transparent">
                  <option value="">-- Choose Site --</option>
                  {sites.map(site => (
                    <option key={site.id} value={site.id}>{site.name}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">Category</label>
                <input name="category" placeholder="e.g. Civil, MEP, Finishes" defaultValue="Civil"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-[#fc6e20] focus:border-transparent" />
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">Unit</label>
                <input name="unit" required placeholder="Cum, Sqm, Rft, Nos" defaultValue="Cum"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-[#fc6e20] focus:border-transparent" />
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">Quantity *</label>
                <input name="quantity" type="number" required min="0.01" step="0.01" placeholder="0.00"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-[#fc6e20] focus:border-transparent" />
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">Rate per Unit (₹) *</label>
                <input name="rate" type="number" required min="1" step="0.01" placeholder="0.00"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-[#fc6e20] focus:border-transparent" />
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">GST %</label>
                <input name="gstPercent" type="number" min="0" step="1" placeholder="18" defaultValue="18"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-[#fc6e20] focus:border-transparent" />
              </div>
            </div>

            <div className="mt-8 flex items-center gap-3 border-t border-gray-100 pt-5">
              <button type="submit"
                className="px-5 py-2.5 bg-[#fc6e20] hover:bg-[#e85b0d] text-white text-sm font-semibold rounded-lg shadow-sm transition-colors cursor-pointer">
                Add to BOQ
              </button>
              <Link href="/boq"
                className="px-5 py-2.5 bg-gray-100 hover:bg-gray-200 text-gray-700 text-sm font-medium rounded-lg transition-colors inline-block">
                Cancel
              </Link>
            </div>
          </form>
        </div>
      </div>
    </div>
  )
}
