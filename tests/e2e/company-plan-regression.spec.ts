/**
 * Company Plan Persistence Regression Suite
 *
 * Regression guard added after Phase 9 production incident:
 * The Phase 9 migration changed Company.plan from String → CompanyPlan enum
 * using a DROP+ADD sequence. Even though ADD COLUMN followed DROP COLUMN, all
 * existing plan values were reset to the DEFAULT ('TRIAL'), wiping 2 production
 * companies' billing state.
 *
 * STRICT RULE (tightened post-incident):
 * ────────────────────────────────────────
 * Any migration file that contains DROP COLUMN on a protected commercial field
 * FAILS by default — regardless of whether ADD COLUMN also appears.
 *
 * The ONLY exception: the migration contains the exact marker comment:
 *   -- APPROVED_COMMERCIAL_STATE_BACKFILL
 *
 * AND the migration also satisfies ALL of:
 *   1. A backup/temp column is created before the drop (ADD COLUMN *_backup or *_new)
 *   2. An explicit UPDATE ... SET ... (data copy / backfill) is present
 *   3. A validation/assertion query or comment is present
 *   4. No blind DEFAULT reset — the backfill must not rely solely on a DEFAULT value
 *
 * Protected commercial fields:
 *   Company.plan
 *   Company.status
 *   Company.modulesJson
 *   Company.userLimit
 *   Company.siteLimit
 *   Company.storageLimitMb
 *
 * Run against preview (not production — requires seeded test data):
 *   npx playwright test tests/e2e/company-plan-regression.spec.ts
 */

import { test, expect } from '@playwright/test'
import * as fs from 'fs'
import * as path from 'path'

// ---------------------------------------------------------------------------
// Protected commercial state fields — never DROP without approved backfill
// ---------------------------------------------------------------------------

const PROTECTED_COLUMNS = [
  '"plan"',
  '"status"',
  '"modulesJson"',
  '"userLimit"',
  '"siteLimit"',
  '"storageLimitMb"',
]

const APPROVAL_MARKER = '-- APPROVED_COMMERCIAL_STATE_BACKFILL'

/**
 * Checks a single migration SQL file for unsafe DROP COLUMN on protected fields.
 * Returns an array of violation strings (empty = safe).
 */
function auditMigrationSql(sql: string, filename: string): string[] {
  const violations: string[] = []
  const upper = sql.toUpperCase()
  const hasApprovalMarker = sql.includes(APPROVAL_MARKER)

  for (const col of PROTECTED_COLUMNS) {
    const colUpper = col.toUpperCase()
    // Look for DROP COLUMN followed (on same line) by the column name
    const dropPattern = new RegExp(`DROP\\s+COLUMN\\s+(?:IF\\s+EXISTS\\s+)?${colUpper.replace(/"/g, '(?:"|)')}`, 'i')
    if (dropPattern.test(upper)) {
      if (!hasApprovalMarker) {
        violations.push(
          `[${filename}] DROP COLUMN on protected field ${col} found WITHOUT approval marker.\n` +
          `  → Add '${APPROVAL_MARKER}' AND a full backfill sequence, or rewrite without dropping.`
        )
        continue
      }

      // Marker is present — verify all backfill requirements are met
      const backfillViolations: string[] = []

      // 1. Must have a temp/backup column (ADD COLUMN *_backup or *_new)
      const hasBackupCol =
        /ADD\s+COLUMN\s+"\w+(?:_new|_backup|_temp)"/i.test(sql) ||
        /ADD\s+COLUMN\s+\w+(?:_new|_backup|_temp)/i.test(sql)
      if (!hasBackupCol) {
        backfillViolations.push('missing temp/backup column before DROP (expected *_new, *_backup, or *_temp)')
      }

      // 2. Must have an explicit UPDATE ... SET ... (data copy)
      if (!/UPDATE\s+/i.test(sql)) {
        backfillViolations.push('missing UPDATE ... SET ... backfill statement')
      }

      // 3. Must have a validation query or comment
      const hasValidation =
        /SELECT\s+COUNT/i.test(sql) ||
        /--\s*validate/i.test(sql) ||
        /--\s*verify/i.test(sql) ||
        /--\s*assert/i.test(sql) ||
        /--\s*check/i.test(sql)
      if (!hasValidation) {
        backfillViolations.push('missing validation query or -- validate/verify/check comment')
      }

      // 4. Backfill must not rely solely on DEFAULT (blind reset)
      // If the only ADD COLUMN for the protected field uses a NOT NULL DEFAULT with no UPDATE,
      // that's a blind reset. We already check UPDATE above, so this is belt-and-suspenders.
      const blindDefaultPattern = new RegExp(
        `ADD\\s+COLUMN\\s+(?:IF\\s+NOT\\s+EXISTS\\s+)?${colUpper.replace(/"/g, '(?:"|)')}.*DEFAULT`,
        'i'
      )
      if (blindDefaultPattern.test(sql) && !/UPDATE\s+/i.test(sql)) {
        backfillViolations.push(`blind DEFAULT reset on ${col} with no UPDATE backfill`)
      }

      if (backfillViolations.length > 0) {
        violations.push(
          `[${filename}] DROP COLUMN on ${col} has approval marker but INCOMPLETE backfill:\n` +
          backfillViolations.map(v => `    - ${v}`).join('\n')
        )
      }
    }
  }

  return violations
}

