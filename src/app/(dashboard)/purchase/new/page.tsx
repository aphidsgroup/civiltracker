import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { redirect } from 'next/navigation'
import Link from 'next/link'

async function createPO(formData: FormData) {
  'use server'
  const session = await auth()
  if (!session?.user?.companyId) throw new Error('Unauthorized')

  const companyId = session.user.companyId
  const vendorId = formData.get('vendorId') as string
  const poNumber = formData.get('poNumber') as string
  const totalAmount = formData.get('totalAmount') as string
  const notes = formData.get('notes') as string

  if (!poNumber || !totalAmount) return

  await prisma.purchaseOrder.create({
    data: {
      companyId,
      vendorId: vendorId || null,
      poNumber,
      totalAmount: parseFloat(totalAmount),
      notes: notes || null,
      status: 'DRAFT',
      createdById: session.user.id,
    },
  })

  redirect('/purchase')
}

export default async function NewPurchaseOrderPage() {
  const session = await auth()
  if (!session?.user?.companyId) redirect('/login')

  const vendors = await prisma.vendor.findMany({
    where: { companyId: session.user.companyId, isActive: true },
    select: { id: true, name: true, category: true }
  })

  // Generate a random PO Number default
  const randPO = `PO-${new Date().getFullYear()}-${Math.floor(1000 + Math.random() * 9000)}`

  return (
    <div className="min-h-screen bg-gray-50/50">
      <div className="flex items-center px-6 py-4 bg-white border-b border-gray-200">
        <h1 className="text-xl font-semibold text-gray-900">Create Purchase Order</h1>
      </div>
      
      <div className="p-6 max-w-2xl">
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6">
          <form action={createPO}>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">PO Number *</label>
                <input name="poNumber" required defaultValue={randPO}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-[#fc6e20] focus:border-transparent font-mono" />
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">Total Amount (₹) *</label>
                <input name="totalAmount" type="number" required min="1" step="0.01" placeholder="0.00"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-[#fc6e20] focus:border-transparent" />
              </div>
              
              <div className="sm:col-span-2">
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">Select Vendor</label>
                <select name="vendorId" required
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-[#fc6e20] focus:border-transparent">
                  <option value="">-- Choose Vendor --</option>
                  {vendors.map(v => (
                    <option key={v.id} value={v.id}>{v.name} {v.category ? `(${v.category})` : ''}</option>
                  ))}
                </select>
              </div>

              <div className="sm:col-span-2">
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">Description & Terms</label>
                <textarea name="notes" rows={3} placeholder="Material details, delivery terms, payment terms..."
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-[#fc6e20] focus:border-transparent" />
              </div>
            </div>

            <div className="mt-8 flex items-center gap-3 border-t border-gray-100 pt-5">
              <button type="submit"
                className="px-5 py-2.5 bg-[#fc6e20] hover:bg-[#e85b0d] text-white text-sm font-semibold rounded-lg shadow-sm transition-colors cursor-pointer">
                Create PO
              </button>
              <Link href="/purchase"
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
