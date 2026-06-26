import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { redirect } from 'next/navigation'
import Link from 'next/link'

async function createSubcontractor(formData: FormData) {
  'use server'
  const session = await auth()
  if (!session?.user?.companyId) throw new Error('Unauthorized')

  const companyId = session.user.companyId
  const name = formData.get('name') as string
  const phone = formData.get('phone') as string
  const trade = formData.get('trade') as string
  const gst = formData.get('gst') as string
  const workOrderValue = formData.get('workOrderValue') as string

  if (!name) return

  await prisma.subcontractor.create({
    data: {
      companyId,
      name,
      phone: phone || null,
      trade: trade || null,
      gst: gst || null,
      workOrderValue: workOrderValue ? parseFloat(workOrderValue) : 0,
      status: 'Active',
    },
  })

  redirect('/subcontractors')
}

export default async function NewSubcontractorPage() {
  const session = await auth()
  if (!session?.user?.companyId) redirect('/login')

  return (
    <div className="min-h-screen bg-gray-50/50">
      <div className="flex items-center px-6 py-4 bg-white border-b border-gray-200">
        <h1 className="text-xl font-semibold text-gray-900">Add Subcontractor</h1>
      </div>
      
      <div className="p-6 max-w-2xl">
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6">
          <form action={createSubcontractor}>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="sm:col-span-2">
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">Subcontractor / PRW Name *</label>
                <input name="name" required placeholder="A.K. Builders"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent" />
              </div>
              
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">Trade / Specialty</label>
                <select name="trade" defaultValue="Civil / Structural"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent">
                  <option value="Civil / Structural">Civil / Structural</option>
                  <option value="MEP">MEP</option>
                  <option value="Electrical">Electrical</option>
                  <option value="Plumbing">Plumbing</option>
                  <option value="Finishing">Finishing / Painting</option>
                  <option value="Carpentry">Carpentry</option>
                </select>
              </div>
              
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">Phone Number</label>
                <input name="phone" type="tel" placeholder="+91 98765 43210"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent" />
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">GST Number</label>
                <input name="gst" placeholder="33AAAAA0000A1Z5"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent" />
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">Work Order Value (₹)</label>
                <input name="workOrderValue" type="number" min="0" step="1000" placeholder="e.g. 500000"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent" />
              </div>
            </div>

            <div className="mt-8 flex items-center gap-3 border-t border-gray-100 pt-5">
              <button type="submit"
                className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold rounded-lg shadow-sm transition-colors cursor-pointer">
                Save Subcontractor
              </button>
              <Link href="/subcontractors"
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
