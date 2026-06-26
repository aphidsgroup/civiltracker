import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { ChevronRight, Grid } from 'lucide-react'

export default async function MobileMorePage() {
  const session = await auth()
  if (!session?.user) redirect('/login')

  const sections = [
    { title: 'Finance', items: [
      { href: '/bills', label: 'Bill Approval', icon: '\u{1F9FE}' },
      { href: '/expenses', label: 'All Expenses', icon: '\u{1F4B3}' },
      { href: '/salary', label: 'Salary Runs', icon: '\u{1F4B5}' },
    ]},
    { title: 'Site', items: [
      { href: '/materials', label: 'Materials', icon: '\u{1F9F1}' },
      { href: '/labour', label: 'Labour', icon: '\u{1F477}' },
      { href: '/tasks', label: 'Tasks', icon: '\u2705' },
      { href: '/dpr', label: 'DPR History', icon: '\u{1F4DD}' },
      { href: '/documents', label: 'Documents', icon: '\u{1F4C1}' },
    ]},
    { title: 'Admin', items: [
      { href: '/dashboard', label: 'Desktop View', icon: '\u{1F4BB}' },
      { href: '/settings', label: 'Settings', icon: '\u2699\uFE0F' },
    ]},
  ]

  return (
    <div className="p-4 pb-24 max-w-lg mx-auto bg-gray-50 min-h-screen">
      <div className="flex items-center gap-2.5 mb-6 pt-2">
        <div className="p-2 bg-amber-50 text-amber-600 rounded-xl">
          <Grid className="w-5 h-5" />
        </div>
        <h1 className="text-lg font-bold text-gray-900">More</h1>
      </div>

      {sections.map(section => (
        <div key={section.title} className="mb-6">
          <div className="text-[11px] font-bold text-gray-400 uppercase tracking-wider mb-2 pl-1">{section.title}</div>
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden divide-y divide-gray-100">
            {section.items.map((item) => (
              <Link key={item.href} href={item.href} className="flex items-center gap-3 p-3.5 hover:bg-gray-50 transition-colors">
                <span className="text-lg w-6 text-center">{item.icon}</span>
                <span className="text-sm font-semibold text-gray-800">{item.label}</span>
                <ChevronRight className="w-4 h-4 ml-auto text-gray-400" />
              </Link>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}
