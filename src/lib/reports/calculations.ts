import { toDecimal } from './money'
import { Prisma } from '@prisma/client'

export function calculateBudgetUsedPercent(spent: Prisma.Decimal | number, budget: Prisma.Decimal | number): number {
  const s = toDecimal(spent).toNumber()
  const b = toDecimal(budget).toNumber()
  if (b === 0) return 0
  return (s / b) * 100
}

export function isSiteOverBudget(spent: Prisma.Decimal | number, budget: Prisma.Decimal | number): boolean {
  return calculateBudgetUsedPercent(spent, budget) > 100
}

export function hasCostRisk(spent: Prisma.Decimal | number, budget: Prisma.Decimal | number, progress: number): boolean {
  const used = calculateBudgetUsedPercent(spent, budget)
  // High spend with low completion
  if (used > 85 && progress < 80) return true
  // Over budget
  if (used > 100) return true
  return false
}

export function calculateProfitForecast(contractValue: Prisma.Decimal | number, projectedCost: Prisma.Decimal | number): {
  amount: Prisma.Decimal
  marginPercent: number
  isEstimate: boolean
} {
  const cv = toDecimal(contractValue)
  const cost = toDecimal(projectedCost)
  
  if (cv.isZero()) {
    return {
      amount: new Prisma.Decimal(0),
      marginPercent: 0,
      isEstimate: true
    }
  }

  const profit = cv.minus(cost)
  const margin = (profit.toNumber() / cv.toNumber()) * 100

  return {
    amount: profit,
    marginPercent: margin,
    isEstimate: true // Always true per requirements since it's missing exact tracking in current schema
  }
}
