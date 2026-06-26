'use server'

import { prisma } from '@/lib/prisma'
import { requireRole } from '@/lib/auth/require-role'
import { Role, CompanyStatus, CompanyPlan } from '@prisma/client'
import { slugify } from '@/lib/utils'
import bcrypt from 'bcryptjs'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function createCompany(data: any) {
  const user = await requireRole([Role.SUPER_ADMIN])
  
  const slug = slugify(data.name)
  const existing = await prisma.company.findUnique({ where: { slug } })
  if (existing) {
    throw new Error('Company name already in use.')
  }

  // Create company
  const company = await prisma.company.create({
    data: {
      name: data.name,
      slug,
      email: data.email,
      phone: data.phone,
      gst: data.gst,
      address: data.address,
      city: data.city,
      state: data.state,
      pincode: data.pincode,
      status: data.status || CompanyStatus.ACTIVE,
      plan: data.plan || CompanyPlan.TRIAL,
      userLimit: Number(data.userLimit) || 5,
      siteLimit: Number(data.siteLimit) || 1,
      storageLimitMb: Number(data.storageLimitMb) || 100,
      modulesJson: data.modulesJson || ['SITES', 'APPROVALS', 'REPORTS', 'EXPENSES', 'BILLS', 'LABOUR', 'MATERIALS', 'DPR', 'TASKS', 'DOCUMENTS'],
      createdById: user.id,
    }
  })

  // Create Owner User if requested
  if (data.ownerEmail && data.ownerName && data.ownerPassword) {
    const hash = await bcrypt.hash(data.ownerPassword, 10)
    const newOwner = await prisma.user.create({
      data: {
        name: data.ownerName,
        email: data.ownerEmail,
        passwordHash: hash,
        role: Role.COMPANY_ADMIN,
      }
    })
    
    // Assign member
    await prisma.companyMember.create({
      data: {
        userId: newOwner.id,
        companyId: company.id,
        role: Role.COMPANY_ADMIN,
      }
    })
  }

  return { success: true, companyId: company.id }
}

export async function updateCompanyStatus(companyId: string, status: CompanyStatus) {
  await requireRole([Role.SUPER_ADMIN])
  await prisma.company.update({
    where: { id: companyId },
    data: { status }
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
  await requireRole([Role.SUPER_ADMIN])
  await prisma.company.update({
    where: { id: companyId },
    data: {
      plan,
      ...(userLimit !== undefined && { userLimit }),
      ...(siteLimit !== undefined && { siteLimit }),
      ...(storageLimitMb !== undefined && { storageLimitMb }),
    }
  })
  return { success: true }
}
