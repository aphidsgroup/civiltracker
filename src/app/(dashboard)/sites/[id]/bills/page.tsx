export const dynamic = 'force-dynamic'

export default function SiteBillsPage() {
  return (
    <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden flex flex-col items-center justify-center p-12">
      <div className="w-16 h-16 bg-blue-50 text-blue-500 flex items-center justify-center rounded-full mb-4">
        <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
        </svg>
      </div>
      <h2 className="text-xl font-bold text-slate-800 mb-2">Vendor Bills</h2>
      <p className="text-slate-500 text-center max-w-md">
        Vendor and Subcontractor billing linked to this site is currently under development. Track all payments centrally in the Expenses module.
      </p>
    </div>
  )
}
