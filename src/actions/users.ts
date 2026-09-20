'use server'

import { prisma } from '@/lib/prisma'
import { requirePermission } from '@/lib/auth/require-permission'
import { requireUser } from '@/lib/auth/require-user'
import { Role } from '@prisma/client'
import bcrypt from 'bcryptjs'
import { logActivity } from '@/lib/audit'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'

import { canAssignRole, canManageMemberWithRole, isInvitableEmployeeRole } from '@/lib/permissions'
import { inviteEmployeeSchema, updateEmployeeSchema } from '@/lib/validation/users'

const BCRYPT_ROUNDS = 12

/**
 * Collapse a Zod failure into a single user-facing sentence. Every branch of the
 * invitation flow throws a plain Error so the form boundary renders one message.
 */
function validationMessage(error: { issues: { message: string }[] }): string {
  return error.issues.map(issue => issue.message).join(' ')
}

function readString(formData: FormData, key: string): string | undefined {
  const value = formData.get(key)
  return typeof value === 'string' ? value : undefined
}

function readStringList(formData: FormData, key: string): string[] {
  return formData.getAll(key).filter((value): value is string => typeof value === 'string')
}

/** The module selector posts a JSON array; anything unparseable is treated as "not supplied". */
function readModuleControls(formData: FormData, key: string): string[] | null {
  const raw = readString(formData, key)
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed.map(String) : null
  } catch {
    return null
  }
}

/**
 * Tenant guard for submitted site ids. A form post is fully attacker-controlled, so
 * site visibility can never be granted for a site the caller company does not own.
 */
async function assertSitesBelongToCompany(siteIds: string[], companyId: string) {
  const unique = [...new Set(siteIds)]
  if (unique.length === 0) return

  const owned = await prisma.site.findMany({
    where: { companyId, id: { in: unique }, deletedAt: null },
    select: { id: true },
  })

  if (owned.length !== unique.length) {
    throw new Error('One or more selected sites do not belong to your company.')
  }
}

/**
 * Create an employee login for the caller's own company.
 *
 * Every invariant lives here rather than in the page, because a server action is a
 * public endpoint: the browser form is only one of its callers.
 */
export async function inviteEmployee(formData: FormData): Promise<void> {
  const actor = await requirePermission('company.manage')
  const companyId = actor.companyId
  if (!companyId) {
    throw new Error('Your account is not linked to a company.')
  }

  const parsed = inviteEmployeeSchema.safeParse({
    name: readString(formData, 'name'),
    email: readString(formData, 'email'),
    phone: readString(formData, 'phone') || undefined,
    password: readString(formData, 'password'),
    role: readString(formData, 'role'),
    siteIds: readStringList(formData, 'siteIds'),
    moduleControls: readModuleControls(formData, 'moduleControls'),
  })
  if (!parsed.success) {
    throw new Error(validationMessage(parsed.error))
  }
  const input = parsed.data

  const company = await prisma.company.findUnique({
    where: { id: companyId },
    include: { _count: { select: { members: { where: { isActive: true } } } } },
  })
  if (!company || company.deletedAt) {
    throw new Error('Company not found.')
  }
  if (company.status === 'SUSPENDED' || company.status === 'CANCELLED') {
    throw new Error('Company is suspended or cancelled. Please contact support.')
  }
  if (company._count.members >= company.userLimit) {
    throw new Error('User limit reached for your plan. Upgrade the plan to add more logins.')
  }

  // The schema already rules out SUPER_ADMIN and the external portal roles; this
  // additionally stops an admin from minting a peer or a superior.
  if (!canAssignRole(actor.role, input.role as Role)) {
    throw new Error('You cannot grant a role equal to or above your own role.')
  }

  const existing = await prisma.user.findUnique({ where: { email: input.email } })
  if (existing) {
    throw new Error('A user with this email address already exists.')
  }

  await assertSitesBelongToCompany(input.siteIds, companyId)

  const passwordHash = await bcrypt.hash(input.password, BCRYPT_ROUNDS)

  await prisma.$transaction(async tx => {
    const user = await tx.user.create({
      data: {
        name: input.name,
        email: input.email,
        phone: input.phone ?? null,
        passwordHash,
        role: input.role as Role,
      },
    })

    await tx.companyMember.create({
      data: {
        userId: user.id,
        companyId,
        role: input.role as Role,
        siteIds: input.siteIds,
        moduleControls: input.moduleControls ?? undefined,
        isActive: true,
      },
    })

    // Written with the transaction client so a failed audit rolls the invite back
    // instead of leaving an unlogged account behind.
    await tx.auditLog.create({
      data: {
        companyId,
        userId: actor.id,
        action: 'CREATE',
        module: 'USER',
        recordId: user.id,
        after: {
          name: input.name,
          email: input.email,
          role: input.role,
          siteIds: input.siteIds,
          _description: `${actor.name ?? actor.email} invited "${input.name}" as ${input.role.replace(/_/g, ' ')}`,
        },
      },
    })
  })

  revalidatePath('/settings/users')
  revalidatePath('/employees')
  redirect('/employees')
}

