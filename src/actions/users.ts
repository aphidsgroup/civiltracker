'use server'

import { prisma } from '@/lib/prisma'
import { requirePermission } from '@/lib/auth/require-permission'
import { Role } from '@prisma/client'
import bcrypt from 'bcryptjs'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function createUser(data: any) {
  const currentUser = await requirePermission('company.manage')
  const companyId = currentUser.companyId

  if (!companyId) {
    throw new Error('User does not belong to a company')
  }

  // Check limits
  const company = await prisma.company.findUnique({
    where: { id: companyId },
    include: { _count: { select: { members: true } } }
  })

  if (!company) throw new Error('Company not found')

  if (company.status === 'SUSPENDED' || company.status === 'CANCELLED') {
    throw new Error('Company is suspended or cancelled')
  }

  if (company._count.members >= company.userLimit) {
    throw new Error(`User limit reached (${company.userLimit}). Please upgrade your plan.`)
  }

  if (data.role === Role.SUPER_ADMIN && currentUser.role !== Role.SUPER_ADMIN) {
    throw new Error('You cannot create a SUPER_ADMIN user.')
  }

  const existing = await prisma.user.findUnique({ where: { email: data.email } })
  if (existing) {
    throw new Error('Email already exists.')
  }

  const hash = await bcrypt.hash(data.password, 10)
  
  const newUser = await prisma.user.create({
    data: {
      email: data.email,
      name: data.name,
      phone: data.phone,
      passwordHash: hash,
      role: data.role,
    }
  })

  await prisma.companyMember.create({
    data: {
      userId: newUser.id,
      companyId: companyId,
      role: data.role,
      siteIds: data.siteIds || [],
    }
  })

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
    where: { userId_companyId: { userId, companyId } }
  })

  if (!member) {
    throw new Error('User not found in this company.')
  }

  if (data.role === Role.SUPER_ADMIN && currentUser.role !== Role.SUPER_ADMIN) {
    throw new Error('You cannot assign SUPER_ADMIN role.')
  }

  await prisma.user.update({
    where: { id: userId },
    data: {
      name: data.name,
      phone: data.phone,
      role: data.role,
      isActive: data.isActive,
    }
  })

  await prisma.companyMember.update({
    where: { id: member.id },
    data: {
      role: data.role,
      siteIds: data.siteIds || [],
      isActive: data.isActive,
    }
  })

  return { success: true }
}
