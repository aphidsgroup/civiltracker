import { FileText } from 'lucide-react'

export default function DocumentsModulePage() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] p-8 text-center bg-white rounded-2xl border border-slate-200 shadow-sm">
      <div className="w-16 h-16 rounded-2xl bg-blue-50 text-blue-600 flex items-center justify-center mb-4">
        <FileText size={32} strokeWidth={1.5} />
      </div>
      <h2 className="text-xl font-bold text-slate-800 mb-2">Documents Module</h2>
      <p className="text-sm text-slate-500 max-w-md leading-relaxed">
        This module is currently being provisioned for your workspace. Verified contracts, drawings, and site approvals will appear here shortly.
      </p>
    </div>
  )
}