/**
 * Update an existing member's role, status and access scope.
 *
 * Guards both directions of the hierarchy: the caller may neither touch someone who
 * already outranks them, nor hand out a role at or above their own.
 */
export async function updateEmployee(formData: FormData): Promise<void> {
  const actor = await requirePermission('company.manage')
  const companyId = actor.companyId
  if (!companyId) {
    throw new Error('Your account is not linked to a company.')
  }

  const parsed = updateEmployeeSchema.safeParse({
    memberId: readString(formData, 'memberId'),
    role: readString(formData, 'role'),
    isActive: readString(formData, 'isActive') === 'true',
    siteIds: readStringList(formData, 'siteIds'),
    moduleControls: readModuleControls(formData, 'moduleControls'),
  })
  if (!parsed.success) {
    throw new Error(validationMessage(parsed.error))
  }
  const input = parsed.data
  if (!isInvitableEmployeeRole(input.role)) {
    throw new Error('Employee roles cannot be changed to an external portal role.')
  }

  const company = await prisma.company.findUnique({ where: { id: companyId } })
  if (!company || company.deletedAt) {
    throw new Error('Company not found.')
  }
  if (company.status === 'SUSPENDED' || company.status === 'CANCELLED') {
    throw new Error('Company is suspended or cancelled. Please contact support.')
  }

  const member = await prisma.companyMember.findUnique({
    where: { id: input.memberId },
    include: { user: { select: { id: true, name: true, email: true } } },
  })
  if (!member || member.companyId !== companyId) {
    throw new Error('Team member not found in your company.')
  }

  if (member.userId === actor.id) {
    throw new Error('You cannot change your own role or access from this screen.')
  }
  if (!canManageMemberWithRole(actor.role, member.role)) {
    throw new Error('You do not have permission to manage a member at or above your own role.')
  }
  if (!canAssignRole(actor.role, input.role as Role)) {
    throw new Error('You cannot grant a role equal to or above your own role.')
  }

  await assertSitesBelongToCompany(input.siteIds, companyId)

  await prisma.$transaction(async tx => {
    await tx.companyMember.update({
      where: { id: member.id, companyId },
      data: {
        role: input.role as Role,
        isActive: input.isActive,
        siteIds: input.siteIds,
        ...(input.moduleControls != null && { moduleControls: input.moduleControls }),
      },
    })

    await tx.auditLog.create({
      data: {
        companyId,
        userId: actor.id,
        action: 'UPDATE',
        module: 'USER',
        recordId: member.userId,
        before: { role: member.role, isActive: member.isActive, siteIds: member.siteIds },
        after: {
          role: input.role,
          isActive: input.isActive,
          siteIds: input.siteIds,
          _description: `${actor.name ?? actor.email} updated "${member.user.name ?? member.user.email}" to ${input.role.replace(/_/g, ' ')}`,
        },
      },
    })
  })

  revalidatePath('/settings/users')
  redirect('/settings/users')
}

