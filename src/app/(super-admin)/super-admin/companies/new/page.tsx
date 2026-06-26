import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { prisma } from '@/lib/prisma'
import { revalidatePath } from 'next/cache'
import Link from 'next/link'
import { CompanyPlan, CompanyStatus } from '@prisma/client'

async function createCompany(formData: FormData) {
  'use server'
  const name = formData.get('name') as string
  const email = formData.get('email') as string
  const phone = formData.get('phone') as string
  const gst = formData.get('gst') as string
  const city = formData.get('city') as string
  const state = formData.get('state') as string
  const planId = formData.get('planId') as string

  if (!name) return

  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-') + '-' + Math.random().toString(36).slice(2, 8)

  let planEnum: CompanyPlan = 'TRIAL'
  let planRecord = planId && planId !== 'free-tier' ? await prisma.subscriptionPlan.findUnique({ where: { id: planId } }) : null

  if (planId === 'free-tier' || (planRecord && Number(planRecord.price) === 0)) {
    planEnum = 'FREE'
  } else if (planRecord) {
    const upper = planRecord.name.toUpperCase()
    if (upper.includes('STARTER')) planEnum = 'STARTER'
    else if (upper.includes('GROWTH')) planEnum = 'GROWTH'
    else if (upper.includes('PRO') || upper.includes('ENTERPRISE')) planEnum = 'ENTERPRISE'
  }

  const company = await prisma.company.create({
    data: {
      name,
      email: email || null,
      phone: phone || null,
      gst: gst || null,
      city: city || null,
      state: state || null,
      slug,
      plan: planEnum,
      status: planEnum === 'FREE' ? CompanyStatus.ACTIVE : CompanyStatus.TRIAL,
      userLimit: planRecord ? planRecord.maxUsers : 3,
      siteLimit: planRecord ? planRecord.maxSites : 1,
      storageLimitMb: planRecord ? planRecord.storageGb * 1024 : 100,
    },
  })

  if (planRecord) {
    await prisma.companySubscription.create({
      data: { companyId: company.id, planId: planRecord.id, status: 'active' }
    })
  }

  revalidatePath('/super-admin/companies')
  redirect('/super-admin/companies')
}

export default async function NewCompanyPage() {
  const session = await auth()
  if (session?.user?.role !== 'SUPER_ADMIN') redirect('/login')

  const plans = await prisma.subscriptionPlan.findMany({ orderBy: { price: 'asc' } })

  return (
    <div className="min-h-screen bg-gray-50/50">
      <div className="flex items-center px-6 py-4 bg-white border-b border-gray-200">
        <h1 className="text-xl font-semibold text-gray-900">Create Company</h1>
      </div>

      <div className="p-6 max-w-2xl">
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6">
          <form action={createCompany}>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="sm:col-span-2">
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">Company Name *</label>
                <input name="name" required placeholder="Madras Construction Pvt Ltd"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-[#fc6e20] focus:border-transparent" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">Email</label>
                <input name="email" type="email" placeholder="admin@company.com"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-[#fc6e20] focus:border-transparent" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">Phone</label>
                <input name="phone" type="tel" placeholder="+91 98765 43210"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-[#fc6e20] focus:border-transparent" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">GST Number</label>
                <input name="gst" placeholder="22AAAAA0000A1Z5"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-[#fc6e20] focus:border-transparent" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">City</label>
                <input name="city" placeholder="Chennai"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-[#fc6e20] focus:border-transparent" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">State</label>
                <input name="state" placeholder="Tamil Nadu"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-[#fc6e20] focus:border-transparent" />
              </div>
              
              <div className="sm:col-span-2">
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">Subscription Plan Tier *</label>
                <select name="planId" defaultValue="free-tier"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-[#fc6e20] focus:border-transparent">
                  <option value="free-tier">Free Tier (Complimentary) &mdash; &#8377;0/mo</option>
                  {plans.map(p => (
                    <option key={p.id} value={p.id}>{p.name} &mdash; &#8377;{Number(p.price).toLocaleString("en-IN")}/mo</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="mt-6 flex items-center gap-3">
              <button type="submit"
                className="px-5 py-2.5 bg-[#fc6e20] hover:bg-[#e85b0d] text-white text-sm font-semibold rounded-lg shadow-sm transition-colors cursor-pointer">
                Create Company
              </button>
              <Link href="/super-admin/companies"
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
