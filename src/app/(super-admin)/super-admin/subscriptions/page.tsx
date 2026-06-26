import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { redirect } from 'next/navigation'
import { CreditCard, Building2, Layers, CheckCircle2 } from 'lucide-react'

export default async function SubscriptionsPage() {
  const session = await auth()
  if (session?.user?.role !== 'SUPER_ADMIN') redirect('/dashboard')

  const plans = await prisma.subscriptionPlan.findMany({ orderBy: { price: 'asc' } })

  const companies = await prisma.company.findMany({
    select: {
      id: true, name: true, plan: true, status: true, createdAt: true,
      subscription: {
        orderBy: { createdAt: 'desc' },
        take: 1,
        include: { plan: true },
      },
    },
    orderBy: { createdAt: 'desc' },
  })

  const active = companies.filter(c => c.status === 'ACTIVE').length
  const trial = companies.filter(c => c.status === 'TRIAL').length
  const suspended = companies.filter(c => c.status === 'SUSPENDED').length

  function statusStyle(status: string) {
    if (status === 'ACTIVE') return 'bg-emerald-100 text-emerald-800'
    if (status === 'TRIAL') return 'bg-amber-100 text-amber-800'
    return 'bg-rose-100 text-rose-800'
  }

  return (
    <>
      <div className="flex items-center justify-between px-8 py-5 border-b border-slate-200 bg-white">
        <div className="text-lg font-bold text-slate-800 flex items-center gap-2">
          <CreditCard className="text-[#fc6e20]" size={20} />
          Subscription Plans & Billing
        </div>
      </div>

      <div className="p-8 max-w-7xl mx-auto space-y-8">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {[
            { label: 'Total Companies', value: companies.length },
            { label: 'Active Subscriptions', value: active },
            { label: 'On Trial', value: trial },
            { label: 'Suspended / Overdue', value: suspended },
          ].map(k => (
            <div key={k.label} className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm">
              <div className="text-xs font-bold text-slate-400 uppercase tracking-wider">{k.label}</div>
              <div className="text-2xl font-black text-slate-800 mt-1">{k.value}</div>
            </div>
          ))}
        </div>

        {plans.length > 0 && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
            {plans.map(p => (
              <div key={p.id} className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm flex flex-col justify-between hover:shadow-md transition-shadow">
                <div>
                  <div className="text-base font-bold text-slate-900 mb-1 flex items-center gap-2">
                    <Layers size={18} className="text-[#fc6e20]" />
                    {p.name}
                  </div>
                  <div className="text-3xl font-black text-slate-800 my-4">
                    ₹{Number(p.price).toLocaleString('en-IN')}
                    <span className="text-xs font-semibold text-slate-400">/month</span>
                  </div>
                  <div className="space-y-2.5 text-xs text-slate-600 mt-6 border-t border-slate-100 pt-4">
                    <div className="flex items-center gap-2">
                      <CheckCircle2 size={15} className="text-emerald-600" />
                      <span>Up to <strong>{p.maxSites}</strong> sites</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <CheckCircle2 size={15} className="text-emerald-600" />
                      <span>Up to <strong>{p.maxUsers}</strong> users</span>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm">
          <div className="px-6 py-4 border-b border-slate-200 bg-slate-50/50 text-base font-bold text-slate-800">
            Company Billing Overview
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-xs font-bold text-slate-500 uppercase tracking-wider">
                  <th className="py-3.5 px-6">Company</th>
                  <th className="py-3.5 px-6">Current Plan</th>
                  <th className="py-3.5 px-6">Status</th>
                  <th className="py-3.5 px-6">Registered</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {companies.map(c => (
                  <tr key={c.id} className="hover:bg-slate-50/50 transition-colors">
                    <td className="py-4 px-6 font-bold text-slate-900 flex items-center gap-2.5">
                      <Building2 size={16} className="text-slate-400" />
                      {c.name}
                    </td>
                    <td className="py-4 px-6">
                      <span className="px-2.5 py-1 text-xs font-semibold rounded-md bg-slate-100 text-slate-700 border border-slate-200">
                        {c.plan}
                      </span>
                    </td>
                    <td className="py-4 px-6">
                      <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 text-xs font-bold rounded-full ${statusStyle(c.status)}`}>
                        <span className="w-1.5 h-1.5 rounded-full bg-current" />
                        {c.status}
                      </span>
                    </td>
                    <td className="py-4 px-6 text-xs text-slate-400">
                      {new Date(c.createdAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </>
  )
}
