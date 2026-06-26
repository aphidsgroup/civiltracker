import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { redirect } from 'next/navigation'
import Link from 'next/link'

async function createVendor(formData: FormData) {
  'use server'
  const session = await auth()
  if (!session?.user?.companyId) throw new Error('Unauthorized')

  const companyId = session.user.companyId
  const name = formData.get('name') as string
  const email = formData.get('email') as string
  const phone = formData.get('phone') as string
  const gst = formData.get('gst') as string
  const category = formData.get('category') as string
  const paymentTerms = formData.get('paymentTerms') as string
  const address = formData.get('address') as string

  if (!name) return

  await prisma.vendor.create({
    data: {
      companyId,
      name,
      email: email || null,
      phone: phone || null,
      gst: gst || null,
      category: category || null,
      paymentTerms: paymentTerms || null,
      address: address || null,
    },
  })

  redirect('/vendors')
}

export default async function NewVendorPage() {
  const session = await auth()
  if (!session?.user?.companyId) redirect('/login')

  return (
    <div className="min-h-screen bg-gray-50/50">
      <div className="flex items-center px-6 py-4 bg-white border-b border-gray-200">
        <h1 className="text-xl font-semibold text-gray-900">Add New Vendor</h1>
      </div>
      
      <div className="p-6 max-w-2xl">
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6">
          <form action={createVendor}>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="sm:col-span-2">
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">Vendor / Supplier Name *</label>
                <input name="name" required placeholder="Sri Ram Traders"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-[#fc6e20] focus:border-transparent" />
              </div>
              
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">Email Address</label>
                <input name="email" type="email" placeholder="contact@supplier.com"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-[#fc6e20] focus:border-transparent" />
              </div>
              
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">Phone Number</label>
                <input name="phone" type="tel" placeholder="+91 98765 43210"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-[#fc6e20] focus:border-transparent" />
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">GST Number</label>
                <input name="gst" placeholder="33AAAAA0000A1Z5"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-[#fc6e20] focus:border-transparent" />
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">Category</label>
                <select name="category" defaultValue="Cement & Steel"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-[#fc6e20] focus:border-transparent">
                  <option value="Cement & Steel">Cement & Steel</option>
                  <option value="Electrical">Electrical</option>
                  <option value="Plumbing">Plumbing</option>
                  <option value="Paint & Hardware">Paint & Hardware</option>
                  <option value="Machinery">Machinery Rental</option>
                  <option value="General">General Supply</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">Payment Terms</label>
                <input name="paymentTerms" placeholder="15 Days, 30 Days" defaultValue="15 Days"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-[#fc6e20] focus:border-transparent" />
              </div>

              <div className="sm:col-span-2">
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">Business Address</label>
                <textarea name="address" rows={2} placeholder="Full address"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-[#fc6e20] focus:border-transparent" />
              </div>
            </div>

            <div className="mt-8 flex items-center gap-3 border-t border-gray-100 pt-5">
              <button type="submit"
                className="px-5 py-2.5 bg-[#fc6e20] hover:bg-[#e85b0d] text-white text-sm font-semibold rounded-lg shadow-sm transition-colors cursor-pointer">
                Save Vendor
              </button>
              <Link href="/vendors"
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