// ---------------------------------------------------------------------------
// Migration File Safety Guard — scans ALL migration files
// ---------------------------------------------------------------------------

test.describe('Migration File Safety Guard', () => {
  test('No migration drops protected commercial columns without approved backfill', () => {
    const migrationsDir = path.resolve(__dirname, '../../prisma/migrations')

    if (!fs.existsSync(migrationsDir)) {
      // No migrations dir in this environment — skip
      return
    }

    const allViolations: string[] = []

    const migrationFolders = fs.readdirSync(migrationsDir).filter(f =>
      fs.statSync(path.join(migrationsDir, f)).isDirectory()
    )

    for (const folder of migrationFolders) {
      const sqlFile = path.join(migrationsDir, folder, 'migration.sql')
      if (!fs.existsSync(sqlFile)) continue

      const sql = fs.readFileSync(sqlFile, 'utf-8')
      const violations = auditMigrationSql(sql, `${folder}/migration.sql`)
      allViolations.push(...violations)
    }

    if (allViolations.length > 0) {
      throw new Error(
        `\n\nCOMMERCIAL STATE MIGRATION GUARD FAILED\n` +
        `═══════════════════════════════════════\n` +
        `${allViolations.length} violation(s) found in migration files:\n\n` +
        allViolations.join('\n\n') +
        `\n\nSee docs/admin-runbook.md for the approved backfill pattern.\n`
      )
    }
  })

  test('Phase 9 migration specifically: plan DROP is flagged as a known incident', () => {
    // This test exists as a historical record. Phase 9 migration DOES contain a
    // DROP+ADD on plan without the approval marker — it is the incident that
    // created this guard. The test confirms the guard would have caught it.
    const sqlFile = path.resolve(
      __dirname,
      '../../prisma/migrations/20260625160000_phase_9_multitenant/migration.sql'
    )

    if (!fs.existsSync(sqlFile)) return

    const sql = fs.readFileSync(sqlFile, 'utf-8')
    const violations = auditMigrationSql(sql, 'phase_9/migration.sql')

    // This migration SHOULD produce violations (it's the incident migration)
    // We document this rather than skip it so the historical record is clear.
    expect(violations.length).toBeGreaterThan(0)

    // And the violation must mention "plan"
    const mentionsPlan = violations.some(v => v.includes('"plan"'))
    expect(mentionsPlan).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function loginAsSuperAdmin(page: Parameters<typeof test>[1] extends (args: infer A) => unknown ? A extends { page: infer P } ? P : never : never) {
  await page.goto('/login')
  await page.fill('input[name="email"]', 'admin@civiltracker.in')
  await page.fill('input[name="password"]', 'Admin@123456')
  const btn = page.locator('button:has-text("Sign in"), button[type="submit"]').first()
  await btn.click()
  await page.waitForURL(/\/super-admin\/dashboard/, { timeout: 10000 })
}

// ---------------------------------------------------------------------------
// Runtime Plan Persistence Tests (require seeded preview environment)
// ---------------------------------------------------------------------------

test.describe('Company Plan Persistence', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsSuperAdmin(page)
  })

  test('/super-admin/companies loads without error', async ({ page }) => {
    await page.goto('/super-admin/companies')
    const body = await page.locator('body').innerText()
    expect(body).not.toContain('This page could not be found')
    expect(body).not.toContain('Application error')
    expect(await page.evaluate(() => document.readyState)).toBe('complete')
  })

  test('/super-admin/companies/new form includes plan and limit fields', async ({ page }) => {
    await page.goto('/super-admin/companies/new')
    const body = await page.locator('body').innerText()
    expect(body).not.toContain('This page could not be found')
    expect(body).not.toContain('Application error')

    await expect(page.locator('input[name="name"]')).toBeVisible()
    await expect(page.locator('input[name="userLimit"]')).toBeVisible()
    await expect(page.locator('input[name="siteLimit"]')).toBeVisible()

    // Plan selector must be present
    const planField = page.locator('select[name="plan"], input[name="plan"], [data-field="plan"]')
    expect(await planField.count()).toBeGreaterThan(0)
  })

  test('API /api/companies preserves plan field on all returned companies', async ({ page, request }) => {
    const cookies = await page.context().cookies()
    const cookieHeader = cookies.map(c => `${c.name}=${c.value}`).join('; ')

    const res = await request.get('/api/companies', {
      headers: { Cookie: cookieHeader },
    })

    if (res.status() === 200) {
      const body = await res.json()
      const companies: unknown[] = body.companies ?? body
      if (Array.isArray(companies) && companies.length > 0) {
        for (const company of companies) {
          const c = company as Record<string, unknown>
          expect(c).toHaveProperty('plan')
          expect(typeof c.plan).toBe('string')
          expect((c.plan as string).length).toBeGreaterThan(0)
          // Plan must never be empty string — that would indicate a stripped value
          expect(c.plan).not.toBe('')
        }
      }
    }
  })
})
