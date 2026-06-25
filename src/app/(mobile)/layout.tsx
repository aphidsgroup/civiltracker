import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import MobileTabbar from '@/components/mobile/MobileTabbar'

export default async function MobileLayout({ children }: { children: React.ReactNode }) {
  const session = await auth()
  if (!session?.user) redirect('/login')

  return (
    <div style={{ minHeight: '100vh', background: '#f2f5f8', paddingBottom: '84px', maxWidth: '480px', margin: '0 auto', position: 'relative' }}>
      {children}
      <MobileTabbar />
    </div>
  )
}
