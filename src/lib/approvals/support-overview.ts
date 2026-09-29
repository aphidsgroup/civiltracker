import prisma from '@/lib/prisma'
import { VALID_APPROVAL_BINDING_SELECT, filterValidApprovals, validApprovalWhere } from '@/lib/approvals/valid-reads'
import type { SessionUser } from '@/types'

const SUPPORT_QUEUE_LIMIT = 50

/**
 * Platform-wide approval overview for the super-admin support page.
 *
 * `user` must be the live `requireUser` principal, never a JWT claim; anything but
 * SUPER_ADMIN is refused before the first query. Only valid approvals are listed or
 * counted — a soft-deleted, malformed, deleted-site, orphaned or cross-tenant row is
 * dropped by the same rules every approval read applies.
 */
export async function getSupportApprovalOverview(user: SessionUser) {
  if (user.role !== 'SUPER_ADMIN') {
    throw new Error('Forbidden: Super admin access required')
  }

  const [pendingRows, approvedRows, totalCompanies] = await Promise.all([
    prisma.approval.findMany({
      where: validApprovalWhere({ currentStatus: 'PENDING' }),
      select: VALID_APPROVAL_BINDING_SELECT,
      orderBy: { createdAt: 'desc' },
    }),
    prisma.approval.findMany({
      where: validApprovalWhere({ currentStatus: 'APPROVED' }),
      select: VALID_APPROVAL_BINDING_SELECT,
    }),
    prisma.company.count(),
  ])

  const [validPending, validApproved] = await Promise.all([
    filterValidApprovals(pendingRows),
    filterValidApprovals(approvedRows),
  ])

  // The display query is keyed to ids that already passed validation, so it cannot
  // admit a row the counts rejected.
  const listedIds = validPending.slice(0, SUPPORT_QUEUE_LIMIT).map((approval) => approval.id)
  const pendingApprovals = listedIds.length
    ? await prisma.approval.findMany({
        where: validApprovalWhere({ id: { in: listedIds }, currentStatus: 'PENDING' }),
        include: {
          company: { select: { name: true } },
          requestedBy: { select: { name: true, email: true } },
        },
        orderBy: { createdAt: 'desc' },
      })
    : []

  return {
    pendingApprovals,
    totalPending: validPending.length,
    totalApproved: validApproved.length,
    totalCompanies,
  }
}
