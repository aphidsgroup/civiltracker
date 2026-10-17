'use client'

import React, { useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Menu, X, UserCircle, Settings, LogOut, HelpCircle } from 'lucide-react'
import { signOut } from 'next-auth/react'

import type { SessionUser } from '@/types'

export default function MobileHeader({
  user,
  companyName,
  companyLogo,
}: {
  user?: SessionUser | null
  companyName?: string | null
  companyLogo?: string | null
}) {
  const [menuOpen, setMenuOpen] = useState(false)
  const pathname = usePathname()

  if (pathname.includes('/login')) return null

  const displayLogo = companyLogo ?? user?.companyLogo
  const displayCompanyName = companyName ?? user?.companyName ?? 'Civil Tracker'

  return (
    <>
      {/* Header Bar */}
      <header className="sticky top-0 z-40 bg-white/95 backdrop-blur-md border-b border-slate-200 px-4 py-2.5 flex items-center justify-between shadow-sm">
        {/* Left: Company Logo + Branding */}
        <div className="flex items-center gap-2.5 min-w-0">
          {displayLogo ? (
            <div className="w-10 h-10 rounded-xl overflow-hidden bg-white border border-slate-200 p-0.5 shadow-xs shrink-0 flex items-center justify-center">
              <img src={displayLogo} alt={displayCompanyName} className="w-full h-full object-contain" />
            </div>
          ) : (
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-[#fc6e20] to-[#e85b0d] text-white flex items-center justify-center font-black text-sm shrink-0 shadow-xs">
              {displayCompanyName ? displayCompanyName.substring(0, 2).toUpperCase() : 'CT'}
            </div>
          )}
          <div className="flex flex-col justify-center min-w-0">
            <span className="font-extrabold text-[16px] text-[#0f172a] tracking-tight uppercase leading-tight truncate max-w-[210px]">
              {displayCompanyName}
            </span>
            <div className="flex items-center gap-1.5 mt-0.5">
              <span className="font-bold text-[8.5px] text-[#fc6e20] uppercase tracking-widest leading-none">Civil Tracker</span>
            </div>
          </div>
        </div>

        {/* Right: Hamburger Menu */}
        <button 
          onClick={() => setMenuOpen(true)}
          aria-label="Open menu"
          className="w-9 h-9 rounded-full bg-slate-50 hover:bg-slate-100 flex items-center justify-center text-slate-700 transition-colors border border-slate-200/60 p-0 cursor-pointer shadow-xs shrink-0"
        >
          <Menu size={20} strokeWidth={2.5} />
        </button>
      </header>

      {/* Drawer Overlay */}
      {menuOpen && (
        <div className="fixed inset-0 z-50 flex justify-end max-w-[440px] mx-auto select-none">
          <div 
            onClick={() => setMenuOpen(false)}
            className="absolute inset-0 bg-slate-950/40 backdrop-blur-sm animate-in fade-in duration-200"
          />
          
          {/* Slide-out Menu */}
          <div className="relative w-[300px] bg-white h-full shadow-2xl animate-in slide-in-from-right duration-300 flex flex-col">
            <div className="p-5 border-b border-slate-100 bg-slate-50/80">
              <div className="flex items-center justify-between mb-3.5">
                <span className="font-extrabold text-[12px] text-slate-400 uppercase tracking-wider">WORKSPACE</span>
                <button 
                  onClick={() => setMenuOpen(false)}
                  aria-label="Close menu"
                  className="w-7 h-7 rounded-full bg-slate-200 hover:bg-slate-300 flex items-center justify-center text-slate-600 transition-colors border-none p-0 cursor-pointer"
                >
                  <X size={15} strokeWidth={2.5} />
                </button>
              </div>

              {/* Company Identity in Drawer */}
              <div className="flex items-center gap-3 p-3 bg-white rounded-2xl border border-slate-200/80 shadow-xs mb-3">
                {displayLogo ? (
                  <div className="w-11 h-11 rounded-xl bg-white border border-slate-200 p-0.5 flex items-center justify-center shrink-0 shadow-xs">
                    <img src={displayLogo} alt={displayCompanyName} className="w-full h-full object-contain" />
                  </div>
                ) : (
                  <div className="w-11 h-11 rounded-xl bg-gradient-to-tr from-[#fc6e20] to-[#e85b0d] text-white flex items-center justify-center font-black text-sm shrink-0">
                    {displayCompanyName.substring(0, 2).toUpperCase()}
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <div className="font-extrabold text-[14px] text-slate-900 truncate leading-snug">{displayCompanyName}</div>
                  <div className="text-[10.5px] font-bold text-[#fc6e20] uppercase tracking-wide mt-0.5">Verified Company</div>
                </div>
              </div>

              {/* User Profile in Drawer */}
              {user && (
                <div className="px-1 text-left">
                  <div className="text-xs font-bold text-slate-800 truncate">{user.name}</div>
                  <div className="text-[11px] text-slate-500 font-medium truncate mt-0.5">{user.email}</div>
                  <div className="mt-1.5">
                    <span className="inline-block text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-200 text-slate-700">
                      {user.role?.replace(/_/g, ' ')}
                    </span>
                  </div>
                </div>
              )}
            </div>

            <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-2">
              <Link href="/mobile/profile" onClick={() => setMenuOpen(false)} className="flex items-center gap-3 px-4 py-3.5 rounded-xl hover:bg-slate-50 active:bg-slate-100 text-[#0f172a] font-bold no-underline transition-colors">
                <UserCircle size={22} className="text-[#fc6e20]" />
                Profile
              </Link>
              <Link href="#" onClick={() => setMenuOpen(false)} className="flex items-center gap-3 px-4 py-3.5 rounded-xl hover:bg-slate-50 active:bg-slate-100 text-[#0f172a] font-bold no-underline transition-colors">
                <Settings size={22} className="text-slate-400" />
                Settings
              </Link>
              <Link href="#" onClick={() => setMenuOpen(false)} className="flex items-center gap-3 px-4 py-3.5 rounded-xl hover:bg-slate-50 active:bg-slate-100 text-[#0f172a] font-bold no-underline transition-colors">
                <HelpCircle size={22} className="text-slate-400" />
                Help & Support
              </Link>
            </div>

            <div className="p-4 border-t border-slate-100">
              <button 
                onClick={() => signOut({ callbackUrl: '/login' })}
                className="w-full flex items-center justify-center gap-2 bg-[#fff7ed] text-[#fc6e20] hover:bg-[#ffedd5] border-none py-3.5 rounded-xl font-extrabold text-[15px] cursor-pointer transition-colors"
              >
                <LogOut size={18} strokeWidth={2.5} />
                Sign Out
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
