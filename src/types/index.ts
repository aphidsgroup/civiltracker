import type { Role, ApprovalStatus, ApprovalEntityType, ApprovalPriority, SiteStatus, ExpenseCategory, PaymentMode } from '@prisma/client'

export type { Role, ApprovalStatus, ApprovalEntityType, ApprovalPriority, SiteStatus, ExpenseCategory, PaymentMode }

export interface SessionUser {
  id: string
  email: string
  name: string
  role: Role
  companyId?: string
  companySlug?: string
  companyName?: string
}

export interface DashboardKpi {
  label: string
  value: string
  sub: string
  trend: 'up' | 'down' | 'flat' | 'warn'
}

export interface SiteSummary {
  id: string
  name: string
  location: string
  clientName: string | null
  budget: number
  spent: number
  progress: number
  status: SiteStatus
  labourToday: number
  billsDue: number
}

export interface CloudinaryUploadResult {
  public_id: string
  secure_url: string
  format: string
  bytes: number
  width?: number
  height?: number
  folder: string
}

export interface ApiResponse<T = unknown> {
  success: boolean
  data?: T
  error?: string
  message?: string
}
