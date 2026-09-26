'use server'

import { prisma } from '@/lib/prisma'
import { requireUser } from '@/lib/auth/require-user'
import { hasPermission } from '@/lib/permissions'
import { assignedSiteWhere, readsAssignedSitesOnly, resolveTenantPageAccess } from '@/lib/pages/tenant-page-access'
import { hasCostRisk, isSiteOverBudget, calculateProfitForecast } from '@/lib/reports/calculations'
import { sumValidOpenApprovalAmountsBySite } from '@/lib/approvals/valid-reads'
import { Prisma } from '@prisma/client'

/**
 * The founder financial overview. It is a finance report, so `reports.view` alone does
 * not open it: the live role needs `reports.finance` and the company the REPORTS module.
 * SUPER_ADMIN carries no company and is refused before any read, never querying with an
 * undefined company. Salary rows, receivables and profitability are each read and
 * returned only under their own permission, and come back null otherwise.
 */
export async function getFounderDashboardStats() {
  const gate = await resolveTenantPageAccess({ grants: [{ permission: 'reports.finance', module: 'REPORTS' }] })
  if (gate.status === 'denied') throw new Error('FORBIDDEN: Financial reports are not available')
  const { companyId, can, moduleEnabled } = gate.access

  const show = {
    salary: can('salary.view') && moduleEnabled('LABOUR'),
    vendorPayable: can('reports.vendorPayable'),
    clientReceivable: can('reports.clientReceivable'),
    profitability: can('reports.profitability'),
  }

  // Explicit branches keep Prisma's include typing: salary rows are only
  // queried under salary.view.
  const siteWhere = { companyId, deletedAt: null }
  const expensesInclude = { where: { deletedAt: null } }
  const salarySites = show.salary
    ? await prisma.site.findMany({
        where: siteWhere,
        include: {
          expenses: expensesInclude,
          labour: { include: { salaryItems: true } },
        }
      })
    : null
  const sites = salarySites ?? await prisma.site.findMany({
    where: siteWhere,
    include: {
      expenses: expensesInclude,
    }
  })
  // Salary rows keyed by site; empty unless the salary branch loaded them.
  const labourBySite = new Map((salarySites ?? []).map(s => [s.id, s.labour]))

  // Pending approval money only counts rows an approver could action: never a
  // malformed, orphaned, cross-bound or deleted-site approval.
  const pendingBySite = await sumValidOpenApprovalAmountsBySite(sites)

  // Basic totals
  let totalBudget = new Prisma.Decimal(0)
  let totalActualSpend = new Prisma.Decimal(0)
  let pendingApprovalAmount = new Prisma.Decimal(0)
  let approvedExpenseAmount = new Prisma.Decimal(0)
  let paidAmount = new Prisma.Decimal(0)
  let vendorPayable = new Prisma.Decimal(0)
  let clientReceivable = new Prisma.Decimal(0)
  let salaryPayable = new Prisma.Decimal(0)
  let materialCost = new Prisma.Decimal(0)
  let labourCost = new Prisma.Decimal(0)
  let overBudgetSites = 0
  let delayedSitesWithCostRisk = 0

  const activeSites = sites.filter(s => s.status === 'ACTIVE' || s.status === 'ON_HOLD')

  for (const site of sites) {
    totalBudget = totalBudget.add(site.budget || 0)

    let siteSpend = new Prisma.Decimal(0)

    // Calculate Expenses
    for (const exp of site.expenses) {
      if (exp.approvalStatus === 'APPROVED' || exp.approvalStatus === 'PAID') {
        siteSpend = siteSpend.add(exp.amount)
        approvedExpenseAmount = approvedExpenseAmount.add(exp.amount)
        if (exp.approvalStatus === 'PAID') {
          paidAmount = paidAmount.add(exp.amount)
        } else {
          // Vendor payable (approximate based on unpaid expenses)
          vendorPayable = vendorPayable.add(exp.amount)
        }
      }
      
      if (exp.category === 'MATERIAL' && (exp.approvalStatus === 'APPROVED' || exp.approvalStatus === 'PAID')) {
        materialCost = materialCost.add(exp.amount)
      }
    }

    // Calculate Labour — salary rows are only loaded under salary.view.
    const labour = labourBySite.get(site.id) ?? []
    for (const lab of labour) {
      for (const item of lab.salaryItems) {
        if (item.status === 'PAID') {
          siteSpend = siteSpend.add(item.netPayable)
          paidAmount = paidAmount.add(item.netPayable)
          labourCost = labourCost.add(item.netPayable)
        } else if (item.status === 'APPROVED') {
          siteSpend = siteSpend.add(item.netPayable)
          salaryPayable = salaryPayable.add(item.netPayable)
          labourCost = labourCost.add(item.netPayable)
        }
      }
    }

    totalActualSpend = totalActualSpend.add(siteSpend)

    // Calculate Pending Approvals
    pendingApprovalAmount = pendingApprovalAmount.add(pendingBySite.get(site.id) ?? 0)

    if (isSiteOverBudget(siteSpend, site.budget || 0)) {
      overBudgetSites++
    }

    if (hasCostRisk(siteSpend, site.budget || 0, site.progress)) {
      delayedSitesWithCostRisk++
    }
  }

  // Client Receivables — the client ledger is read only for a figure the role may see.
  const clients = show.clientReceivable || show.profitability
    ? await prisma.client.findMany({ where: { companyId } })
    : []
  for (const client of clients) {
    clientReceivable = clientReceivable.add(client.amountDue || 0)
  }

  // Calculate Profit Forecast (Simple Estimate)
  // Contract Value - Total Projected/Actual Cost
  let totalContractValue = new Prisma.Decimal(0)
  for (const client of clients) {
    totalContractValue = totalContractValue.add(client.contractValue || 0)
  }
  const profitForecast = calculateProfitForecast(totalContractValue, totalActualSpend)

  return {
    totalActiveSites: activeSites.length,
    totalBudget: totalBudget.toNumber(),
    totalActualSpend: totalActualSpend.toNumber(),
    budgetRemaining: Math.max(0, totalBudget.minus(totalActualSpend).toNumber()),
    pendingApprovalAmount: pendingApprovalAmount.toNumber(),
    approvedExpenseAmount: approvedExpenseAmount.toNumber(),
    paidAmount: paidAmount.toNumber(),
    vendorPayable: show.vendorPayable ? vendorPayable.toNumber() : null,
    clientReceivable: show.clientReceivable ? clientReceivable.toNumber() : null,
    salaryPayable: show.salary ? salaryPayable.toNumber() : null,
    materialCost: materialCost.toNumber(),
    labourCost: show.salary ? labourCost.toNumber() : null,
    profitForecastAmount: show.profitability ? profitForecast.amount.toNumber() : null,
    profitMarginPercent: show.profitability ? profitForecast.marginPercent : null,
    overBudgetSites,
    delayedSitesWithCostRisk
  }
}

