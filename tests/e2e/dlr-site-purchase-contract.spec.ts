/**
 * DLR / Site Purchase Order Link Contract Suite
 *
 * Static contract guard for the PurchaseOrder <-> Site relation added to
 * support DLR site purchase orders. Verifies the Prisma schema and the
 * corresponding migration SQL agree, and that the migration is non-destructive.
 *
 * Runs entirely against source files on disk — no database/server required.
 */

import { test, expect } from '@playwright/test'
import * as fs from 'fs'
import * as path from 'path'

const SCHEMA_PATH = path.join(__dirname, '..', '..', 'prisma', 'schema.prisma')
const MIGRATION_PATH = path.join(
  __dirname,
  '..',
  '..',
  'prisma',
  'migrations',
  '20260825090000_add_purchase_order_site_link',
  'migration.sql'
)

const DESTRUCTIVE_KEYWORDS = [
  /\bDROP\s+TABLE\b/i,
  /\bDROP\s+COLUMN\b/i,
  /\bDELETE\s+FROM\b/i,
  /\bTRUNCATE\b/i,
  /\bUPDATE\s+"?\w+"?\s+SET\b/i,
  /\bSET\s+NOT\s+NULL\b/i,
]

test.describe('DLR site purchase order contract', () => {
  const schema = fs.readFileSync(SCHEMA_PATH, 'utf-8')
  const migration = fs.readFileSync(MIGRATION_PATH, 'utf-8')

  test('PurchaseOrder model declares a nullable site relation and index', () => {
    const modelMatch = schema.match(/model PurchaseOrder\s*{([\s\S]*?)\n}/)
    expect(modelMatch, 'PurchaseOrder model should exist in schema.prisma').not.toBeNull()
    const body = modelMatch![1]

    expect(body).toMatch(/siteId\s+String\?/)
    expect(body).toMatch(/site\s+Site\?\s*@relation\(fields:\s*\[siteId\],\s*references:\s*\[id\],\s*onDelete:\s*SetNull\)/)
    expect(body).toMatch(/@@index\(\[siteId\]\)/)
  })

  test('Site model declares the reverse purchaseOrders relation', () => {
    const modelMatch = schema.match(/model Site\s*{([\s\S]*?)\n}/)
    expect(modelMatch, 'Site model should exist in schema.prisma').not.toBeNull()
    const body = modelMatch![1]

    expect(body).toMatch(/purchaseOrders\s+PurchaseOrder\[\]/)
  })

  test('migration adds the siteId column idempotently', () => {
    expect(migration).toMatch(/ALTER TABLE "PurchaseOrder" ADD COLUMN IF NOT EXISTS "siteId" TEXT;/)
  })

  test('migration adds the site foreign key with ON DELETE SET NULL', () => {
    expect(migration).toContain('ON DELETE SET NULL')
    expect(migration).toMatch(/FOREIGN KEY \("siteId"\) REFERENCES "Site"\("id"\)/)
  })

  test('migration creates the siteId index idempotently', () => {
    expect(migration).toMatch(/CREATE INDEX IF NOT EXISTS "PurchaseOrder_siteId_idx" ON "PurchaseOrder"\("siteId"\);/)
  })

  test('migration contains no destructive SQL', () => {
    for (const pattern of DESTRUCTIVE_KEYWORDS) {
      expect(migration).not.toMatch(pattern)
    }
  })
})

const REPORTS_ACTIONS_PATH = path.join(__dirname, '..', '..', 'src', 'actions', 'reports.ts')
const EXPORT_ACTIONS_PATH = path.join(__dirname, '..', '..', 'src', 'actions', 'export-actions.ts')
const REPORTS_INDEX_PATH = path.join(__dirname, '..', '..', 'src', 'app', '(dashboard)', 'reports', 'page.tsx')
const DAILY_LABOUR_ROUTE_PATH = path.join(
  __dirname,
  '..',
  '..',
  'src',
  'app',
  '(dashboard)',
  'reports',
  'daily-labour',
  'page.tsx'
)

