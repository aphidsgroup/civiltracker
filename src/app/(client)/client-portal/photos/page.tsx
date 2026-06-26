import { Camera } from 'lucide-react'

export default function PhotosModulePage() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] p-8 text-center bg-white rounded-2xl border border-slate-200 shadow-sm">
      <div className="w-16 h-16 rounded-2xl bg-purple-50 text-purple-600 flex items-center justify-center mb-4">
        <Camera size={32} strokeWidth={1.5} />
      </div>
      <h2 className="text-xl font-bold text-slate-800 mb-2">Site Photo Gallery</h2>
      <p className="text-sm text-slate-500 max-w-md leading-relaxed">
        This visual module is currently syncing with site feeds. High-resolution daily progress photography and drone surveys will appear here shortly.
      </p>
    </div>
  )
}
