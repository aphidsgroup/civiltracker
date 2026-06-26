import Link from 'next/link'
import { CalendarCheck, Home } from 'lucide-react'

export default function Page() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] p-8 text-center bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm max-w-lg mx-auto my-12">
      <div className="p-4 bg-blue-50 dark:bg-blue-950/50 text-blue-600 dark:text-blue-400 rounded-2xl mb-4">
        <CalendarCheck className="w-10 h-10" />
      </div>
      <h1 className="text-xl font-extrabold text-slate-900 dark:text-slate-100 tracking-tight mb-2">ATTENDANCE Module</h1>
      <p className="text-sm text-slate-500 dark:text-slate-400 mb-6 max-w-sm leading-relaxed">
        This module is currently being configured for your workspace. It will be available shortly.
      </p>
      <Link href="/" className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-semibold text-sm transition-colors shadow-sm">
        <Home className="w-4 h-4" />
        Return to Dashboard
      </Link>
    </div>
  )
}
