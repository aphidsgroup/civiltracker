import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import MobileTabbar from '@/components/mobile/MobileTabbar'

export default async function MobileLayout({ children }: { children: React.ReactNode }) {
  const session = await auth()
  if (!session?.user) redirect('/login')

  return (
    <div className="mobile-app-wrapper mobile-layout">
      <div className="ct screen">
        <div className="sScroll">
          {children}
        </div>
        <MobileTabbar />
      </div>
    </div>
  )
}
