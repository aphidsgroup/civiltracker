import { CreditCard } from 'lucide-react'

export default function PaymentsModulePage() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] p-8 text-center bg-white rounded-2xl border border-slate-200 shadow-sm">
      <div className="w-16 h-16 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center mb-4">
        <CreditCard size={32} strokeWidth={1.5} />
      </div>
      <h2 className="text-xl font-bold text-slate-800 mb-2">Payments & Invoicing Module</h2>
      <p className="text-sm text-slate-500 max-w-md leading-relaxed">
        This financial module is currently being configured for your workspace. Payment schedules, milestone invoices, and receipts will be available shortly.
      </p>
    </div>
  )
}