function extractFunctionBody(source: string, fnName: string): string {
  const start = source.indexOf(`export async function ${fnName}`)
  if (start === -1) return ''
  // Walk braces from the first '{' after the signature to find the matching close.
  const braceStart = source.indexOf('{', start)
  if (braceStart === -1) return ''
  let depth = 0
  for (let i = braceStart; i < source.length; i++) {
    if (source[i] === '{') depth++
    if (source[i] === '}') {
      depth--
      if (depth === 0) return source.slice(start, i + 1)
    }
  }
  return ''
}

test.describe('Daily Labour Report (DLR) - getDailyLabourReport contract', () => {
  test('getDailyLabourReport exists, requires reports.view, and rejects users without a companyId', () => {
    const src = fs.readFileSync(REPORTS_ACTIONS_PATH, 'utf-8')
    expect(src).toMatch(/export\s+async\s+function\s+getDailyLabourReport\s*\(/)

    const body = extractFunctionBody(src, 'getDailyLabourReport')
    expect(body, 'getDailyLabourReport function body should be found').not.toBe('')
    expect(body).toMatch(/hasPermission\(user\.role,\s*['"]reports\.view['"]\)/)
    expect(body).toMatch(/if\s*\(\s*!user\.companyId\s*\)\s*throw new Error/)
  })

  test('getDailyLabourReport strictly validates the date filter', () => {
    const src = fs.readFileSync(REPORTS_ACTIONS_PATH, 'utf-8')
    const body = extractFunctionBody(src, 'getDailyLabourReport')
    expect(body).not.toBe('')

    // Must enforce YYYY-MM-DD shape
    expect(body).toMatch(/\\d\{4\}-\\d\{2\}-\\d\{2\}/)
    // Must reject invalid calendar dates (e.g. 2026-02-30), not just parse-and-hope
    expect(body).toMatch(/getUTCFullYear|getFullYear/)
    expect(body).toMatch(/getUTCMonth|getMonth/)
    expect(body).toMatch(/getUTCDate|getDate/)
  })

  test('getDailyLabourReport scopes an explicit siteId to the caller\'s company and rejects unknown/cross-tenant sites generically', () => {
    const src = fs.readFileSync(REPORTS_ACTIONS_PATH, 'utf-8')
    const body = extractFunctionBody(src, 'getDailyLabourReport')
    expect(body).not.toBe('')

    expect(body).toMatch(/prisma\.site\.findFirst\(\{[\s\S]*?deletedAt:\s*null/)
    expect(body).toMatch(/Site not found or access denied/)
  })

  test('getDailyLabourReport queries direct labour attendance, contractor attendance with subcontractor, and DPR for the target date', () => {
    const src = fs.readFileSync(REPORTS_ACTIONS_PATH, 'utf-8')
    const body = extractFunctionBody(src, 'getDailyLabourReport')
    expect(body).not.toBe('')

    expect(body).toMatch(/prisma\.labourAttendance\.findMany/)
    expect(body).toMatch(/prisma\.contractorAttendance\.findMany/)
    expect(body).toMatch(/subcontractor:\s*true/)
    expect(body).toMatch(/prisma\.dailyProgressReport\.findMany/)
  })

  test('getDailyLabourReport exposes overtime/advance totals and full DPR risk context per site', () => {
    const src = fs.readFileSync(REPORTS_ACTIONS_PATH, 'utf-8')
    const body = extractFunctionBody(src, 'getDailyLabourReport')
    expect(body).not.toBe('')

    expect(body).toMatch(/totalOvertimeHours/)
    expect(body).toMatch(/totalDirectAdvance/)
    expect(body).toMatch(/delayReason/)
    expect(body).toMatch(/qualityIssue/)
    expect(body).toMatch(/safetyIssue/)
  })
})

test.describe('Daily Labour Report (DLR) - export action contract', () => {
  test('exportReportAction supports the daily-labour report type with the exact title', () => {
    const src = fs.readFileSync(EXPORT_ACTIONS_PATH, 'utf-8')
    expect(src).toMatch(/case\s+['"]daily-labour['"]\s*:/)
    expect(src).toContain("'Daily Labour Report (DLR)'")
    expect(src).toMatch(/getDailyLabourReport/)
  })

  test('exportReportAction logs a sanitized date/siteId filter set for the daily-labour audit trail', () => {
    const src = fs.readFileSync(EXPORT_ACTIONS_PATH, 'utf-8')
    const caseMatch = src.match(/case\s+['"]daily-labour['"]\s*:[\s\S]*?break/)
    expect(caseMatch, 'daily-labour case block should exist in exportReportAction').not.toBeNull()

    const block = caseMatch![0]
    expect(block).toMatch(/date\s*:/)
    expect(block).toMatch(/siteId\s*:/)
    expect(src).toMatch(/logReportExport\(/)
  })
})

test.describe('Daily Labour Report (DLR) - report surface contract', () => {
  test('/reports/daily-labour route exists, uses async searchParams, and wires ExportButtons', () => {
    expect(
      fs.existsSync(DAILY_LABOUR_ROUTE_PATH),
      'src/app/(dashboard)/reports/daily-labour/page.tsx should exist'
    ).toBe(true)

    const src = fs.readFileSync(DAILY_LABOUR_ROUTE_PATH, 'utf-8')
    expect(src).toMatch(/searchParams:\s*Promise<\{[^}]*date/)
    expect(src).toMatch(/getDailyLabourReport/)
    expect(src).toMatch(/ExportButtons/)
  })

  test('/reports/daily-labour route rejects a missing company context instead of leaking cross-tenant data', () => {
    const src = fs.readFileSync(DAILY_LABOUR_ROUTE_PATH, 'utf-8')
    expect(src).toMatch(/if\s*\(\s*!user\.companyId\s*\)\s*redirect\(/)
    expect(src).not.toMatch(/user\.companyId!/)
  })

  test('/reports/daily-labour route surfaces overtime/advance totals and DPR risk fields', () => {
    const src = fs.readFileSync(DAILY_LABOUR_ROUTE_PATH, 'utf-8')
    expect(src).toMatch(/totalOvertimeHours/)
    expect(src).toMatch(/totalDirectAdvance/)
    expect(src).toMatch(/delayReason/)
    expect(src).toMatch(/qualityIssue/)
    expect(src).toMatch(/safetyIssue/)
  })

  test('/reports dashboard links directly to the Daily Labour Report (DLR)', () => {
    const src = fs.readFileSync(REPORTS_INDEX_PATH, 'utf-8')
    expect(src).toMatch(/href=["']\/reports\/daily-labour["']/)
    expect(src).toContain('Daily Labour Report (DLR)')
  })
})

const PURCHASE_NEW_PATH = path.join(__dirname, '..', '..', 'src', 'app', '(dashboard)', 'purchase', 'new', 'page.tsx')
const PURCHASE_INDEX_PATH = path.join(__dirname, '..', '..', 'src', 'app', '(dashboard)', 'purchase', 'page.tsx')

function extractBlock(source: string, startMarker: string): string {
  const start = source.indexOf(startMarker)
  if (start === -1) return ''
  const braceStart = source.indexOf('{', start)
  if (braceStart === -1) return ''
  let depth = 0
  for (let i = braceStart; i < source.length; i++) {
    if (source[i] === '{') depth++
    if (source[i] === '}') {
      depth--
      if (depth === 0) return source.slice(start, i + 1)
    }
  }
  return ''
}

test.describe('Site-linked Purchase Order - creation contract', () => {
  test('PO creation form includes a required site selector', () => {
    const src = fs.readFileSync(PURCHASE_NEW_PATH, 'utf-8')
    expect(src).toMatch(/<select\s+name="siteId"/)
  })

  test('PO creation server action restricts to SUPER_ADMIN/COMPANY_ADMIN/PROJECT_MANAGER/PURCHASE_MANAGER', () => {
    const src = fs.readFileSync(PURCHASE_NEW_PATH, 'utf-8')
    expect(src).toMatch(/\[\s*['"]SUPER_ADMIN['"]\s*,\s*['"]COMPANY_ADMIN['"]\s*,\s*['"]PROJECT_MANAGER['"]\s*,\s*['"]PURCHASE_MANAGER['"]\s*\]/)

    const block = extractBlock(src, 'async function createPO')
    expect(block, 'createPO server action should exist').not.toBe('')
    expect(block).toMatch(/\.includes\(session\.user\.role\)/)
  })

  test('PO creation server action validates the supplied siteId against the caller\'s company via prisma.site.findFirst', () => {
    const src = fs.readFileSync(PURCHASE_NEW_PATH, 'utf-8')
    const block = extractBlock(src, 'async function createPO')
    expect(block).not.toBe('')
    expect(block).toMatch(/prisma\.site\.findFirst\(\{[\s\S]*?companyId[\s\S]*?deletedAt:\s*null/)
  })

  test('PO creation server action validates the supplied vendorId against the caller\'s company via prisma.vendor.findFirst', () => {
    const src = fs.readFileSync(PURCHASE_NEW_PATH, 'utf-8')
    const block = extractBlock(src, 'async function createPO')
    expect(block).not.toBe('')
    expect(block).toMatch(/prisma\.vendor\.findFirst\(\{[\s\S]*?companyId/)
  })

  test('PO creation server action persists the validated siteId on the PurchaseOrder', () => {
    const src = fs.readFileSync(PURCHASE_NEW_PATH, 'utf-8')
    const block = extractBlock(src, 'async function createPO')
    expect(block).not.toBe('')
    expect(block).toMatch(/prisma\.purchaseOrder\.create\(\{[\s\S]*?siteId/)
  })

  test('PO creation page queries only current-company, non-deleted sites and active vendors', () => {
    const src = fs.readFileSync(PURCHASE_NEW_PATH, 'utf-8')
    expect(src).toMatch(/prisma\.site\.findMany\(\{[\s\S]*?companyId[\s\S]*?deletedAt:\s*null/)
    expect(src).toMatch(/prisma\.vendor\.findMany\(\{[\s\S]*?companyId[\s\S]*?isActive:\s*true/)
  })
})

test.describe('Site-linked Purchase Order - overview contract', () => {
  test('/purchase queries PurchaseOrders tenant-scoped with site and vendor included', () => {
    const src = fs.readFileSync(PURCHASE_INDEX_PATH, 'utf-8')
    expect(src).toMatch(/prisma\.purchaseOrder\.findMany\(\{[\s\S]*?companyId[\s\S]*?include:\s*\{[\s\S]*?site[\s\S]*?vendor/)
  })

  test('/purchase renders PO Number/Site/Vendor/Amount/Status/Created columns for purchase orders', () => {
    const src = fs.readFileSync(PURCHASE_INDEX_PATH, 'utf-8')
    expect(src).toContain('PO Number')
    expect(src).toContain('Site')
    expect(src).toContain('Vendor')
    expect(src).toContain('Amount')
    expect(src).toContain('Status')
    expect(src).toContain('Created')
  })

  test('/purchase renders "Unassigned" for purchase orders without a site', () => {
    const src = fs.readFileSync(PURCHASE_INDEX_PATH, 'utf-8')
    expect(src).toContain('Unassigned')
  })

  test('/purchase sanitizes an optional siteId search param against the caller\'s company before filtering, never leaking cross-tenant sites', () => {
    const src = fs.readFileSync(PURCHASE_INDEX_PATH, 'utf-8')
    expect(src).toMatch(/searchParams:\s*Promise<\{[^}]*siteId/)
    expect(src).toMatch(/prisma\.site\.findFirst\(\{[\s\S]*?companyId[\s\S]*?deletedAt:\s*null/)
  })
})
