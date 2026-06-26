import { Receipt } from 'lucide-react'

export default function Page() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[70vh] p-6 text-center">
      <div className="flex items-center justify-center w-16 h-16 mb-4 bg-amber-50 text-amber-600 rounded-2xl border border-amber-100 shadow-sm">
        <Receipt className="w-8 h-8" />
      </div>
      <h1 className="text-xl font-bold text-gray-900 mb-2">ADD EXPENSE Module</h1>
      <p className="text-sm text-gray-500 max-w-sm leading-relaxed">
        This module is currently being configured for your workspace. It will be available shortly.
      </p>
    </div>
  )
}