/**
 * A site filter from a caller: absent, or one site id string. Anything else — an operator
 * object, an array, a number — is refused rather than handed to Prisma.
 */
export async function parseReportSiteId(filters: unknown): Promise<string | undefined> {
  const raw = filters && typeof filters === 'object' ? (filters as { siteId?: unknown }).siteId : undefined
  if (raw === undefined || raw === null || raw === '') return undefined
  if (typeof raw !== 'string') throw new Error('FORBIDDEN: Invalid site filter')
  return raw
}

/**
 * Live gate for a company-wide ledger report (vendor payable, client receivable). The
 * ledger has no site to scope by, so a field role — which reads only its assigned sites —
 * is refused outright even though its role carries the report permission.
 */
async function requireTenantLedgerReport(permission: 'reports.vendorPayable' | 'reports.clientReceivable') {
  const gate = await resolveTenantPageAccess({ grants: [{ permission, module: 'REPORTS' }] })
  if (gate.status === 'denied') throw new Error('FORBIDDEN: Report is not available')
  if (!gate.access.can('reports.view')) throw new Error('FORBIDDEN: Report is not available')
  if (readsAssignedSitesOnly(gate.access.user.role)) throw new Error('FORBIDDEN: Company-wide reports are not available to field roles')
  return gate.access
}

