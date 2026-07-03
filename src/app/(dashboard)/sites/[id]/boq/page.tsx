export const dynamic = 'force-dynamic'

export default function SiteBoqPage() {
  return (
    <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden flex flex-col items-center justify-center p-12">
      <div className="w-16 h-16 bg-blue-50 text-blue-500 flex items-center justify-center rounded-full mb-4">
        <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
        </svg>
      </div>
      <h2 className="text-xl font-bold text-slate-800 mb-2">Bill of Quantities (BOQ)</h2>
      <p className="text-slate-500 text-center max-w-md">
        The BOQ module is currently under development. Soon you will be able to track item-wise quantities and rates directly against your budget.
      </p>
    </div>
  )
}
