import { requireUser } from '@/lib/auth/require-user'
import { signOut } from '@/lib/auth'
import prisma from '@/lib/prisma'
import Link from 'next/link'
import { User, Mail, Shield, Building2, Clock, HelpCircle, LogOut, ChevronRight, Award, CheckCircle2, PhoneCall } from 'lucide-react'

export default async function MobileProfilePage() {
  const user = await requireUser()

  const company = user.companyId
    ? await prisma.company.findUnique({
        where: { id: user.companyId },
        select: { name: true },
      })
    : null

  const companyName = company?.name || user.companyName || 'Independent Workspace'

  async function handleSignOut() {
    'use server'
    await signOut({ redirectTo: '/login' })
  }

  const initials = user.name
    ? user.name
        .split(' ')
        .map((n) => n[0])
        .join('')
        .substring(0, 2)
        .toUpperCase()
    : 'U'

  return (
    <div className="min-h-screen bg-[#f2f5f8] p-4 pb-28 max-w-lg mx-auto">
      {/* HEADER */}
      <div className="pt-4 pb-4 px-2 flex items-center justify-between">
        <h1 className="text-[26px] font-black text-[#16273a] tracking-tight">My Profile</h1>
        <span className="text-xs font-bold text-[#0f7a45] bg-[#e2f3ea] px-3 py-1 rounded-full flex items-center gap-1.5 border border-[#0f7a45]/20">
          <span className="w-1.5 h-1.5 rounded-full bg-[#0f7a45] animate-pulse" />
          Verified
        </span>
      </div>

      {/* USER PROFILE ID CARD */}
      <div className="relative overflow-hidden bg-gradient-to-br from-[#0d3a63] via-[#13558e] to-[#1a64a6] rounded-[28px] p-6 text-white shadow-xl shadow-[#0d3a63]/25 border border-white/10 mb-5">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-4">
            <div className="w-16 h-16 rounded-[20px] bg-gradient-to-tr from-amber-400 to-orange-500 text-white font-black text-2xl flex items-center justify-center shadow-lg shadow-orange-500/30 border-2 border-white/20">
              {initials}
            </div>
            <div>
              <h2 className="text-[22px] font-black leading-tight tracking-tight">{user.name}</h2>
              <div className="flex items-center gap-1.5 text-xs text-white/80 font-medium mt-1">
                <Mail size={13} className="text-[#38bdf8]" />
                <span className="truncate">{user.email}</span>
              </div>
            </div>
          </div>
        </div>

        <div className="mt-6 pt-5 border-t border-white/15 flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-2">
            <div className="p-1.5 rounded-lg bg-white/10 text-amber-300">
              <Shield size={16} />
            </div>
            <div>
              <div className="text-[10px] font-bold uppercase tracking-wider text-white/60">ROLE</div>
              <div className="text-xs font-black tracking-wide">{user.role.replace(/_/g, ' ')}</div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <div className="p-1.5 rounded-lg bg-white/10 text-[#38bdf8]">
              <Building2 size={16} />
            </div>
            <div>
              <div className="text-[10px] font-bold uppercase tracking-wider text-white/60">COMPANY</div>
              <div className="text-xs font-black tracking-wide max-w-[140px] truncate">{companyName}</div>
            </div>
          </div>
        </div>

        {/* Decorative background logo */}
        <Award className="absolute -bottom-8 -right-8 w-40 h-40 text-white/5 pointer-events-none transform -rotate-12" />
      </div>

      {/* SHIFT & ROSTER INFO */}
      <div className="bg-white rounded-[24px] p-5 border border-[#e4eaf0] shadow-sm mb-4">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2 text-xs font-extrabold uppercase tracking-wider text-[#647387]">
            <Clock size={16} className="text-emerald-600" />
            <span>Active Roster</span>
          </div>
          <span className="text-[11px] font-bold text-emerald-700 bg-emerald-50 px-2.5 py-0.5 rounded-full border border-emerald-200">
            On Duty
          </span>
        </div>
        <div className="bg-[#f8fafc] rounded-[18px] p-4 border border-[#e2e8f0]">
          <div className="text-sm font-black text-[#16273a]">General Site Shift (Day)</div>
          <div className="text-xs text-[#647387] font-medium mt-1 flex items-center justify-between">
            <span>09:00 AM – 06:00 PM</span>
            <span className="font-bold text-[#13558e]">Mon – Sat</span>
          </div>
        </div>
      </div>

      {/* SUPPORT & HELPDESK */}
      <div className="flex flex-col gap-3 mb-6">
        <a
          href="mailto:support@civiltracker.com"
          className="flex items-center justify-between p-4 bg-white rounded-[20px] border border-[#e4eaf0] shadow-sm active:scale-[0.98] transition-all hover:border-[#cbd5e1]"
        >
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-[14px] bg-[#f0f4f8] text-[#13558e] flex items-center justify-center">
              <HelpCircle size={20} />
            </div>
            <div>
              <div className="text-sm font-black text-[#16273a]">Contact Support</div>
              <div className="text-xs text-[#647387] font-medium">Get assistance from Civil Tracker team</div>
            </div>
          </div>
          <ChevronRight size={18} className="text-[#94a3b8]" />
        </a>

        <a
          href="tel:+919876543210"
          className="flex items-center justify-between p-4 bg-white rounded-[20px] border border-[#e4eaf0] shadow-sm active:scale-[0.98] transition-all hover:border-[#cbd5e1]"
        >
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-[14px] bg-[#fff7ed] text-[#ea580c] flex items-center justify-center">
              <PhoneCall size={20} />
            </div>
            <div>
              <div className="text-sm font-black text-[#16273a]">Emergency Field Helpline</div>
              <div className="text-xs text-[#647387] font-medium">+91 98765 43210 (24x7 Support)</div>
            </div>
          </div>
          <ChevronRight size={18} className="text-[#94a3b8]" />
        </a>
      </div>

      {/* SIGN OUT BUTTON */}
      <form action={handleSignOut}>
        <button
          type="submit"
          className="w-full py-4 px-6 bg-[#fbe6e3] hover:bg-[#f8d7d2] active:scale-[0.98] text-[#c4392c] font-black rounded-[20px] text-base shadow-sm transition-all flex items-center justify-center gap-2 border border-[#c4392c]/20"
        >
          <LogOut size={18} />
          <span>Sign Out of Account</span>
        </button>
      </form>
    </div>
  )
}
