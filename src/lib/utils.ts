import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

/** shadcn/ui class merger — required by all shadcn components */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/** Format a number as Indian currency string (₹1.2L, ₹48.2k, ₹1,200) */
export function formatCurrency(amount: number | string | null | undefined): string {
  if (amount === null || amount === undefined) return '₹0'
  const num = typeof amount === 'string' ? parseFloat(amount) : amount
  if (isNaN(num)) return '₹0'
  if (num >= 10_000_000) return `₹${(num / 10_000_000).toFixed(2)} Cr`
  if (num >= 100_000)    return `₹${(num / 100_000).toFixed(2)} L`
  if (num >= 1_000)      return `₹${(num / 1_000).toFixed(1)}K`
  return `₹${num.toLocaleString('en-IN')}`
}

/** Format a date as "12 Jun 2026" */
export function formatDate(date: Date | string | null | undefined): string {
  if (!date) return '-'
  return new Date(date).toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  })
}

/** Format a date+time as "12 Jun 2026, 03:45 PM" */
export function formatDateTime(date: Date | string | null | undefined): string {
  if (!date) return '-'
  return new Date(date).toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

/** Convert "Madras Crafters Ltd" → "madras-crafters-ltd" */
export function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
}

/** Get up-to-2-char uppercase initials from a name */
export function getInitials(name: string): string {
  return name
    .split(' ')
    .map(n => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2)
}
