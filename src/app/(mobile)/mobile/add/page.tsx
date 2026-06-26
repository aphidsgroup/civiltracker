import { requireUser } from '@/lib/auth/require-user'
import Link from 'next/link'
import { Receipt, UploadCloud, Users, FileText, Sparkles, ArrowRight } from 'lucide-react'

export default async function MobileQuickAddPage() {
  const user = await requireUser()

  const tiles = [
    {
      title: 'Add Expense',
      subtitle: 'Log quick petty cash or site expense',
      href: '/mobile/add-expense',
      icon: Receipt,
      gradient: 'from-amber-500 to-orange-600',
      shadow: 'shadow-orange-500/25',
      badge: 'Petty Cash',
    },
    {
      title: 'Upload Bill',
      subtitle: 'Scan vendor invoices & challans',
      href: '/mobile/upload-bill',
      icon: UploadCloud,
      gradient: 'from-[#0d3a63] to-[#1a64a6]',
      shadow: 'shadow-blue-900/25',
      badge: 'Invoice OCR',
    },
    {
      title: 'Mark Attendance',
      subtitle: 'Record daily worker presence & wage',
      href: '/mobile/attendance',
      icon: Users,
      gradient: 'from-emerald-500 to-teal-600',
      shadow: 'shadow-emerald-500/25',
      badge: 'Labour Roster',
    },
    {
      title: 'Create DPR',
      subtitle: 'Submit daily site progress report',
      href: '/mobile/dpr',
      icon: FileText,
      gradient: 'from-violet-600 to-purple-700',
      shadow: 'shadow-purple-600/25',
      badge: 'Progress',
    },
  ]

  return (
    <div className="min-h-screen bg-[#f2f5f8] p-4 pb-28 max-w-lg mx-auto">
      {/* BANNER HEADER */}
      <div className="pt-6 pb-6 px-2">
        <div className="inline-flex items-center gap-2 px-3 py-1 bg-white rounded-full border border-[#e4eaf0] shadow-sm mb-3">
          <Sparkles size={14} className="text-amber-500 animate-pulse" />
          <span className="text-xs font-bold text-[#16273a] tracking-wide">Quick Telemetry Hub</span>
        </div>
        <h1 className="text-[28px] font-black text-[#16273a] tracking-tight leading-tight">
          New Entry, {user.name.split(' ')[0]}
        </h1>
        <p className="text-sm text-[#647387] font-medium mt-1">
          Select a vibrant module to instantly record field data
        </p>
      </div>

      {/* 4 VIBRANT TILES GRID */}
      <div className="grid grid-cols-1 gap-4">
        {tiles.map((tile) => {
          const Icon = tile.icon
          return (
            <Link
              key={tile.title}
              href={tile.href}
              className="group relative flex items-center justify-between p-5 bg-white rounded-[24px] border border-[#e4eaf0] shadow-sm active:scale-[0.98] transition-all duration-200 hover:border-[#cbd5e1] hover:shadow-md overflow-hidden"
            >
              <div className="flex items-center gap-4 min-w-0 flex-1 z-10">
                <div
                  className={`w-14 h-14 rounded-[18px] bg-gradient-to-br ${tile.gradient} text-white flex items-center justify-center shadow-lg ${tile.shadow} flex-shrink-0 group-hover:scale-105 transition-transform`}
                >
                  <Icon size={26} strokeWidth={2.2} />
                </div>
                <div className="min-w-0 flex-1 pr-2">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-[10px] font-extrabold tracking-wider uppercase text-[#13558e] bg-[#e7f0fb] px-2 py-0.5 rounded-md">
                      {tile.badge}
                    </span>
                  </div>
                  <h2 className="text-[18px] font-black text-[#16273a] truncate">{tile.title}</h2>
                  <p className="text-xs font-medium text-[#647387] mt-0.5 truncate">{tile.subtitle}</p>
                </div>
              </div>

              <div className="w-10 h-10 rounded-full bg-[#f2f5f8] text-[#16273a] flex items-center justify-center flex-shrink-0 group-hover:bg-[#16273a] group-hover:text-white transition-colors z-10">
                <ArrowRight size={18} />
              </div>

              {/* Subtle background glow */}
              <div className="absolute right-0 top-0 w-32 h-32 bg-gradient-to-br from-gray-50 to-transparent opacity-50 rounded-full transform translate-x-10 -translate-y-10 group-hover:scale-150 transition-transform pointer-events-none" />
            </Link>
          )
        })}
      </div>
    </div>
  )
}
