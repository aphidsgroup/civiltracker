import { requireUser } from '@/lib/auth/require-user'
import prisma from '@/lib/prisma'
import Link from 'next/link'
import { Building2, MapPin, Calendar, Receipt, FileUp, HardHat, FileCheck, Camera, ArrowLeft, ShieldAlert, IndianRupee, Wallet } from 'lucide-react'
import { notFound } from 'next/navigation'

export const metadata = {
  title: 'Project Site Dashboard | Civil Tracker Mobile',
  description: 'Manage worksite field operations and submit daily expense vouchers.',
}

export default async function MobileSingleSitePage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser()
  const resolvedParams = await params
  const siteId = resolvedParams.id

  const site = await prisma.site.findUnique({
    where: { id: siteId, companyId: user.companyId },
    include: {
      labour: { where: { isActive: true }, select: { id: true } },
      expenses: { take: 5, orderBy: { createdAt: 'desc' } }
    }
  })

  if (!site) {
    notFound()
  }

  const isSiteEngineer = user.role === 'SITE_ENGINEER' || user.role === 'SUPERVISOR'

  return (
    <div className="min-h-screen bg-slate-100 pb-28 select-none">
      {/* Top Bar */}
      <div className="bg-slate-900 text-white p-4 sticky top-0 z-40 flex items-center justify-between shadow-md">
        <Link href="/mobile/sites" className="inline-flex items-center gap-1.5 text-xs font-bold text-blue-400 no-underline active:scale-95">
          <ArrowLeft size={16} />
          <span>All Projects</span>
        </Link>
        <span className="text-xs font-black uppercase tracking-wider text-slate-400">Project Operations</span>
        <div className="w-16" />
      </div>

      {/* Hero Header */}
      <div className="bg-gradient-to-br from-slate-900 via-indigo-950 to-slate-900 text-white p-6 rounded-b-[32px] shadow-xl space-y-3">
        <div className="flex items-center justify-between">
          <span className="px-3 py-1 rounded-full bg-emerald-500/20 text-emerald-300 text-[10px] font-black uppercase tracking-wider border border-emerald-400/30">
            {site.status}
          </span>
          <span className="text-xs font-semibold text-slate-300">{site.contractType || 'Construction Worksite'}</span>
        </div>
        <h1 className="text-2xl font-black tracking-tight m-0">{site.name}</h1>
        <div className="flex items-center gap-1.5 text-xs text-slate-300 font-medium">
          <MapPin size={14} className="text-blue-400 flex-shrink-0" />
          <span>{site.location}</span>
        </div>
      </div>

      <div className="p-4 max-w-lg mx-auto space-y-5 -mt-2">
        {/* HIDE financial details from Site Engineer */}
        {!isSiteEngineer ? (
          <div className="bg-white rounded-3xl p-5 border border-slate-200 shadow-sm space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="text-xs font-black uppercase tracking-wider text-slate-400">Company Financial Ledger</div>
              <span className="text-[10px] bg-amber-100 text-amber-800 font-extrabold px-2 py-0.5 rounded">Management Only</span>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-200/60">
                <div className="text-[10px] font-bold text-slate-400 uppercase">Total Budget</div>
                <div className="text-lg font-black text-slate-900 mt-0.5">₹{(Number(site.budget)/100000).toFixed(1)}L</div>
              </div>
              <div className="p-3.5 rounded-2xl bg-emerald-50 border border-emerald-200/60">
                <div className="text-[10px] font-bold text-emerald-600 uppercase">Spent Amount</div>
                <div className="text-lg font-black text-emerald-900 mt-0.5">₹{(Number(site.spent)/100000).toFixed(1)}L</div>
              </div>
            </div>
          </div>
        ) : (
          <div className="bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-200 p-4 rounded-2xl flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-blue-600 text-white flex items-center justify-center flex-shrink-0 font-black shadow">
              <HardHat size={20} />
            </div>
            <div>
              <div className="text-xs font-black text-blue-900 uppercase tracking-wide">Site Engineer Deployment</div>
              <div className="text-[11px] text-blue-700 font-medium">Headcount Today: {site.labour.length} Assigned Workers</div>
            </div>
          </div>
        )}

        {/* Payment & Field Input Actions for Site Engineer */}
        <div className="space-y-3">
          <div className="text-xs font-black uppercase tracking-wider text-slate-400 pl-1">
            Payment Inputs & Field Actions
          </div>

          <div className="grid grid-cols-1 gap-3">
            <Link
              href={`/mobile/add-expense?siteId=${site.id}`}
              className="p-4 bg-white hover:bg-slate-50 active:scale-98 rounded-2xl border border-slate-200 shadow-sm flex items-center justify-between no-underline border-l-4 border-l-amber-500 transition-all text-inherit"
            >
              <div className="flex items-center gap-3">
                <div className="w-11 h-11 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center font-black">
                  <Receipt size={22} />
                </div>
                <div>
                  <div className="font-black text-sm text-slate-900">+ Log Petty Cash Expense</div>
                  <div className="text-[11px] text-slate-400 font-medium">Capture vendor voucher & payment mode</div>
                </div>
              </div>
              <span className="text-xs font-extrabold text-blue-600">Input &rarr;</span>
            </Link>

            <Link
              href={`/mobile/upload-bill?siteId=${site.id}`}
              className="p-4 bg-white hover:bg-slate-50 active:scale-98 rounded-2xl border border-slate-200 shadow-sm flex items-center justify-between no-underline border-l-4 border-l-rose-500 transition-all text-inherit"
            >
              <div className="flex items-center gap-3">
                <div className="w-11 h-11 rounded-xl bg-rose-50 text-rose-600 flex items-center justify-center font-black">
                  <FileUp size={22} />
                </div>
                <div>
                  <div className="font-black text-sm text-slate-900">+ Upload Material Bill / Challan</div>
                  <div className="text-[11px] text-slate-400 font-medium">Submit GST invoice or delivery slip</div>
                </div>
              </div>
              <span className="text-xs font-extrabold text-blue-600">Upload &rarr;</span>
            </Link>

            <Link
              href={`/mobile/attendance?siteId=${site.id}`}
              className="p-4 bg-white hover:bg-slate-50 active:scale-98 rounded-2xl border border-slate-200 shadow-sm flex items-center justify-between no-underline border-l-4 border-l-blue-500 transition-all text-inherit"
            >
              <div className="flex items-center gap-3">
                <div className="w-11 h-11 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center font-black">
                  <HardHat size={22} />
                </div>
                <div>
                  <div className="font-black text-sm text-slate-900">+ Mark Muster Roll & Advances</div>
                  <div className="text-[11px] text-slate-400 font-medium">Log attendance and cash advances</div>
                </div>
              </div>
              <span className="text-xs font-extrabold text-blue-600">Mark &rarr;</span>
            </Link>

            <Link
              href={`/mobile/dpr?siteId=${site.id}`}
              className="p-4 bg-white hover:bg-slate-50 active:scale-98 rounded-2xl border border-slate-200 shadow-sm flex items-center justify-between no-underline border-l-4 border-l-emerald-500 transition-all text-inherit"
            >
              <div className="flex items-center gap-3">
                <div className="w-11 h-11 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center font-black">
                  <FileCheck size={22} />
                </div>
                <div>
                  <div className="font-black text-sm text-slate-900">+ Daily Progress Report (DPR)</div>
                  <div className="text-[11px] text-slate-400 font-medium">Submit daily BOQ work progress</div>
                </div>
              </div>
              <span className="text-xs font-extrabold text-blue-600">Submit &rarr;</span>
            </Link>

            <Link
              href={`/mobile/site-photo?siteId=${site.id}`}
              className="p-4 bg-white hover:bg-slate-50 active:scale-98 rounded-2xl border border-slate-200 shadow-sm flex items-center justify-between no-underline border-l-4 border-l-purple-500 transition-all text-inherit"
            >
              <div className="flex items-center gap-3">
                <div className="w-11 h-11 rounded-xl bg-purple-50 text-purple-600 flex items-center justify-center font-black">
                  <Camera size={22} />
                </div>
                <div>
                  <div className="font-black text-sm text-slate-900">+ Camera Photo Documentation</div>
                  <div className="text-[11px] text-slate-400 font-medium">Timestamped visual evidence</div>
                </div>
              </div>
              <span className="text-xs font-extrabold text-blue-600">Camera &rarr;</span>
            </Link>
          </div>
        </div>
      </div>
    </div>
  )
}
