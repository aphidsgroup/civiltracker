'use server'

import { prisma } from '@/lib/prisma'
import { requireSuperAdmin } from '@/lib/auth/require-super-admin'
import { Role, CompanyStatus, CompanyPlan } from '@prisma/client'
import type { Prisma } from '@prisma/client'
import { slugify } from '@/lib/utils'
import bcrypt from 'bcryptjs'

// Every action resolves the live SUPER_ADMIN, then re-reads it inside the one transaction
// that performs every write and records the audit event on the same client: an owner or
// audit failure rolls the whole change back. Audit records never carry a password or hash.

type CreateCompanyInput = {
  name: string
  email?: string | null
  phone?: string | null
  gst?: string | null
  address?: string | null
  city?: string | null
  state?: string | null
  pincode?: string | null
  status?: CompanyStatus | string
  plan?: CompanyPlan | string
  userLimit?: number | string | null
  siteLimit?: number | string | null
  storageLimitMb?: number | string | null
  modulesJson?: string[]
  ownerEmail?: string | null
  ownerName?: string | null
  ownerPassword?: string | null
}

async function requireLiveSuperAdminInTx(tx: Prisma.TransactionClient, actorId: string) {
  const live = await tx.user.findFirst({
    where: { id: actorId, role: 'SUPER_ADMIN', isActive: true },
    select: { id: true },
  })
  if (!live) throw new Error('FORBIDDEN: Super admin access required')
}

function readStatus(value: unknown): CompanyStatus {
  if (typeof value === 'string' && (Object.values(CompanyStatus) as string[]).includes(value)) return value as CompanyStatus
  throw new Error('Invalid company status.')
}

function readPlan(value: unknown): CompanyPlan {
  if (typeof value === 'string' && (Object.values(CompanyPlan) as string[]).includes(value)) return value as CompanyPlan
  throw new Error('Invalid company plan.')
}

function readLimit(value: unknown): number | undefined {
  if (value === undefined) return undefined
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 0) throw new Error('Invalid company limit.')
  return value
}

