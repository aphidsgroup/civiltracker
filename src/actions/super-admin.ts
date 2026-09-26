'use server'

import { requireSuperAdmin } from '@/lib/auth/require-super-admin'
import { prisma } from '@/lib/prisma'
import bcrypt from 'bcryptjs'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { logActivity } from '@/lib/audit'
import type { Prisma } from '@prisma/client'

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

// Permanent deletes are confirmed here, not only in the page: the caller passes the text
// the operator typed, and it must equal the target's current canonical value (company
// name, user email) read inside the same transaction that deletes. The actor is re-read
// as a live SUPER_ADMIN in that transaction, and the audit record is written on the same
// client, so a delete without its audit trail rolls back.

function readConfirmation(confirmation: unknown): string {
  return typeof confirmation === 'string' ? confirmation.trim() : ''
}

async function requireLiveSuperAdminInTx(tx: Prisma.TransactionClient, actorId: string) {
  const live = await tx.user.findFirst({
    where: { id: actorId, role: 'SUPER_ADMIN', isActive: true },
    select: { id: true },
  })
  if (!live) throw new Error('FORBIDDEN: Super admin access required')
}

export async function deleteCompany(companyId: string, confirmation: string) {
  const actor = await requireSuperAdmin()
  const typed = readConfirmation(confirmation)
  if (!typed) throw new Error('Delete confirmation text did not match the company name.')

  await prisma.$transaction(async (tx) => {
    await requireLiveSuperAdminInTx(tx, actor.id)

    const company = await tx.company.findUnique({
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
    if (typed !== company.name.trim()) {
      throw new Error('Delete confirmation text did not match the company name.')
    }

    await tx.company.delete({ where: { id: company.id } })

    await tx.auditLog.create({
      data: {
        userId: actor.id,
        companyId: null,
        action: 'DELETE',
        module: 'COMPANY',
        recordId: company.id,
        before: {
          name: company.name,
          email: company.email,
          status: company.status,
          plan: company.plan,
          siteCount: company._count.sites,
          memberCount: company._count.members,
        },
        after: { _description: `${actor.name ?? actor.email} permanently deleted company "${company.name}"` },
      },
    })
  })

  revalidatePath('/super-admin/companies')
  redirect('/super-admin/companies')
}

export async function deleteUser(userId: string, confirmation: string) {
  const actor = await requireSuperAdmin()

  // Cannot delete self
  if (actor.id === userId) throw new Error('You cannot delete your own account.')

  const typed = readConfirmation(confirmation)
  if (!typed) throw new Error('Delete confirmation text did not match the user email.')

  await prisma.$transaction(async (tx) => {
    await requireLiveSuperAdminInTx(tx, actor.id)

    const user = await tx.user.findUnique({
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
    if (typed !== user.email.trim()) {
      throw new Error('Delete confirmation text did not match the user email.')
    }

    await tx.user.delete({ where: { id: user.id } })

    await tx.auditLog.create({
      data: {
        userId: actor.id,
        companyId: user.companyMembers[0]?.companyId ?? null,
        action: 'DELETE',
        module: 'USER',
        recordId: user.id,
        before: {
          name: user.name,
          email: user.email,
          role: user.role,
          isActive: user.isActive,
          companyName: user.companyMembers[0]?.company?.name ?? null,
        },
        after: { _description: `${actor.name ?? actor.email} permanently deleted user "${user.name ?? user.email}"` },
      },
    })
  })

  revalidatePath('/super-admin/users')
  redirect('/super-admin/users')
}
