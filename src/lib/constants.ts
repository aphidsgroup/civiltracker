export const EXPENSE_CATEGORIES = [
  { value: 'MATERIAL', label: 'Material' },
  { value: 'LABOUR', label: 'Labour' },
  { value: 'SUBCONTRACTOR', label: 'Subcontractor' },
  { value: 'TRANSPORT', label: 'Transport' },
  { value: 'TOOLS_EQUIPMENT', label: 'Tools & Equipment' },
  { value: 'SITE_PETTY_CASH', label: 'Site Petty Cash' },
  { value: 'DIESEL', label: 'Diesel' },
  { value: 'OFFICE_ADMIN', label: 'Office/Admin' },
  { value: 'CLIENT_VARIATION', label: 'Client Variation' },
  { value: 'MISCELLANEOUS', label: 'Miscellaneous' },
]

export const PAYMENT_MODES = [
  { value: 'CASH', label: 'Cash' },
  { value: 'UPI', label: 'UPI' },
  { value: 'BANK_TRANSFER', label: 'Bank Transfer' },
  { value: 'CREDIT', label: 'Credit' },
  { value: 'CHEQUE', label: 'Cheque' },
]

export const LABOUR_TRADES = [
  { value: 'MASON', label: 'Mason' },
  { value: 'HELPER', label: 'Helper' },
  { value: 'CARPENTER', label: 'Carpenter' },
  { value: 'BAR_BENDER', label: 'Bar Bender' },
  { value: 'ELECTRICIAN', label: 'Electrician' },
  { value: 'PLUMBER', label: 'Plumber' },
  { value: 'PAINTER', label: 'Painter' },
  { value: 'TILE_WORKER', label: 'Tile Worker' },
  { value: 'WELDER', label: 'Welder' },
  { value: 'SUPERVISOR', label: 'Supervisor' },
]

export const TASK_STAGES = [
  { value: 'FOUNDATION', label: 'Foundation' },
  { value: 'RCC', label: 'RCC' },
  { value: 'MASONRY', label: 'Masonry' },
  { value: 'MEP', label: 'MEP' },
  { value: 'PLASTERING', label: 'Plastering' },
  { value: 'FLOORING', label: 'Flooring' },
  { value: 'PAINTING', label: 'Painting' },
  { value: 'INTERIOR', label: 'Interior' },
  { value: 'HANDOVER', label: 'Handover' },
]

export const ROLES = [
  { value: 'COMPANY_ADMIN', label: 'Company Admin' },
  { value: 'PROJECT_MANAGER', label: 'Project Manager' },
  { value: 'SITE_ENGINEER', label: 'Site Engineer' },
  { value: 'SUPERVISOR', label: 'Supervisor' },
  { value: 'ACCOUNTANT', label: 'Accountant' },
  { value: 'PURCHASE_MANAGER', label: 'Purchase Manager' },
  { value: 'CLIENT', label: 'Client' },
]

export const APPROVAL_STATUS_COLORS: Record<string, string> = {
  DRAFT: 'mut',
  PENDING: 'amber',
  APPROVED: 'green',
  REJECTED: 'red',
  PAID: 'blue',
}

export const SITE_STATUS_COLORS: Record<string, string> = {
  PLANNING: 'mut',
  ACTIVE: 'green',
  ON_HOLD: 'amber',
  COMPLETED: 'blue',
  CANCELLED: 'red',
}
