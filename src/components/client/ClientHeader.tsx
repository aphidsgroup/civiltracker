'use client'

import React, { useState } from 'react'
import Link from 'next/link'
import { Menu, X, UserCircle, Settings, LogOut, HelpCircle } from 'lucide-react'
import { signOut } from 'next-auth/react'

export default function ClientHeader() {
  const [menuOpen, setMenuOpen] = useState(false)

  return (
    <>
      <header className="sticky top-0 z-40 bg-white/95 backdrop-blur-md border-b border-slate-200 px-4 py-3 flex items-center justify-between shadow-sm">
        <div className="flex items-center gap-2.5">
          <div className="w-12 h-12 rounded-full overflow-hidden shadow-md shadow-[#fc6e20]/30 shrink-0">
            <img src="/icons/icon-192.png" alt="Buildogram Logo" className="w-full h-full object-cover" />
          </div>
          <div className="flex flex-col justify-center">
            <span className="font-black text-[19px] text-[#0f172a] tracking-tighter uppercase leading-none">Civil Tracker</span>
            <div className="flex justify-end w-full">
              <span className="font-bold text-[8.5px] text-[#fc6e20] uppercase tracking-widest leading-none mt-0.5">by Buildogram</span>
            </div>
          </div>
        </div>

        <button 
          onClick={() => setMenuOpen(true)}
          className="w-10 h-10 rounded-full bg-slate-50 hover:bg-slate-100 flex items-center justify-center text-slate-700 transition-colors border-none p-0 cursor-pointer"
        >
          <Menu size={24} strokeWidth={2.5} />
        </button>
      </header>

      {menuOpen && (
        <div className="fixed inset-0 z-50 flex justify-end max-w-[440px] mx-auto select-none">
          <div 
            onClick={() => setMenuOpen(false)}
            className="absolute inset-0 bg-slate-950/40 backdrop-blur-sm animate-in fade-in duration-200"
          />
          
          <div className="relative w-[280px] bg-white h-full shadow-2xl animate-in slide-in-from-right duration-300 flex flex-col">
            <div className="flex items-center justify-between p-5 border-b border-slate-100 bg-slate-50/50">
              <span className="font-extrabold text-[18px] text-[#0f172a]">Client Menu</span>
              <button 
                onClick={() => setMenuOpen(false)}
                className="w-8 h-8 rounded-full bg-slate-200 hover:bg-slate-300 flex items-center justify-center text-slate-600 transition-colors border-none p-0 cursor-pointer"
              >
                <X size={18} strokeWidth={2.5} />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-2">
              <Link href="/client-portal" onClick={() => setMenuOpen(false)} className="flex items-center gap-3 px-4 py-3.5 rounded-xl hover:bg-slate-50 active:bg-slate-100 text-[#0f172a] font-bold no-underline transition-colors">
                <UserCircle size={22} className="text-[#fc6e20]" />
                Dashboard
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
