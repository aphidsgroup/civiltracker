import { Role } from '@prisma/client'

import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { SessionUser } from '@/types'

/**
 * Resolve the current principal at the server boundary.
 *
 * JWT claims are only a session locator. Role, company membership, module controls,
 * and account activity are revalidated from the database so access revocation takes
 * effect on the next privileged request instead of waiting for token expiry.
 */
export async function requireUser(): Promise<SessionUser> {
  const session = await auth()
  if (!session?.user?.id) {
    throw new Error('UNAUTHORIZED: Authentication required')
  }

  const principal = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: {
      id: true,
      email: true,
      name: true,
      role: true,
      isActive: true,
    },
  })

  if (!principal || !principal.isActive) {
    throw new Error('UNAUTHORIZED: Account is inactive')
  }

  if (principal.role === Role.SUPER_ADMIN) {
    return {
      id: principal.id,
      email: principal.email,
      name: principal.name,
      role: Role.SUPER_ADMIN,
    }
  }

  const companyId = session.user.companyId?.trim()
  if (!companyId) {
    throw new Error('UNAUTHORIZED: Company context required')
  }

  const membership = await prisma.companyMember.findFirst({
    where: {
      userId: principal.id,
      companyId,
      isActive: true,
    },
    select: {
      companyId: true,
      role: true,
      moduleControls: true,
      company: {
        select: {
          slug: true,
          name: true,
          status: true,
          deletedAt: true,
        },
      },
    },
  })

  if (!membership) {
    throw new Error('UNAUTHORIZED: Active company membership required')
  }
  if (
    membership.company.deletedAt ||
    membership.company.status === 'SUSPENDED' ||
    membership.company.status === 'CANCELLED'
  ) {
    throw new Error('UNAUTHORIZED: Company access is inactive')
  }

  return {
    id: principal.id,
    email: principal.email,
    name: principal.name,
    role: membership.role,
    companyId: membership.companyId,
    companySlug: membership.company.slug,
    companyName: membership.company.name,
    moduleControls: membership.moduleControls,
  }
}
