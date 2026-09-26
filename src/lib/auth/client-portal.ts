import { CompanyStatus, Role } from '@prisma/client'

import { requireUser } from '@/lib/auth/require-user'
import { prisma } from '@/lib/prisma'

const activeClientSiteWhere = (clientUserId: string) => ({
  clientUserId,
  deletedAt: null,
  company: {
    deletedAt: null,
    status: { notIn: [CompanyStatus.SUSPENDED, CompanyStatus.CANCELLED] },
  },
})

/**
 * Returns only sites explicitly assigned to the authenticated client.
 * Client portal access is an allow-list: email and tenant-wide fallback matching
 * are intentionally forbidden because they can expose other clients' projects.
 */
export async function getClientPortalSites() {
  const user = await requireUser()
  if (user.role !== Role.CLIENT) {
    throw new Error('FORBIDDEN: Client portal access required')
  }

  return prisma.site.findMany({
    where: activeClientSiteWhere(user.id),
    orderBy: { createdAt: 'desc' },
  })
}

/** Returns one explicitly assigned active site, or null when not assigned. */
export async function getClientPortalSite(siteId: string) {
  const user = await requireUser()
  if (user.role !== Role.CLIENT) {
    throw new Error('FORBIDDEN: Client portal access required')
  }

  return prisma.site.findFirst({
    where: { id: siteId, ...activeClientSiteWhere(user.id) },
    include: {
      company: true,
      photos: {
        where: { approvedForClient: true },
        orderBy: { createdAt: 'desc' },
        take: 6,
        include: { task: true },
      },
    },
  })
}
