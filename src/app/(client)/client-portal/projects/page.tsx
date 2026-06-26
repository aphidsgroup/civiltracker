import { Building2 } from 'lucide-react'

export default function ProjectsModulePage() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] p-8 text-center bg-white rounded-2xl border border-slate-200 shadow-sm">
      <div className="w-16 h-16 rounded-2xl bg-amber-50 text-amber-600 flex items-center justify-center mb-4">
        <Building2 size={32} strokeWidth={1.5} />
      </div>
      <h2 className="text-xl font-bold text-slate-800 mb-2">Projects & Milestones</h2>
      <p className="text-sm text-slate-500 max-w-md leading-relaxed">
        This project oversight module is currently being configured. Detailed Gantt schedules, milestone tracking, and site telemetry will be available shortly.
      </p>
    </div>
  )
}