function trimmed(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

/**
 * The optional owner block: all three fields or none. A half-filled block is refused
 * rather than silently creating a company with no owner.
 */
function readOwner(data: CreateCompanyInput) {
  const name = trimmed(data.ownerName)
  const email = trimmed(data.ownerEmail)
  const password = typeof data.ownerPassword === 'string' ? data.ownerPassword : ''
  if (!name && !email && !password) return null
  if (!name || !email || !password) {
    throw new Error('Owner name, email and password are all required to create an owner login.')
  }
  if (password.length < 6) throw new Error('Owner password must be at least 6 characters long.')
  return { name, email, password }
}

export async function createCompany(data: CreateCompanyInput) {
  const actor = await requireSuperAdmin()

  const name = trimmed(data.name)
  if (!name) throw new Error('Company name is required.')
  const slug = slugify(name)
  if (!slug) throw new Error('Company name is required.')
  const status = data.status ? readStatus(data.status) : CompanyStatus.ACTIVE
  const plan = data.plan ? readPlan(data.plan) : CompanyPlan.TRIAL
  const owner = readOwner(data)
  const passwordHash = owner ? await bcrypt.hash(owner.password, 10) : null

  const companyId = await prisma.$transaction(async tx => {
    await requireLiveSuperAdminInTx(tx, actor.id)

    const existing = await tx.company.findUnique({ where: { slug } })
    if (existing) {
      throw new Error('Company name already in use.')
    }
    if (owner && await tx.user.findUnique({ where: { email: owner.email } })) {
      throw new Error('A user with the owner email address already exists.')
    }

    const company = await tx.company.create({
      data: {
        name,
        slug,
        email: data.email,
        phone: data.phone,
        gst: data.gst,
        address: data.address,
        city: data.city,
        state: data.state,
        pincode: data.pincode,
        status,
        plan,
        userLimit: Number(data.userLimit) || 15,
        siteLimit: Number(data.siteLimit) || 15,
        storageLimitMb: Number(data.storageLimitMb) || 1024,
        modulesJson: data.modulesJson || ['SITES', 'APPROVALS', 'REPORTS', 'EXPENSES', 'BILLS', 'LABOUR', 'MATERIALS', 'DPR', 'TASKS', 'DOCUMENTS'],
        createdById: actor.id,
      }
    })

    await tx.auditLog.create({
      data: {
        userId: actor.id,
        companyId: company.id,
        action: 'CREATE',
        module: 'COMPANY',
        recordId: company.id,
        after: {
          name: company.name,
          slug: company.slug,
          status: company.status,
          plan: company.plan,
          userLimit: company.userLimit,
          siteLimit: company.siteLimit,
          storageLimitMb: company.storageLimitMb,
          ownerEmail: owner?.email ?? null,
          _description: `${actor.name ?? actor.email} created company "${company.name}"`,
        },
      },
    })

    if (owner && passwordHash) {
      const newOwner = await tx.user.create({
        data: {
          name: owner.name,
          email: owner.email,
          passwordHash,
          role: Role.COMPANY_ADMIN,
        }
      })

      await tx.companyMember.create({
        data: {
          userId: newOwner.id,
          companyId: company.id,
          role: Role.COMPANY_ADMIN,
        }
      })

      await tx.auditLog.create({
        data: {
          userId: actor.id,
          companyId: company.id,
          action: 'CREATE',
          module: 'USER',
          recordId: newOwner.id,
          after: {
            name: owner.name,
            email: owner.email,
            role: Role.COMPANY_ADMIN,
            _description: `${actor.name ?? actor.email} created owner login "${owner.email}" for company "${company.name}"`,
          },
        },
      })
    }

    return company.id
  })

  return { success: true, companyId }
}

export async function updateCompanyStatus(companyId: string, status: CompanyStatus) {
  const actor = await requireSuperAdmin()
  const nextStatus = readStatus(status)

  await prisma.$transaction(async tx => {
    await requireLiveSuperAdminInTx(tx, actor.id)

    const company = await tx.company.findUnique({
      where: { id: companyId },
      select: { id: true, name: true, status: true, deletedAt: true },
    })
    if (!company || company.deletedAt) throw new Error('Company not found')

    // Snapshot the pre-update state before writing so the audit before is immutable.
    const before = Object.freeze({ status: company.status })

    await tx.company.update({
      where: { id: company.id },
      data: { status: nextStatus }
    })

    await tx.auditLog.create({
      data: {
        userId: actor.id,
        companyId: company.id,
        action: 'UPDATE',
        module: 'COMPANY',
        recordId: company.id,
        before: { ...before },
        after: {
          status: nextStatus,
          _description: `${actor.name ?? actor.email} changed company "${company.name}" status from ${before.status} to ${nextStatus}`,
        },
      },
    })
  })

  return { success: true }
}

/**
 * COMMERCIAL STATE — MIGRATION SAFETY NOTICE
 *
 * The fields updated here (plan, userLimit, siteLimit, storageLimitMb, modulesJson)
 * are commercial billing state. They must be preserved across ALL database migrations.
 *
 * NEVER write a Prisma migration that DROP COLUMNs any of these fields without
 * an explicit backfill step. Doing so will silently reset customer billing data.
 *
 * Incident: Phhase 9 multi-tenant migration. See AGENTS.md for details.
 */
export async function updateCompanyPlan(
  companyId: string,
  plan: CompanyPlan,
  userLimit?: number,
  siteLimit?: number,
  storageLimitMb?: number
) {
  const actor = await requireSuperAdmin()
  const nextPlan = readPlan(plan)
  const limits = {
    userLimit: readLimit(userLimit),
    siteLimit: readLimit(siteLimit),
    storageLimitMb: readLimit(storageLimitMb),
  }

  await prisma.$transaction(async tx => {
    await requireLiveSuperAdminInTx(tx, actor.id)

    const company = await tx.company.findUnique({
      where: { id: companyId },
      select: { id: true, name: true, plan: true, userLimit: true, siteLimit: true, storageLimitMb: true, deletedAt: true },
    })
    if (!company || company.deletedAt) throw new Error('Company not found')

    // Snapshot the pre-update state before writing so the audit before is immutable.
    const before = Object.freeze({
      plan: company.plan,
      userLimit: company.userLimit,
      siteLimit: company.siteLimit,
      storageLimitMb: company.storageLimitMb,
    })

    const updated = await tx.company.update({
      where: { id: company.id },
      data: {
        plan: nextPlan,
        ...(limits.userLimit !== undefined && { userLimit: limits.userLimit }),
        ...(limits.siteLimit !== undefined && { siteLimit: limits.siteLimit }),
        ...(limits.storageLimitMb !== undefined && { storageLimitMb: limits.storageLimitMb }),
      }
    })

    await tx.auditLog.create({
      data: {
        userId: actor.id,
        companyId: company.id,
        action: 'UPDATE',
        module: 'COMPANY',
        recordId: company.id,
        before: { ...before },
        after: {
          plan: updated.plan,
          userLimit: updated.userLimit,
          siteLimit: updated.siteLimit,
          storageLimitMb: updated.storageLimitMb,
          _description: `${actor.name ?? actor.email} changed company "${company.name}" plan to ${updated.plan}`,
        },
      },
    })
  })

  return { success: true }
}
