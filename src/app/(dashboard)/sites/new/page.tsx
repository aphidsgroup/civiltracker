import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import Link from 'next/link'

async function createSite(formData: FormData) {
  'use server'
  const { auth } = await import('@/lib/auth')
  const session = await auth()
  if (!session?.user?.companyId) return

  const name = formData.get('name') as string
  const location = formData.get('location') as string
  const address = formData.get('address') as string
  const projectType = formData.get('projectType') as string
  const budget = parseFloat(formData.get('budget') as string) || 0

  if (!name || !location) return

  await prisma.site.create({
    data: {
      name,
      location,
      address: address || null,
      projectType: projectType || null,
      budget,
      slug: name.toLowerCase().replace(/[^a-z0-9]+/g, '-') + '-' + Math.random().toString(36).slice(2, 6),
      companyId: session.user.companyId,
    },
  })

  revalidatePath('/sites')
  redirect('/sites')
}

export default async function NewSitePage() {
  const session = await auth()
  if (!session?.user) redirect('/login')

  return (
    <>
      <div className="flex items-center justify-between pb-6 border-b border-slate-200 mb-6">
        <h1 className="text-2xl font-bold text-slate-900">New Site</h1>
      </div>
      <div className="max-w-2xl">
        <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm">
          <form action={createSite}>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="md:col-span-2">
                <label className="block text-xs font-bold text-slate-500 mb-1.5">Site Name *</label>
                <input name="name" required placeholder="e.g. Marina Towers Block A"
                  className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white" />
              </div>
              <div className="md:col-span-2">
                <label className="block text-xs font-bold text-slate-500 mb-1.5">Location *</label>
                <input name="location" required placeholder="e.g. Chennai, Tamil Nadu"
                  className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white" />
              </div>
              <div className="md:col-span-2">
                <label className="block text-xs font-bold text-slate-500 mb-1.5">Address</label>
                <input name="address" placeholder="Full street address"
                  className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white" />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-500 mb-1.5">Project Type</label>
                <select name="projectType"
                  className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white">
                  <option value="">Select type</option>
                  <option>RESIDENTIAL</option><option>COMMERCIAL</option>
                  <option>INFRASTRUCTURE</option><option>INDUSTRIAL</option><option>RENOVATION</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-500 mb-1.5">Budget (₹)</label>
                <input name="budget" type="number" min="0" placeholder="5000000"
                  className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white" />
              </div>
            </div>
            <div className="mt-6 flex items-center gap-3">
              <button type="submit" className="bg-blue-600 text-white border-none rounded-lg px-6 py-2.5 text-sm font-bold hover:bg-blue-700 cursor-pointer transition-colors">Create Site</button>
              <Link href="/sites" className="bg-slate-100 text-slate-700 border border-slate-200 rounded-lg px-5 py-2.5 text-sm font-semibold hover:bg-slate-200 text-center transition-colors">Cancel</Link>
            </div>
          </form>
        </div>
      </div>
    </>
  )
}
