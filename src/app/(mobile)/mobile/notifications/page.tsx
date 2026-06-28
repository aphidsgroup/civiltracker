import { requireUser } from '@/lib/auth/require-user'
import prisma from '@/lib/prisma'
import Link from 'next/link'
import { Bell, ShieldAlert, FileCheck, Camera, HardHat, CheckCheck, ArrowLeft, Sparkles, ChevronRight, AlertTriangle } from 'lucide-react'

export const metadata = {
  title: 'Notifications & Alerts Hub | Civil Tracker Mobile',
  description: 'View real-time field operations alerts, pending bill approvals, and budget warnings.',
}

export default async function MobileNotificationsPage() {
  const user = await requireUser()

  const dbNotifications = await prisma.notification.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: 'desc' },
    take: 20
  })

  // Helper to map DB notification types to UI
  const mapTypeToUI = (type: string) => {
    switch (type) {
      case 'APPROVAL_REQUIRED':
      case 'APPROVED':
      case 'REJECTED':
        return { icon: FileCheck, color: 'bg-amber-50 text-amber-600 border-amber-200 border-l-amber-500', label: 'APPROVAL' }
      case 'LOW_STOCK':
      case 'PAYMENT_DUE':
        return { icon: AlertTriangle, color: 'bg-rose-50 text-rose-600 border-rose-200 border-l-rose-500', label: 'ALERT' }
      case 'DPR_REMINDER':
        return { icon: HardHat, color: 'bg-[#fff7ed] text-[#fc6e20] border-blue-200 border-l-blue-500', label: 'SITE' }
      default:
        return { icon: Bell, color: 'bg-slate-50 text-slate-600 border-slate-200 border-l-slate-400', label: 'INFO' }
    }
  }

  const notifications = dbNotifications.map(n => ({
    id: n.id,
    title: n.title,
    message: n.message,
    time: n.createdAt.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }),
    type: mapTypeToUI(n.type).label,
    icon: mapTypeToUI(n.type).icon,
    color: mapTypeToUI(n.type).color,
    href: n.link || '#'
  }))

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
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#fc6e20]/20 border border-blue-400/30 text-[10px] font-black uppercase tracking-wider text-blue-300">
            <Sparkles size={12} />
            <span>Telemetry Dispatch</span>
          </div>
          <span className="px-2.5 py-0.5 rounded-full bg-rose-500 text-white font-black text-[10px]">
            {dbNotifications.filter(n => !n.read).length} New
          </span>
        </div>
        <h1 className="text-2xl font-black tracking-tight m-0">Notification Hub</h1>
        <p className="text-xs text-slate-400 font-medium m-0">Real-time alerts, geofence check-ins, and pending sign-offs</p>
      </div>

      {/* Filter Chips & Action */}
      <div className="px-4 flex items-center justify-between gap-2 mb-3">
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
          <span className="px-3 py-1.5 rounded-xl bg-slate-900 text-white text-xs font-black shadow-sm">All ({notifications.length})</span>
          <span className="px-3 py-1.5 rounded-xl bg-white text-slate-600 text-xs font-bold border border-slate-200">Alerts</span>
          <span className="px-3 py-1.5 rounded-xl bg-white text-slate-600 text-xs font-bold border border-slate-200">Approvals</span>
        </div>

        <button className="text-[11px] font-bold text-[#fc6e20] bg-transparent border-none cursor-pointer flex items-center gap-1 active:scale-95 whitespace-nowrap">
          <CheckCheck size={14} />
          <span>Read All</span>
        </button>
      </div>

      {/* Notifications Feed */}
      <div className="px-4 space-y-3">
        {notifications.length === 0 ? (
          <div className="bg-white rounded-2xl p-8 text-center border border-slate-100 shadow-sm mt-6">
            <div className="w-16 h-16 bg-slate-50 rounded-full flex items-center justify-center mx-auto mb-4">
              <CheckCheck className="text-slate-300" size={32} />
            </div>
            <h3 className="text-slate-900 font-bold mb-1">You're all caught up!</h3>
            <p className="text-slate-500 text-sm">No new notifications or alerts at this time.</p>
          </div>
        ) : (
          notifications.map((item) => {
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
          })
        )}
      </div>
    </div>
  )
}
