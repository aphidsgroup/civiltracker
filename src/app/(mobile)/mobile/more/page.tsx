import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { ChevronRight, Grid } from 'lucide-react'
import { prisma } from '@/lib/prisma'

export default async function MobileMorePage() {
  const session = await auth()
  if (!session?.user) redirect('/login')

  let companyName = session.user.companyName
  let companyLogo = session.user.companyLogo

  let companyId = session.user.companyId
  if ((!companyName || !companyLogo) && !companyId && session.user.role !== 'SUPER_ADMIN') {
    const member = await prisma.companyMember.findFirst({
      where: { userId: session.user.id, isActive: true },
      select: { companyId: true, company: { select: { name: true, logo: true } } }
    })
    companyId = member?.companyId
    companyName = member?.company?.name ?? companyName
    companyLogo = member?.company?.logo ?? companyLogo
  } else if ((!companyName || !companyLogo) && companyId) {
    const comp = await prisma.company.findUnique({
      where: { id: companyId },
      select: { name: true, logo: true }
    })
    companyName = comp?.name ?? companyName
    companyLogo = comp?.logo ?? companyLogo
  }

  const isSiteEngineer = session.user.role === 'SITE_ENGINEER' || session.user.role === 'SUPERVISOR'

  const sections = [
    { title: 'Field Input & Finance', items: [
      { href: '/mobile/approvals', label: 'Bill Approvals & Vouchers', icon: '🧾', hideForEng: true },
      { href: '/mobile/add-expense', label: 'Site Expenses & Petty Cash', icon: '💳' },
      { href: '/mobile/upload-bill', label: 'Upload Challan / Invoice', icon: '📄' },
    ]},
    { title: 'Site Operations', items: [
      { href: '/mobile/sites', label: isSiteEngineer ? 'My Assigned Projects' : 'All Project Sites', icon: '🏗️' },
      { href: '/mobile/attendance', label: 'Labour Muster Roll & Advances', icon: '👷' },
      { href: '/mobile/dpr', label: 'Daily Progress Reports (DPR)', icon: '📝' },
      { href: '/mobile/site-photo', label: 'Site Camera Gallery', icon: '📸' },
    ]},
    { title: 'System & Preferences', items: [
      { href: '/dashboard', label: 'Launch Desktop Dashboard', icon: '💻' },
      { href: '/mobile/profile', label: 'My ID & Shift Profile', icon: '👤' },
    ]},
  ]

  return (
    <div className="p-4 pb-28 max-w-lg mx-auto bg-slate-50 min-h-screen select-none">
      {/* Company Identity Card */}
      <div className="bg-white rounded-2xl border border-slate-200/80 p-4 shadow-sm mb-5 flex items-center gap-3.5">
        {companyLogo ? (
          <img
            src={companyLogo}
            alt={companyName ?? 'Company'}
            className="w-12 h-12 rounded-xl object-contain bg-slate-50 p-1 border border-slate-200 shrink-0"
          />
        ) : (
          <div className="w-12 h-12 rounded-xl bg-gradient-to-tr from-[#fc6e20] to-amber-500 text-white font-black text-base flex items-center justify-center shadow-sm shrink-0">
            {(companyName ?? session.user.name ?? 'CT').substring(0, 2).toUpperCase()}
          </div>
        )}
        <div className="min-w-0 flex-1">
          <h2 className="text-base font-extrabold text-slate-900 truncate m-0">
            {companyName ?? 'Civil Tracker'}
          </h2>
          <div className="flex items-center gap-2 mt-0.5">
            <span className="text-xs text-[#fc6e20] font-bold uppercase tracking-wider">
              {session.user.role?.replace(/_/g, ' ')}
            </span>
            <span className="text-slate-300">·</span>
            <span className="text-xs text-slate-500 font-medium truncate">
              {session.user.name ?? session.user.email}
            </span>
          </div>
        </div>
      </div>

      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2 text-slate-600">
          <Grid className="w-4 h-4 text-[#fc6e20]" />
          <span className="text-xs font-bold uppercase tracking-wider text-slate-400">Operations Menu</span>
        </div>
      </div>

      {sections.map(section => {
        const filteredItems = section.items.filter(item => !(isSiteEngineer && item.hideForEng))
        if (filteredItems.length === 0) return null

        return (
          <div key={section.title} className="mb-6">
            <div className="text-[11px] font-black text-slate-400 uppercase tracking-wider mb-2 pl-1">
              {section.title}
            </div>
            <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm overflow-hidden divide-y divide-slate-100">
              {filteredItems.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className="flex items-center gap-3.5 p-4 hover:bg-slate-50 active:scale-98 transition-all no-underline text-inherit block"
                >
                  <span className="text-xl w-7 text-center">{item.icon}</span>
                  <span className="text-sm font-extrabold text-slate-800">{item.label}</span>
                  <ChevronRight className="w-4 h-4 ml-auto text-slate-300" />
                </Link>
              ))}
            </div>
          </div>
        )
      })}
    </div>
  )
}
