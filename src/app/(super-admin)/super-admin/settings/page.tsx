import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'

export default async function SettingsPage() {
  const session = await auth()
  if (session?.user?.role !== 'SUPER_ADMIN') redirect('/dashboard')

  const sections = [
    {
      title: 'Platform Identity',
      fields: [
        { label: 'Platform Name', value: 'Civil Tracker', editable: false },
        { label: 'Support Email', value: 'support@civiltracker.in', editable: false },
        { label: 'Domain', value: 'civiltracker.buildogram.in', editable: false },
      ],
    },
    {
      title: 'Defaults',
      fields: [
        { label: 'Default Plan for New Companies', value: 'TRIAL', editable: false },
        { label: 'Default Storage Limit', value: '100 MB', editable: false },
        { label: 'Default User Limit', value: '5 users', editable: false },
        { label: 'Default Site Limit', value: '1 site', editable: false },
      ],
    },
    {
      title: 'Integrations',
      fields: [
        { label: 'Cloudinary Cloud', value: process.env.CLOUDINARY_CLOUD_NAME ?? '(configured)', editable: false },
        { label: 'Database', value: 'Neon PostgreSQL', editable: false },
        { label: 'Auth Provider', value: 'NextAuth v5 (JWT)', editable: false },
        { label: 'Deployment', value: 'Vercel', editable: false },
      ],
    },
  ]

  return (
    <>
      <div className="topbar">
        <div className="title">Settings</div>
      </div>

      <div style={{ padding: '24px', maxWidth: 720 }}>
        {sections.map(s => (
          <div key={s.title} className="ct-card" style={{ padding: 24, marginBottom: 20 }}>
            <div style={{ fontWeight: 800, fontSize: 15, marginBottom: 16, letterSpacing: '-0.02em' }}>{s.title}</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
              {s.fields.map((f, i) => (
                <div key={f.label} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 0', borderBottom: i < s.fields.length - 1 ? '1px solid var(--line)' : 'none' }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--mut)' }}>{f.label}</div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--ink)' }}>{f.value}</div>
                </div>
              ))}
            </div>
          </div>
        ))}

        <div className="ct-card" style={{ padding: 24 }}>
          <div style={{ fontWeight: 800, fontSize: 15, marginBottom: 8 }}>Danger Zone</div>
          <div style={{ fontSize: 13, color: 'var(--mut)', marginBottom: 16 }}>These actions are irreversible. Contact Anthropic Support before proceeding.</div>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            <div style={{ padding: '10px 18px', borderRadius: 10, border: '1px solid var(--red)', color: 'var(--red)', fontSize: 13, fontWeight: 700, cursor: 'default', opacity: 0.6 }}>
              Purge All Audit Logs
            </div>
            <div style={{ padding: '10px 18px', borderRadius: 10, border: '1px solid var(--red)', color: 'var(--red)', fontSize: 13, fontWeight: 700, cursor: 'default', opacity: 0.6 }}>
              Force Expire All Trials
            </div>
          </div>
        </div>
      </div>
    </>
  )
}
