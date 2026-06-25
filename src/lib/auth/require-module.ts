import { requireUser } from './require-user'
import { prisma } from '@/lib/prisma'
import { Role } from '@prisma/client'

export async function requireModuleEnabled(moduleName: string): Promise<void> {
  const user = await requireUser()
  if (user.role === Role.SUPER_ADMIN) return

  if (!user.companyId) {
    throw new Error('User does not belong to a company')
  }

  const company = await prisma.company.findUnique({
    where: { id: user.companyId },
    select: { modulesJson: true, status: true }
  })

  if (!company) {
    throw new Error('Company not found')
  }

  if (company.status === 'SUSPENDED' || company.status === 'CANCELLED') {
    throw new Error('Company account is suspended or cancelled')
  }

  if (company.modulesJson) {
    const modules = company.modulesJson as string[]
    if (Array.isArray(modules) && !modules.includes(moduleName)) {
      throw new Error(`Module ${moduleName} is not enabled for this company`)
    }
  }
}