/**
 * Remove a member's access while retaining the User and all operational history.
 * This is a privileged access-revocation flow, so confirmation, hierarchy, tenant scope,
 * company state, and auditability are enforced at the server boundary.
 */
export async function removeEmployeeFromCompany(formData: FormData): Promise<void> {
  const actor = await requirePermission('company.manage')
  const companyId = actor.companyId
  if (!companyId) {
    throw new Error('Your account is not linked to a company.')
  }

  const company = await prisma.company.findUnique({ where: { id: companyId } })
  if (!company || company.deletedAt) {
    throw new Error('Company not found.')
  }
  if (company.status === 'SUSPENDED' || company.status === 'CANCELLED') {
    throw new Error('Company is suspended or cancelled. Please contact support.')
  }

  const memberId = readString(formData, 'memberId')
  if (!memberId) {
    throw new Error('Team member is required.')
  }
  const member = await prisma.companyMember.findUnique({
    where: { id: memberId },
    include: { user: { select: { id: true, name: true, email: true } } },
  })
  if (!member || member.companyId !== companyId) {
    throw new Error('Team member not found in your company.')
  }
  if (member.userId === actor.id) {
    throw new Error('You cannot remove your own access from this screen.')
  }
  if (!canManageMemberWithRole(actor.role, member.role)) {
    throw new Error('You do not have permission to remove a member at or above your own role.')
  }

  const confirmation = readString(formData, 'dangerConfirmText')?.trim()
  const expected = (member.user.name ?? member.user.email).trim()
  if (confirmation !== expected) {
    throw new Error('Remove confirmation text did not match the team member name/email.')
  }

  await prisma.$transaction(async tx => {
    await tx.companyMember.update({
      where: { id: member.id, companyId },
      data: { isActive: false },
    })
    await tx.auditLog.create({
      data: {
        companyId,
        userId: actor.id,
        action: 'UPDATE',
        module: 'USER',
        recordId: member.userId,
        before: { isActive: member.isActive, role: member.role, name: member.user.name, email: member.user.email },
        after: {
          isActive: false,
          role: member.role,
          name: member.user.name,
          email: member.user.email,
          _description: `${actor.name ?? actor.email} removed "${member.user.name ?? member.user.email}" from the company login roster`,
        },
      },
    })
  })

  revalidatePath('/settings/users')
  redirect('/settings/users')
}

/**
 * Reset a user's password.
 * - SUPER_ADMIN can reset any user's password.
 * - COMPANY_ADMIN can reset passwords for users within their own company.
 */
export async function resetUserPassword(userId: string, newPassword: string) {
  const actor = await requireUser()
  const actorRole = actor.role
  const actorCompanyId = actor.companyId

  if (actorRole !== Role.SUPER_ADMIN && actorRole !== Role.COMPANY_ADMIN) {
    throw new Error('Only Super Admins and Company Admins can reset passwords.')
  }

  if (newPassword.length < 6) {
    throw new Error('Password must be at least 6 characters long.')
  }

  // If the actor is a COMPANY_ADMIN, make sure the target user is in their company
  if (actorRole === 'COMPANY_ADMIN') {
    if (!actorCompanyId) throw new Error('No company associated with this admin.')
    const membership = await prisma.companyMember.findFirst({
      where: { userId, companyId: actorCompanyId, isActive: true },
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

  const target = await prisma.user.findUnique({ where: { id: userId }, select: { name: true, email: true } })
  await logActivity({
    userId: actor.id,
    companyId: actorCompanyId,
    action: 'UPDATE',
    module: 'PASSWORD_RESET',
    recordId: userId,
    description: `${actor.name ?? actor.email ?? 'Admin'} reset password for "${target?.name ?? target?.email ?? userId}"`,
  })

  revalidatePath('/settings/users')
  return { success: true }
}
