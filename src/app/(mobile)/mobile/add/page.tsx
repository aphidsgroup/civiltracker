import { requireUser } from '@/lib/auth/require-user'
import Link from 'next/link'
import { Plus, ArrowLeft } from 'lucide-react'

export const metadata = {
  title: 'Quick Add Hub | Civil Tracker Mobile',
  description: 'Instantly record site expenses, upload bills, and log daily worker muster rolls.',
}

export default async function MobileQuickAddPage() {
  await requireUser()

  const quickOptions = [
    { label: 'Add Expense', href: '/mobile/add-expense', bg: 'bg-[#e6f4ea]', text: 'text-[#137333]' },
    { label: 'Upload Bill', href: '/mobile/upload-bill', bg: 'bg-[#e8f0fe]', text: 'text-[#1a73e8]' },
    { label: 'Mark Attendance', href: '/mobile/attendance', bg: 'bg-[#fef7e0]', text: 'text-[#b06000]' },
    { label: 'Site Photos', href: '/mobile/site-photo', bg: 'bg-[#f3e8ff]', text: 'text-[#7e22ce]' },
    { label: 'Daily Report', href: '/mobile/dpr', bg: 'bg-[#e0e7ff]', text: 'text-[#4338ca]' },
    { label: 'Material In', href: '/mobile/upload-bill?type=MATERIAL', bg: 'bg-[#d1fae5]', text: 'text-[#047857]' },
    { label: 'Client Advance', href: '/mobile/add-client-advance', bg: 'bg-[#fef3c7]', text: 'text-[#b45309]' },
    { label: 'Raise Issue', href: '/mobile/notifications', bg: 'bg-[#ffe4e6]', text: 'text-[#be123c]' },
  ]

  return (
    <div className="min-h-screen bg-white pb-28 select-none max-w-lg mx-auto p-6">
      {/* Top Header */}
      <div className="flex items-center justify-between mb-6 pt-2">
        <Link href="/mobile/home" className="inline-flex items-center gap-1.5 text-xs font-bold text-slate-500 no-underline active:scale-95">
          <ArrowLeft size={16} />
          <span>Cancel</span>
        </Link>
      </div>

      {/* Drag bar styling to replicate bottom sheet design */}
      <div className="w-12 h-1.5 bg-slate-200 rounded-full mx-auto mb-6" />

      <h1 className="text-xl font-black text-[#1e293b] mb-8 tracking-tight">Quick add</h1>

      {/* 3-Column Claude Design Grid */}
      <div className="grid grid-cols-3 gap-y-8 gap-x-3">
        {quickOptions.map((opt) => (
          <Link
            key={opt.label}
            href={opt.href}
            className="flex flex-col items-center group no-underline text-inherit active:scale-90 transition-transform"
          >
            <div className={`w-16 h-16 rounded-[20px] ${opt.bg} ${opt.text} flex items-center justify-center shadow-xs group-hover:scale-105 transition-transform`}>
              <Plus size={30} strokeWidth={2.4} />
            </div>
            <span className="text-[11.5px] font-black text-[#1e293b] text-center tracking-tight leading-snug mt-2.5 max-w-[85px]">
              {opt.label}
            </span>
          </Link>
        ))}
      </div>
    </div>
  )
}
