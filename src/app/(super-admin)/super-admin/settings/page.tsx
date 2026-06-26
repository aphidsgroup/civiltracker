import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { Settings, Sliders, AlertTriangle } from 'lucide-react'

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
      <div className="flex items-center justify-between px-8 py-5 border-b border-slate-200 bg-white">
        <div className="text-lg font-bold text-slate-800 flex items-center gap-2">
          <Settings className="text-[#fc6e20]" size={20} />
          Platform Settings
        </div>
      </div>

      <div className="p-8 max-w-4xl mx-auto space-y-8">
        {sections.map(s => (
          <div key={s.title} className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
            <div className="text-base font-bold text-slate-900 mb-4 tracking-tight flex items-center gap-2">
              <Sliders size={16} className="text-slate-400" />
              {s.title}
            </div>
            <div className="divide-y divide-slate-100">
              {s.fields.map(f => (
                <div key={f.label} className="flex items-center justify-between py-3.5 text-sm">
                  <div className="font-medium text-slate-500">{f.label}</div>
                  <div className="font-bold text-slate-800 font-mono text-xs bg-slate-50 px-2.5 py-1 rounded border border-slate-100">
                    {f.value}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}

        <div className="bg-rose-50/50 rounded-2xl border border-rose-200 p-6 shadow-sm">
          <div className="text-base font-bold text-rose-900 mb-1 flex items-center gap-2">
            <AlertTriangle size={18} className="text-rose-600" />
            Danger Zone
          </div>
          <div className="text-sm text-rose-600/80 mb-6 leading-relaxed">
            These platform actions are global and irreversible. Please verify backup retention policies before executing.
          </div>
          <div className="flex gap-3 flex-wrap">
            <button disabled className="px-4 py-2 rounded-xl border border-rose-300 bg-white text-rose-600 font-bold text-xs shadow-sm opacity-50 cursor-not-allowed">
              Purge All Audit Logs
            </button>
            <button disabled className="px-4 py-2 rounded-xl border border-rose-300 bg-white text-rose-600 font-bold text-xs shadow-sm opacity-50 cursor-not-allowed">
              Force Expire All Trials
            </button>
          </div>
        </div>
      </div>
    </>
  )
}
