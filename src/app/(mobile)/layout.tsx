import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import MobileTabbar from '@/components/mobile/MobileTabbar'

export default async function MobileLayout({ children }: { children: React.ReactNode }) {
  const session = await auth()
  if (!session?.user) redirect('/login')

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 flex flex-col justify-between max-w-[440px] mx-auto relative shadow-2xl overflow-x-hidden border-x border-slate-200/60 font-sans">
      <main className="flex-1 pb-28">
        {children}
      </main>
      <MobileTabbar />
    </div>
  )
}

// trigger HMR
