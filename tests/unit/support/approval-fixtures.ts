import { inMemoryDelegate } from './prisma-where'
import type { Row } from './prisma-where'

/**
 * A tenant with one row of every approval defect the read surfaces must drop, next to
 * the valid rows they must keep. Every approval row embeds its `site` (or null) so the
 * in-memory delegates can resolve the `site` relation both in `where` and in the rows
 * they hand back, the way a Prisma `select: { site: ... }` would.
 */
export const SITES: Row[] = [
  { id: 'site_1', companyId: 'company_1', name: 'Tower A', deletedAt: null },
  { id: 'site_2', companyId: 'company_1', name: 'Tower B', deletedAt: null },
  { id: 'site_dead', companyId: 'company_1', name: 'Demolished', deletedAt: new Date('2026-01-01') },
  { id: 'site_other', companyId: 'company_2', name: 'Other tenant site', deletedAt: null },
]

const siteById = new Map(SITES.map((site) => [site.id as string, site]))

function approval(overrides: Row): Row {
  const siteId = (overrides.siteId ?? null) as string | null
  return {
    companyId: 'company_1',
    siteId,
    currentStatus: 'PENDING',
    priority: 'NORMAL',
    deletedAt: null,
    amount: null,
    createdAt: new Date('2026-09-01'),
    approvedAt: null,
    company: { name: 'Acme Builders' },
    requestedBy: { name: 'Requester', email: 'requester@acme.test' },
    ...overrides,
    site: siteId ? (siteById.get(siteId) ?? null) : null,
  }
}

/** Rows every approval read must keep. */
export const VALID_APPROVALS: Row[] = [
  approval({ id: 'a_valid', title: 'Valid expense', siteId: 'site_1', entityType: 'EXPENSE', entityId: 'expense_1', amount: 100 }),
  approval({ id: 'a_po', title: 'Company PO', siteId: null, entityType: 'PURCHASE_ORDER', entityId: 'po_1', amount: 50 }),
  approval({
    id: 'a_review',
    title: 'Tower B review',
    siteId: 'site_2',
    entityType: 'EXPENSE',
    entityId: 'expense_site2',
    currentStatus: 'PENDING_REVIEW',
    amount: 30,
  }),
  approval({
    id: 'a_other_valid',
    title: 'Other tenant valid',
    companyId: 'company_2',
    company: { name: 'Other Co' },
    siteId: 'site_other',
    entityType: 'EXPENSE',
    entityId: 'expense_c2',
    amount: 70,
  }),
  approval({
    id: 'a_approved',
    title: 'Approved expense',
    siteId: 'site_1',
    entityType: 'EXPENSE',
    entityId: 'expense_1',
    currentStatus: 'APPROVED',
    amount: 900,
  }),
]

/** Rows no approval read may list, count or sum. Titles start with "BAD". */
export const INVALID_APPROVALS: Row[] = [
  approval({ id: 'a_deleted', title: 'BAD deleted', siteId: 'site_1', entityType: 'EXPENSE', entityId: 'expense_1', amount: 1000, deletedAt: new Date('2026-02-01') }),
  approval({ id: 'a_dead_site', title: 'BAD dead site', siteId: 'site_dead', entityType: 'EXPENSE', entityId: 'expense_dead', amount: 2000 }),
  approval({ id: 'a_malformed', title: 'BAD malformed', siteId: null, entityType: 'EXPENSE', entityId: 'expense_1', amount: 3000 }),
  approval({ id: 'a_orphan', title: 'BAD orphan', siteId: 'site_1', entityType: 'EXPENSE', entityId: 'expense_missing', amount: 4000 }),
  approval({ id: 'a_cross_site', title: 'BAD cross site', siteId: 'site_1', entityType: 'EXPENSE', entityId: 'expense_site2', amount: 5000 }),
  // Approval and linked entity both claim company_1, but the site they are pinned to
  // belongs to company_2: the entity check alone would admit it.
  approval({ id: 'a_cross_bound', title: 'BAD cross bound', siteId: 'site_other', entityType: 'EXPENSE', entityId: 'expense_forged', amount: 6000 }),
  approval({ id: 'a_variation', title: 'BAD unmapped type', siteId: 'site_1', entityType: 'VARIATION', entityId: 'variation_1', amount: 7000 }),
]

export const APPROVALS: Row[] = [...VALID_APPROVALS, ...INVALID_APPROVALS]

export const EXPENSES: Row[] = [
  { id: 'expense_1', companyId: 'company_1', siteId: 'site_1', deletedAt: null },
  { id: 'expense_site2', companyId: 'company_1', siteId: 'site_2', deletedAt: null },
  { id: 'expense_dead', companyId: 'company_1', siteId: 'site_dead', deletedAt: null },
  { id: 'expense_forged', companyId: 'company_1', siteId: 'site_other', deletedAt: null },
  { id: 'expense_c2', companyId: 'company_2', siteId: 'site_other', deletedAt: null },
]

export const PURCHASE_ORDERS: Row[] = [{ id: 'po_1', companyId: 'company_1' }]

function siteRelation(row: Row, key: string) {
  if (key !== 'site') return undefined
  return (row.site as Row | null | undefined) ?? null
}

export function approvalStore() {
  return inMemoryDelegate(APPROVALS, siteRelation)
}

export function entityStores() {
  return {
    expense: inMemoryDelegate(EXPENSES),
    purchaseOrder: inMemoryDelegate(PURCHASE_ORDERS),
    dailyProgressReport: inMemoryDelegate([]),
    material: inMemoryDelegate([]),
    salaryRun: inMemoryDelegate([]),
    document: inMemoryDelegate([]),
  }
}

export function idsOf(rows: Array<{ id: unknown }>) {
  return rows.map((row) => row.id).sort()
}
