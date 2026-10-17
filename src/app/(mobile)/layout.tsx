import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import MobileTabbar from '@/components/mobile/MobileTabbar'
import MobileHeader from '@/components/mobile/MobileHeader'
import { ChecklistPhotoNag } from '@/components/mobile/ChecklistPhotoNag'

import { prisma } from '@/lib/prisma'

export default async function MobileLayout({ children }: { children: React.ReactNode }) {
  const session = await auth()
  if (!session?.user) redirect('/login')

  const companyId = session.user.companyId

  const member = !companyId
    ? await prisma.companyMember.findFirst({
        where: { userId: session.user.id, isActive: true },
        include: { company: true },
      })
    : null

  const company = companyId
    ? await prisma.company.findUnique({
        where: { id: companyId },
        select: { name: true, logo: true, city: true },
      })
    : member?.company ?? null

  const companyName = company?.name || session.user.companyName || 'Civil Tracker'
  const companyLogo = company?.logo || session.user.companyLogo || null

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 flex flex-col justify-between max-w-[440px] mx-auto relative shadow-2xl overflow-x-hidden border-x border-slate-200/60 font-sans">
      <MobileHeader
        user={session.user}
        companyName={companyName}
        companyLogo={companyLogo}
      />
      <main className="flex-1 pb-28">
        {children}
        <ChecklistPhotoNag />
      </main>
      <MobileTabbar userRole={session.user.role} />
    </div>
  )
}

// trigger HMR
