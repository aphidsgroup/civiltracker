import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { redirect } from 'next/navigation'
import Link from 'next/link'

async function updateSubcontractor(formData: FormData) {
  'use server'
  const session = await auth()
  if (!session?.user?.companyId) throw new Error('Unauthorized')

  const companyId = session.user.companyId
  const id = formData.get('id') as string
  const name = formData.get('name') as string
  const phone = formData.get('phone') as string
  const trade = formData.get('trade') as string
  const gst = formData.get('gst') as string
  const workOrderValue = formData.get('workOrderValue') as string
  const status = formData.get('status') as string

  if (!id || !name) return

  await prisma.subcontractor.update({
    where: { id, companyId },
    data: {
      name,
      phone: phone || null,
      trade: trade || null,
      gst: gst || null,
      workOrderValue: workOrderValue ? parseFloat(workOrderValue) : 0,
      status: status || 'Active',
    },
  })

  redirect('/subcontractors')
}

export default async function EditSubcontractorPage({ params }: { params: { id: string } }) {
  const session = await auth()
  if (!session?.user?.companyId) redirect('/login')

  const sub = await prisma.subcontractor.findUnique({
    where: { id: params.id, companyId: session.user.companyId },
  })

  if (!sub) redirect('/subcontractors')

  return (
    <div className="min-h-screen bg-gray-50/50">
      <div className="flex items-center px-6 py-4 bg-white border-b border-gray-200">
        <h1 className="text-xl font-semibold text-gray-900">Edit Subcontractor</h1>
      </div>
      
      <div className="p-6 max-w-2xl">
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6">
          <form action={updateSubcontractor}>
            <input type="hidden" name="id" value={sub.id} />
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="sm:col-span-2">
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">Subcontractor / PRW Name *</label>
                <input 
                  type="text" 
                  name="name" 
                  required 
                  defaultValue={sub.name}
                  className="w-full px-3 py-2 bg-white border border-gray-300 rounded-lg text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-[#fc6e20]/40 focus:border-[#fc6e20]"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">Trade / Specialty</label>
                <input 
                  type="text" 
                  name="trade" 
                  placeholder="e.g. Brickwork, Painting"
                  defaultValue={sub.trade || ''}
                  className="w-full px-3 py-2 bg-white border border-gray-300 rounded-lg text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-[#fc6e20]/40 focus:border-[#fc6e20]"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">Phone Number</label>
                <input 
                  type="tel" 
                  name="phone" 
                  defaultValue={sub.phone || ''}
                  className="w-full px-3 py-2 bg-white border border-gray-300 rounded-lg text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-[#fc6e20]/40 focus:border-[#fc6e20]"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">GST Number</label>
                <input 
                  type="text" 
                  name="gst" 
                  defaultValue={sub.gst || ''}
                  className="w-full px-3 py-2 bg-white border border-gray-300 rounded-lg text-sm text-gray-900 uppercase focus:outline-none focus:ring-2 focus:ring-[#fc6e20]/40 focus:border-[#fc6e20]"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">Work Order Value (₹)</label>
                <input 
                  type="number" 
                  name="workOrderValue" 
                  step="0.01"
                  defaultValue={Number(sub.workOrderValue) || ''}
                  className="w-full px-3 py-2 bg-white border border-gray-300 rounded-lg text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-[#fc6e20]/40 focus:border-[#fc6e20]"
                />
              </div>

              <div className="sm:col-span-2">
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">Status</label>
                <select 
                  name="status"
                  defaultValue={sub.status}
                  className="w-full px-3 py-2 bg-white border border-gray-300 rounded-lg text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-[#fc6e20]/40 focus:border-[#fc6e20]"
                >
                  <option value="Active">Active</option>
                  <option value="Inactive">Inactive</option>
                  <option value="Completed">Completed</option>
                </select>
              </div>
            </div>

            <div className="mt-6 flex items-center justify-end gap-3 border-t border-gray-100 pt-5">
              <Link href="/subcontractors" className="px-4 py-2 text-sm font-semibold text-gray-600 hover:text-gray-900">
                Cancel
              </Link>
              <button type="submit" className="px-4 py-2 bg-[#fc6e20] hover:bg-[#e85b0d] text-white text-sm font-semibold rounded-lg shadow-sm">
                Save Changes
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  )
}
