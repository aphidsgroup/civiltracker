import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import Link from 'next/link'

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
    <div style={{ padding: '16px' }}>
      <h1 style={{ fontSize: '18px', fontWeight: 800, marginBottom: '18px' }}>More</h1>
      {sections.map(section => (
        <div key={section.title} style={{ marginBottom: '18px' }}>
          <div style={{ fontSize: '10.5px', fontWeight: 700, color: 'var(--mut)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '8px' }}>{section.title}</div>
          <div style={{ background: '#fff', borderRadius: '16px', border: '1px solid var(--line)', overflow: 'hidden' }}>
            {section.items.map((item, i) => (
              <Link key={item.href} href={item.href} style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '14px 16px', borderBottom: i < section.items.length - 1 ? '1px solid var(--line)' : 'none', textDecoration: 'none', color: 'inherit' }}>
                <span style={{ fontSize: '18px', width: '24px', textAlign: 'center' }}>{item.icon}</span>
                <span style={{ fontSize: '14px', fontWeight: 600 }}>{item.label}</span>
                <span style={{ marginLeft: 'auto', color: 'var(--mut)', fontSize: '16px' }}>›</span>
              </Link>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}
