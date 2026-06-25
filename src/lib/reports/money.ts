import { Decimal } from '@prisma/client/runtime/library'

export function toDecimal(value: number | string | Decimal | null | undefined): Decimal {
  if (value === null || value === undefined) return new Decimal(0)
  try {
    return new Decimal(value)
  } catch {
    return new Decimal(0)
  }
}

export function formatINR(value: number | string | Decimal | null | undefined): string {
  const d = toDecimal(value)
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(d.toNumber())
}

export function formatCompactINR(value: number | string | Decimal | null | undefined): string {
  const num = toDecimal(value).toNumber()
  if (num >= 10000000) return `₹${(num / 10000000).toFixed(2)} Cr`
  if (num >= 100000) return `₹${(num / 100000).toFixed(2)} L`
  if (num >= 1000) return `₹${(num / 1000).toFixed(1)} K`
  return `₹${num.toFixed(0)}`
}
