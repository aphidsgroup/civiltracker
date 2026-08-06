import { requireUser } from './require-user'
import { prisma } from '@/lib/prisma'
import { Role } from '@prisma/client'

const MODULE_ALIASES: Record<string, string[]> = {
  APPROVALS: ['approvals'],
  BILLS: ['bills'],
  BOQ: ['boq'],
  CLIENTS: ['clients', 'client_portal'],
  DOCUMENTS: ['documents'],
  DPR: ['dpr', 'daily_progress'],
  EXPENSES: ['expenses'],
  LABOUR: ['labour', 'salary', 'attendance'],
  MATERIALS: ['materials', 'vendors', 'purchase', 'subcontractors'],
  REPORTS: ['reports'],
  SITES: ['sites'],
  TASKS: ['tasks'],
}

function isModuleEnabled(modulesJson: unknown, moduleName: string): boolean {
  const canonical = moduleName.trim().toUpperCase()
  const aliases = new Set([canonical, ...(MODULE_ALIASES[canonical] ?? [])].map((value) => value.toLowerCase()))

  if (Array.isArray(modulesJson)) {
    const enabled = new Set(
      modulesJson
        .filter((value): value is string => typeof value === 'string')
        .map((value) => value.trim().toLowerCase()),
    )
    return [...aliases].some((alias) => enabled.has(alias))
  }

  if (modulesJson && typeof modulesJson === 'object') {
    const entries = Object.entries(modulesJson as Record<string, unknown>)
    return entries.some(([key, value]) => aliases.has(key.trim().toLowerCase()) && value === true)
  }

  return true
}

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

  if (!isModuleEnabled(company.modulesJson, moduleName)) {
    throw new Error(`Module ${moduleName} is not enabled for this company`)
  }
}
