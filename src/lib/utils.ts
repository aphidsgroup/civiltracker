import { type ClassValue, clsx } from 'clsx'

export function cn(...inputs: ClassValue[]) {
  return clsx(inputs)
}

export function formatCurrency(amount: number | string | null | undefined): string {
  if (amount === null || amount === undefined) return '₹0'
  const num = typeof amount === 'string' ? parseFloat(amount) : amount
  if (isNaN(num)) return '₹0'
  if (num >= 10000000) return `₹${(num / 10000000).toFixed(2)} Cr`
  if (num >= 100000) return `₹${(num / 100000).toFixed(2)} L`
  if (num >= 1000) return `₹${(num / 1000).toFixed(1)}K`
  return `₹${num.toLocaleString('en-IN')}`
}

export function formatDate(date: Date | string | null | undefined): string {
  if (!date) return '-'
  const d = new Date(date)
  return d.toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  })
}

export function formatDateTime(date: Date | string | null | undefined): string {
  if (!date) return '-'
  const d = new Date(date)
  return d.toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
}

export function getInitials(name: string): string {
  return name
    .split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2)
}
