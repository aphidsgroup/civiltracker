import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { ChevronRight, Grid, ShieldAlert } from 'lucide-react'

export default async function MobileMorePage() {
  const session = await auth()
  if (!session?.user) redirect('/login')

  const isSiteEngineer = session.user.role === 'SITE_ENGINEER' || session.user.role === 'SUPERVISOR'

  const sections = [
    { title: 'Field Input & Finance', items: [
      { href: '/mobile/approvals', label: 'Bill Approvals & Vouchers', icon: '\u{1F9FE}', hideForEng: true },
      { href: '/mobile/add-expense', label: 'Site Expenses & Petty Cash', icon: '\u{1F4B3}' },
      { href: '/mobile/upload-bill', label: 'Upload Challan / Invoice', icon: '\u{1F4C4}' },
    ]},
    { title: 'Site Operations', items: [
      { href: '/mobile/sites', label: isSiteEngineer ? 'My Assigned Projects' : 'All Project Sites', icon: '\u{1F3D7}\uFE0F' },
      { href: '/mobile/attendance', label: 'Labour Muster Roll & Advances', icon: '\u{1F477}' },
      { href: '/mobile/dpr', label: 'Daily Progress Reports (DPR)', icon: '\u{1F4DD}' },
      { href: '/mobile/site-photo', label: 'Site Camera Gallery', icon: '\u{1F4F8}' },
    ]},
    { title: 'System & Preferences', items: [
      { href: '/dashboard', label: 'Launch Desktop Dashboard', icon: '\u{1F4BB}' },
      { href: '/mobile/profile', label: 'My ID & Shift Profile', icon: '\u{1F464}' },
    ]},
  ]

  return (
    <div className="p-4 pb-28 max-w-lg mx-auto bg-slate-50 min-h-screen select-none">
      <div className="flex items-center justify-between mb-5 pt-2">
        <div className="flex items-center gap-2.5">
          <div className="p-2.5 bg-blue-600 text-white rounded-2xl shadow-md shadow-blue-600/20">
            <Grid className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-xl font-black text-slate-900 m-0">Operations Menu</h1>
            <p className="text-xs text-slate-400 font-medium m-0">{session.user.role || 'Field Portal'}</p>
          </div>
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
