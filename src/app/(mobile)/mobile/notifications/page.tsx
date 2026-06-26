import { requireUser } from '@/lib/auth/require-user'
import Link from 'next/link'
import { Bell, ShieldAlert, FileCheck, Camera, HardHat, CheckCheck, ArrowLeft, Sparkles, ChevronRight, AlertTriangle } from 'lucide-react'

export const metadata = {
  title: 'Notifications & Alerts Hub | Civil Tracker Mobile',
  description: 'View real-time field operations alerts, pending bill approvals, and budget warnings.',
}

export default async function MobileNotificationsPage() {
  const user = await requireUser()

  const notifications = [
    {
      id: 'notif-1',
      title: 'Worksite Budget Alert',
      message: 'Metro Heights Tower A has utilized 92% of allocated foundation budget.',
      time: '12m ago',
      type: 'ALERT',
      icon: AlertTriangle,
      color: 'bg-rose-50 text-rose-600 border-rose-200 border-l-rose-500',
      href: '/mobile/sites'
    },
    {
      id: 'notif-2',
      title: 'Pending Challan Approval',
      message: '₹45,200 cement delivery invoice submitted by UltraTech Traders requires review.',
      time: '45m ago',
      type: 'APPROVAL',
      icon: FileCheck,
      color: 'bg-amber-50 text-amber-600 border-amber-200 border-l-amber-500',
      href: '/mobile/approvals'
    },
    {
      id: 'notif-3',
      title: 'Geofenced GPS Photo Lock',
      message: 'Murugan M uploaded verified reinforcement photo with ±3.2m satellite lock.',
      time: '1h ago',
      type: 'SITE',
      icon: Camera,
      color: 'bg-emerald-50 text-emerald-600 border-emerald-200 border-l-emerald-500',
      href: '/mobile/site-photo'
    },
    {
      id: 'notif-4',
      title: 'Daily Muster Roll Submitted',
      message: '14 Field employees marked Present across Sector 62 Worksites today.',
      time: '2h ago',
      type: 'LABOUR',
      icon: HardHat,
      color: 'bg-blue-50 text-blue-600 border-blue-200 border-l-blue-500',
      href: '/mobile/attendance'
    }
  ]

  return (
    <div className="min-h-screen bg-slate-50 pb-28 select-none">
      {/* Top Navigation Bar */}
      <div className="bg-slate-900 text-white p-4 sticky top-0 z-40 flex items-center justify-between shadow-md">
        <Link href="/mobile/home" className="inline-flex items-center gap-1.5 text-xs font-bold text-blue-400 no-underline active:scale-95">
          <ArrowLeft size={16} />
          <span>Home</span>
        </Link>
        <span className="text-xs font-black uppercase tracking-wider text-slate-300">Operations Feed</span>
        <div className="w-12" />
      </div>

      {/* Hero Banner */}
      <div className="bg-gradient-to-br from-slate-900 via-indigo-950 to-slate-900 text-white p-6 rounded-b-[32px] shadow-xl space-y-3 mb-4">
        <div className="flex items-center justify-between">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-blue-500/20 border border-blue-400/30 text-[10px] font-black uppercase tracking-wider text-blue-300">
            <Sparkles size={12} />
            <span>Telemetry Dispatch</span>
          </div>
          <span className="px-2.5 py-0.5 rounded-full bg-rose-500 text-white font-black text-[10px]">
            {notifications.length} New
          </span>
        </div>
        <h1 className="text-2xl font-black tracking-tight m-0">Notification Hub</h1>
        <p className="text-xs text-slate-400 font-medium m-0">Real-time alerts, geofence check-ins, and pending sign-offs</p>
      </div>

      {/* Filter Chips & Action */}
      <div className="px-4 flex items-center justify-between gap-2 mb-3">
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
          <span className="px-3 py-1.5 rounded-xl bg-slate-900 text-white text-xs font-black shadow-sm">All (4)</span>
          <span className="px-3 py-1.5 rounded-xl bg-white text-slate-600 text-xs font-bold border border-slate-200">Alerts</span>
          <span className="px-3 py-1.5 rounded-xl bg-white text-slate-600 text-xs font-bold border border-slate-200">Approvals</span>
        </div>

        <button className="text-[11px] font-bold text-blue-600 bg-transparent border-none cursor-pointer flex items-center gap-1 active:scale-95 whitespace-nowrap">
          <CheckCheck size={14} />
          <span>Read All</span>
        </button>
      </div>

      {/* Notifications Feed */}
      <div className="px-4 space-y-3">
        {notifications.map((item) => {
          const Icon = item.icon
          return (
            <Link
              key={item.id}
              href={item.href}
              className={`block bg-white p-4 rounded-2xl border shadow-sm border-l-4 no-underline text-inherit active:scale-[0.98] transition-all ${item.color}`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-start gap-3 min-w-0 flex-1">
                  <div className="p-2.5 rounded-xl bg-white shadow-sm flex-shrink-0 mt-0.5">
                    <Icon size={20} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2 mb-1">
                      <span className="font-black text-sm text-slate-900 truncate">{item.title}</span>
                      <span className="text-[10px] font-bold text-slate-400 whitespace-nowrap flex-shrink-0">{item.time}</span>
                    </div>
                    <p className="text-xs text-slate-600 font-medium leading-relaxed m-0 line-clamp-2">
                      {item.message}
                    </p>
                  </div>
                </div>
                <ChevronRight className="w-4 h-4 text-slate-300 self-center flex-shrink-0 ml-1" />
              </div>
            </Link>
          )
        })}
      </div>
    </div>
  )
}
