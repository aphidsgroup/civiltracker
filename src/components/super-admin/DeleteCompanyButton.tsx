'use client'

interface Props {
  companyId: string
  companyName: string
  deleteAction: (formData: FormData) => Promise<void>
}

export default function DeleteCompanyButton({ companyId, companyName, deleteAction }: Props) {
  return (
    <form
      action={deleteAction}
      onSubmit={(e) => {
        if (!confirm(`Permanently delete "${companyName}" and ALL its data? This cannot be undone.`)) {
          e.preventDefault()
        }
      }}
    >
      <input type="hidden" name="companyId" value={companyId} />
      <button
        type="submit"
        className="px-4 py-2 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 text-sm font-semibold rounded-lg transition-colors cursor-pointer"
      >
        🗑 Delete Company
      </button>
    </form>
  )
}
