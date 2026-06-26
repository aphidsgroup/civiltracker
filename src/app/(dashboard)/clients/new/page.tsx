import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { redirect } from 'next/navigation'
import Link from 'next/link'

async function createClient(formData: FormData) {
  'use server'
  const session = await auth()
  if (!session?.user?.companyId) throw new Error('Unauthorized')

  const companyId = session.user.companyId
  const name = formData.get('name') as string
  const phone = formData.get('phone') as string
  const email = formData.get('email') as string
  const siteId = formData.get('siteId') as string
  const contractValue = formData.get('contractValue') as string
  const portalAccess = formData.get('portalAccess') === 'on'

  if (!name) return

  await prisma.client.create({
    data: {
      companyId,
      name,
      phone: phone || null,
      email: email || null,
      siteId: siteId || null,
      contractValue: contractValue ? parseFloat(contractValue) : 0,
      portalAccess,
    },
  })

  redirect('/clients')
}

export default async function NewClientPage() {
  const session = await auth()
  if (!session?.user?.companyId) redirect('/login')

  const sites = await prisma.site.findMany({
    where: { companyId: session.user.companyId, status: 'ACTIVE' },
    select: { id: true, name: true }
  })

  return (
    <div className="min-h-screen bg-gray-50/50">
      <div className="flex items-center px-6 py-4 bg-white border-b border-gray-200">
        <h1 className="text-xl font-semibold text-gray-900">Add New Client</h1>
      </div>
      
      <div className="p-6 max-w-2xl">
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6">
          <form action={createClient}>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="sm:col-span-2">
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">Client / Developer Name *</label>
                <input name="name" required placeholder="John Doe"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-[#fc6e20] focus:border-transparent" />
              </div>
              
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">Phone Number</label>
                <input name="phone" type="tel" placeholder="+91 98765 43210"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-[#fc6e20] focus:border-transparent" />
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">Email Address</label>
                <input name="email" type="email" placeholder="client@email.com"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-[#fc6e20] focus:border-transparent" />
              </div>

              <div className="sm:col-span-2">
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">Link to Project / Site</label>
                <select name="siteId" defaultValue=""
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-[#fc6e20] focus:border-transparent">
                  <option value="">No specific site / General Client</option>
                  {sites.map(site => (
                    <option key={site.id} value={site.id}>{site.name}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">Total Contract Value (₹)</label>
                <input name="contractValue" type="number" min="0" step="1000" placeholder="e.g. 5000000"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-[#fc6e20] focus:border-transparent" />
              </div>
            </div>

            <div className="mt-6 pt-5 border-t border-gray-100">
              <label className="flex items-center gap-3 cursor-pointer">
                <input type="checkbox" name="portalAccess" defaultChecked className="w-4 h-4 text-[#fc6e20] rounded border-gray-300 focus:ring-[#fc6e20]" />
                <div>
                  <div className="text-sm font-bold text-gray-900">Enable Client Portal Access</div>
                  <div className="text-xs text-gray-500">Allow client to log in and view their project progress & payments.</div>
                </div>
              </label>
            </div>

            <div className="mt-8 flex items-center gap-3 border-t border-gray-100 pt-5">
              <button type="submit"
                className="px-5 py-2.5 bg-[#fc6e20] hover:bg-[#e85b0d] text-white text-sm font-semibold rounded-lg shadow-sm transition-colors cursor-pointer">
                Save Client
              </button>
              <Link href="/clients"
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
