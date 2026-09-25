'use server'

import { requireSuperAdmin } from '@/lib/auth/require-super-admin'
import { prisma } from '@/lib/prisma'
import bcrypt from 'bcryptjs'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { logActivity } from '@/lib/audit'

// Every action resolves the live, active SUPER_ADMIN from the database before touching
// data and acts as that principal; the session's role and name claims are never trusted.

export async function changeSuperAdminPassword(password: string) {
  const actor = await requireSuperAdmin()

  if (!password || password.length < 6) {
    throw new Error('Password must be at least 6 characters long')
  }

  const hashedPassword = await bcrypt.hash(password, 10)

  await prisma.user.update({
    where: { id: actor.id },
    data: { passwordHash: hashedPassword }
  })

  await logActivity({
    userId: actor.id,
    companyId: null,
    action: 'UPDATE',
    module: 'PASSWORD_RESET',
    recordId: actor.id,
    description: `${actor.name ?? actor.email} changed their own Super Admin password`,
  })

  revalidatePath('/super-admin/settings')

  return { success: true }
}

export async function deleteCompany(companyId: string) {
  const actor = await requireSuperAdmin()

  const company = await prisma.company.findUnique({
    where: { id: companyId },
    select: {
      id: true,
      name: true,
      email: true,
      status: true,
      plan: true,
      _count: { select: { sites: true, members: true } },
    },
  })

  if (!company) throw new Error('Company not found')

  await prisma.company.delete({ where: { id: company.id } })

  await logActivity({
    userId: actor.id,
    companyId: null,
    action: 'DELETE',
    module: 'COMPANY',
    recordId: company.id,
    description: `${actor.name ?? actor.email} permanently deleted company "${company.name}"`,
    before: {
      name: company.name,
      email: company.email,
      status: company.status,
      plan: company.plan,
      siteCount: company._count.sites,
      memberCount: company._count.members,
    },
  })

  revalidatePath('/super-admin/companies')
  redirect('/super-admin/companies')
}

export async function deleteUser(userId: string) {
  const actor = await requireSuperAdmin()

  // Cannot delete self
  if (actor.id === userId) throw new Error('You cannot delete your own account.')

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      isActive: true,
      companyMembers: {
        select: {
          companyId: true,
          company: { select: { name: true } },
        },
        take: 1,
      },
    },
  })

  if (!user) throw new Error('User not found')

  await prisma.user.delete({ where: { id: user.id } })

  await logActivity({
    userId: actor.id,
    companyId: user.companyMembers[0]?.companyId ?? null,
    action: 'DELETE',
    module: 'USER',
    recordId: user.id,
    description: `${actor.name ?? actor.email} permanently deleted user "${user.name ?? user.email}"`,
    before: {
      name: user.name,
      email: user.email,
      role: user.role,
      isActive: user.isActive,
      companyName: user.companyMembers[0]?.company?.name ?? null,
    },
  })

  revalidatePath('/super-admin/users')
  redirect('/super-admin/users')
}
