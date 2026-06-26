import { FileText, Home } from 'lucide-react'

export default function Page() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[400px] bg-white border border-slate-200 rounded-2xl p-8 text-center max-w-lg mx-auto shadow-sm my-12">
      <div className="w-14 h-14 rounded-2xl bg-slate-100 flex items-center justify-center text-slate-500 mb-4">
        <FileText className="w-7 h-7" />
      </div>
      <div className="text-lg font-bold text-slate-900 mb-2">DETAILS Module</div>
      <div className="text-sm text-slate-500 leading-relaxed mb-6">This module is currently being configured for your workspace. It will be available shortly.</div>
      <button className="inline-flex items-center gap-2 px-4 py-2.5 bg-blue-600 text-white text-sm font-semibold rounded-xl hover:bg-blue-700 transition-colors shadow-sm cursor-pointer border-none font-inherit">
        <Home className="w-4.5 h-4.5" />
        Return to Dashboard
      </button>
    </div>
  )
}