/**
 * Budget and spend per site. A finance report: the live role needs `reports.view` and
 * `reports.finance` and the company the REPORTS module; SUPER_ADMIN and CLIENT are
 * refused before any read. Sites are narrowed at the query to the principal's
 * `assignedSiteWhere`, so a field role sees only its assigned live sites and a site
 * filter outside that scope returns nothing. Salary rows are read only under
 * `salary.view` with LABOUR on.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function getSiteCostReport(filters: any) {
  const siteId = await parseReportSiteId(filters)
  const gate = await resolveTenantPageAccess({ grants: [{ permission: 'reports.finance', module: 'REPORTS' }] })
  if (gate.status === 'denied') throw new Error('FORBIDDEN: Financial reports are not available')
  const access = gate.access
  if (access.user.role === 'CLIENT' || !access.can('reports.view')) throw new Error('FORBIDDEN: Financial reports are not available')

  const showSalary = access.can('salary.view') && access.moduleEnabled('LABOUR')
  const where: Prisma.SiteWhereInput = { ...(await assignedSiteWhere(access)), ...(siteId ? { id: siteId } : {}) }
  const expensesInclude = { where: { deletedAt: null } }

  // Explicit branches keep Prisma's include typing: salary rows are only queried under
  // salary.view.
  const salarySites = showSalary
    ? await prisma.site.findMany({
        where,
        include: { expenses: expensesInclude, labour: { include: { salaryItems: true } } },
      })
    : null
  const sites = salarySites ?? await prisma.site.findMany({
    where,
    include: { expenses: expensesInclude },
  })
  const labourBySite = new Map((salarySites ?? []).map(s => [s.id, s.labour]))

  const pendingBySite = await sumValidOpenApprovalAmountsBySite(sites)

  return sites.map(s => {
    let spent = new Prisma.Decimal(0)
    const pending = pendingBySite.get(s.id) ?? new Prisma.Decimal(0)

    s.expenses.forEach(e => {
      if (['APPROVED', 'PAID'].includes(e.approvalStatus)) spent = spent.add(e.amount)
    })

    // Salary rows are only loaded under salary.view.
    const labour = labourBySite.get(s.id) ?? []
    labour.forEach(l => {
      l.salaryItems.forEach(si => {
        if (['APPROVED', 'PAID'].includes(si.status)) spent = spent.add(si.netPayable)
      })
    })

    return {
      id: s.id,
      name: s.name,
      budget: s.budget.toNumber(),
      actualSpend: spent.toNumber(),
      pendingApproval: pending.toNumber(),
      budgetUsedPercent: s.budget.toNumber() > 0 ? (spent.toNumber() / s.budget.toNumber()) * 100 : 0,
      riskStatus: hasCostRisk(spent, s.budget, s.progress) ? 'HIGH' : isSiteOverBudget(spent, s.budget) ? 'MEDIUM' : 'LOW'
    }
  })
}

// Ensure simple export tracking
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function logReportExport(reportType: string, format: string, filters: any) {
  const user = await requireUser()
  if (user.role !== 'SUPER_ADMIN') {
    if (!hasPermission(user.role, 'reports.export')) throw new Error('Unauthorized')
  }

  await prisma.auditLog.create({
    data: {
      userId: user.id,
      companyId: user.companyId,
      action: `REPORT_EXPORTED_${format}`,
      module: 'REPORTS',
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      after: { reportType, filters } as any
    }
  })

  try {
    await prisma.reportExport.create({
      data: {
        companyId: user.companyId!,
        generatedById: user.id,
        reportType,
        format,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        filtersJson: filters as any
      }
    })
  } catch(e) {
    console.error("Failed to write to report export:", e)
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unused-vars
export async function getVendorPayableReport(filters: any) {
  const { companyId } = await requireTenantLedgerReport('reports.vendorPayable')

  const vendors = await prisma.vendor.findMany({
    where: { companyId },
    include: {
      purchaseOrders: true
    }
  })

  return vendors.map(v => ({
    id: v.id,
    name: v.name,
    totalPurchase: v.totalPurchase.toNumber(),
    amountPayable: v.amountPayable.toNumber()
  }))
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unused-vars
export async function getClientReceivableReport(filters: any) {
  const { companyId } = await requireTenantLedgerReport('reports.clientReceivable')

  const clients = await prisma.client.findMany({
    where: { companyId },
    include: {
      invoices: true
    }
  })

  return clients.map(c => ({
    id: c.id,
    name: c.name,
    contractValue: c.contractValue.toNumber(),
    amountPaid: c.amountPaid.toNumber(),
    amountDue: c.amountDue.toNumber()
  }))
}
