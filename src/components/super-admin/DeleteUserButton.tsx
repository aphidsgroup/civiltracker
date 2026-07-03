'use client'

interface Props {
  userId: string
  userName: string
  deleteAction: (formData: FormData) => Promise<void>
}

export default function DeleteUserButton({ userId, userName, deleteAction }: Props) {
  return (
    <form
      action={deleteAction}
      onSubmit={(e) => {
        if (!confirm(`Permanently delete user "${userName}"? This cannot be undone.`)) {
          e.preventDefault()
        }
      }}
    >
      <input type="hidden" name="userId" value={userId} />
      <button
        type="submit"
        className="px-4 py-2 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 text-sm font-semibold rounded-lg transition-colors cursor-pointer"
      >
        🗑 Delete User
      </button>
    </form>
  )
}
