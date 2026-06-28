import { requireUser } from '@/lib/auth/require-user'
import { prisma } from '@/lib/prisma'
import { redirect } from 'next/navigation'
import MobileClientAdvanceClient from '@/components/mobile/MobileClientAdvanceClient'

export const metadata = {
  title: 'Client Advance | Civil Tracker',
  description: 'Record advance payments received from clients.',
}

export default async function MobileClientAdvancePage({ searchParams }: { searchParams: Promise<{ siteId?: string }> }) {
  const user = await requireUser()
  if (!user.companyId) redirect('/mobile/home')

  const { siteId } = await searchParams

  const sites = await prisma.site.findMany({
    where: {
      companyId: user.companyId,
      deletedAt: null,
      status: 'ACTIVE',
    },
    select: { id: true, name: true, location: true },
    orderBy: { name: 'asc' },
  })

  return <MobileClientAdvanceClient sites={sites} defaultSiteId={siteId} />
}
