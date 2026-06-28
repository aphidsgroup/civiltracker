'use server'

import { prisma } from '@/lib/prisma'
import { requirePermission } from '@/lib/auth/require-permission'
import { auth } from '@/lib/auth'
import { Role } from '@prisma/client'
import bcrypt from 'bcryptjs'
import { logActivity } from '@/lib/audit'
import { revalidatePath } from 'next/cache'

const EMPLOYEE_LIMIT = 15
const CLIENT_LIMIT = 15

const CLIENT_ROLES: Role[] = ['CLIENT' as Role]
const EMPLOYEE_ROLES: Role[] = [
  'COMPANY_ADMIN',
  'PROJECT_MANAGER',
  'SITE_ENGINEER',
  'SUPERVISOR',
  'ACCOUNTANT',
  'PURCHASE_MANAGER',
] as Role[]

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function createUser(data: any) {
  const currentUser = await requirePermission('company.manage')
  const companyId = currentUser.companyId

  if (!companyId) {
    throw new Error('User does not belong to a company')
  }

  const company = await prisma.company.findUnique({
    where: { id: companyId },
  })

  if (!company) throw new Error('Company not found')

  if (company.status === 'SUSPENDED' || company.status === 'CANCELLED') {
    throw new Error('Company is suspended or cancelled. Please contact support.')
  }

  if (data.role === Role.SUPER_ADMIN && currentUser.role !== Role.SUPER_ADMIN) {
    throw new Error('You cannot create a SUPER_ADMIN user.')
  }

  // Enforce strict role-based limits
  const isClientRole = CLIENT_ROLES.includes(data.role as Role)
  const isEmployeeRole = EMPLOYEE_ROLES.includes(data.role as Role)

  if (isClientRole) {
    const clientCount = await prisma.companyMember.count({
      where: { companyId, role: { in: CLIENT_ROLES } },
    })
    if (clientCount >= CLIENT_LIMIT) {
      throw new Error(`Client account limit reached (Max ${CLIENT_LIMIT}). Cannot create more client logins.`)
    }
  } else if (isEmployeeRole) {
    const employeeCount = await prisma.companyMember.count({
      where: { companyId, role: { in: EMPLOYEE_ROLES } },
    })
    if (employeeCount >= EMPLOYEE_LIMIT) {
      throw new Error(`Employee account limit reached (Max ${EMPLOYEE_LIMIT}). Cannot create more employee logins.`)
    }
  }

  const existing = await prisma.user.findUnique({ where: { email: data.email } })
  if (existing) {
    throw new Error('A user with this email already exists.')
  }

  const hash = await bcrypt.hash(data.password, 10)

  const newUser = await prisma.user.create({
    data: {
      email: data.email,
      name: data.name,
      phone: data.phone,
      passwordHash: hash,
      role: data.role,
    },
  })

  await prisma.companyMember.create({
    data: {
      userId: newUser.id,
      companyId: companyId,
      role: data.role,
      siteIds: data.siteIds || [],
    },
  })

  await logActivity({
    userId: currentUser.id,
    companyId,
    action: 'CREATE',
    module: 'USER',
    recordId: newUser.id,
    description: `${currentUser.name ?? currentUser.email} created new user "${data.name}" (${data.role.replace(/_/g, ' ')}) in the company`,
    after: { name: data.name, role: data.role, email: data.email },
  })

  revalidatePath('/settings/users')
  return { success: true, userId: newUser.id }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function updateUser(userId: string, data: any) {
  const currentUser = await requirePermission('company.manage')
  const companyId = currentUser.companyId

  if (!companyId) {
    throw new Error('User does not belong to a company')
  }

  const member = await prisma.companyMember.findUnique({
    where: { userId_companyId: { userId, companyId } },
  })

  if (!member) {
    throw new Error('User not found in this company.')
  }

  if (data.role === Role.SUPER_ADMIN && currentUser.role !== Role.SUPER_ADMIN) {
    throw new Error('You cannot assign the SUPER_ADMIN role.')
  }

  await prisma.user.update({
    where: { id: userId },
    data: {
      name: data.name,
      phone: data.phone,
      role: data.role,
      isActive: data.isActive,
    },
  })

  await prisma.companyMember.update({
    where: { id: member.id },
    data: {
      role: data.role,
      isActive: data.isActive,
    },
  })

  await logActivity({
    userId: currentUser.id,
    companyId,
    action: 'UPDATE',
    module: 'USER',
    recordId: userId,
    description: `${currentUser.name ?? currentUser.email} updated user settings (role: ${data.role}, active: ${data.isActive})`,
    after: { role: data.role, isActive: data.isActive },
  })

  revalidatePath('/settings/users')
  return { success: true }
}

/**
 * Reset a user's password.
 * - SUPER_ADMIN can reset any user's password.
 * - COMPANY_ADMIN can reset passwords for users within their own company.
 */
export async function resetUserPassword(userId: string, newPassword: string) {
  const session = await auth()
  if (!session?.user) throw new Error('Unauthorized')

  const actorRole = session.user.role as Role
  const actorCompanyId = session.user.companyId

  if (actorRole !== 'SUPER_ADMIN' && actorRole !== 'COMPANY_ADMIN') {
    throw new Error('Only Super Admins and Company Admins can reset passwords.')
  }

  if (newPassword.length < 6) {
    throw new Error('Password must be at least 6 characters long.')
  }

  // If the actor is a COMPANY_ADMIN, make sure the target user is in their company
  if (actorRole === 'COMPANY_ADMIN') {
    if (!actorCompanyId) throw new Error('No company associated with this admin.')
    const membership = await prisma.companyMember.findFirst({
      where: { userId, companyId: actorCompanyId },
    })
    if (!membership) {
      throw new Error('You can only reset passwords for users within your own company.')
    }
    // Company admin cannot reset another company admin's password
    if (membership.role === 'COMPANY_ADMIN') {
      throw new Error('Company Admins cannot reset another Company Admin password. Contact Super Admin.')
    }
  }

  const hash = await bcrypt.hash(newPassword, 10)
  await prisma.user.update({
    where: { id: userId },
    data: { passwordHash: hash },
  })

  const actor = await prisma.user.findUnique({ where: { id: session.user.id! }, select: { name: true, email: true } })
  const target = await prisma.user.findUnique({ where: { id: userId }, select: { name: true, email: true, members: { select: { companyId: true }, take: 1 } } })
  await logActivity({
    userId: session.user.id!,
    companyId: target?.members?.[0]?.companyId ?? session.user.companyId,
    action: 'UPDATE',
    module: 'PASSWORD_RESET',
    recordId: userId,
    description: `${actor?.name ?? actor?.email ?? 'Admin'} reset password for "${target?.name ?? target?.email ?? userId}"`,
  })

  revalidatePath('/settings/users')
  return { success: true }
}
