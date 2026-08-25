'use server'

import { prisma } from '@/lib/prisma'
import { requireUser } from '@/lib/auth/require-user'
import { hasPermission } from '@/lib/permissions'
import { hasCostRisk, isSiteOverBudget, calculateProfitForecast } from '@/lib/reports/calculations'
import { Prisma } from '@prisma/client'

export async function getFounderDashboardStats() {
  const user = await requireUser()
  const companyId = user.companyId!

  if (user.role !== 'SUPER_ADMIN') {
    if (!hasPermission(user.role, 'reports.view')) throw new Error('Unauthorized')
  }

  const sites = await prisma.site.findMany({
    where: { companyId, deletedAt: null },
    include: {
      expenses: {
        where: { deletedAt: null }
      },
      labour: {
        include: { salaryItems: true }
      },
      approvals: {
        where: { deletedAt: null }
      }
    }
  })

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

    // Calculate Labour
    for (const lab of site.labour) {
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
    for (const app of site.approvals) {
      if ((app.currentStatus === 'PENDING' || app.currentStatus === 'PENDING_REVIEW' || app.currentStatus === 'SUBMITTED') && app.amount) {
        pendingApprovalAmount = pendingApprovalAmount.add(app.amount)
      }
    }

    if (isSiteOverBudget(siteSpend, site.budget || 0)) {
      overBudgetSites++
    }

    if (hasCostRisk(siteSpend, site.budget || 0, site.progress)) {
      delayedSitesWithCostRisk++
    }
  }

  // Client Receivables
  const clients = await prisma.client.findMany({
    where: { companyId }
  })
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
    vendorPayable: vendorPayable.toNumber(),
    clientReceivable: clientReceivable.toNumber(),
    salaryPayable: salaryPayable.toNumber(),
    materialCost: materialCost.toNumber(),
    labourCost: labourCost.toNumber(),
    profitForecastAmount: profitForecast.amount.toNumber(),
    profitMarginPercent: profitForecast.marginPercent,
    overBudgetSites,
    delayedSitesWithCostRisk
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function getSiteCostReport(filters: any) {
  const user = await requireUser()
  if (!hasPermission(user.role, 'reports.view')) throw new Error('Unauthorized')

  const sites = await prisma.site.findMany({
    where: {
      companyId: user.companyId!,
      deletedAt: null,
      ...(filters.siteId ? { id: filters.siteId } : {})
    },
    include: {
      expenses: { where: { deletedAt: null } },
      labour: { include: { salaryItems: true } },
      approvals: { where: { deletedAt: null } }
    }
  })

  return sites.map(s => {
    let spent = new Prisma.Decimal(0)
    let pending = new Prisma.Decimal(0)

    s.expenses.forEach(e => {
      if (['APPROVED', 'PAID'].includes(e.approvalStatus)) spent = spent.add(e.amount)
    })

    s.labour.forEach(l => {
      l.salaryItems.forEach(si => {
        if (['APPROVED', 'PAID'].includes(si.status)) spent = spent.add(si.netPayable)
      })
    })

    s.approvals.forEach(a => {
      if (['PENDING', 'PENDING_REVIEW', 'SUBMITTED'].includes(a.currentStatus) && a.amount) {
        pending = pending.add(a.amount)
      }
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
  const user = await requireUser()
  if (!hasPermission(user.role, 'reports.vendorPayable')) throw new Error('Unauthorized')

  const vendors = await prisma.vendor.findMany({
    where: { companyId: user.companyId! },
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
  const user = await requireUser()
  if (!hasPermission(user.role, 'reports.clientReceivable')) throw new Error('Unauthorized')

  const clients = await prisma.client.findMany({
    where: { companyId: user.companyId! },
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

function estimateDirectWage(status: string, dailyWage: number, overtimeHours: number, overtimeRate: number) {
  if (status === 'ABSENT') return 0
  const base = status === 'HALF_DAY' ? dailyWage / 2 : dailyWage
  const overtimePay = overtimeHours > 0 ? overtimeHours * overtimeRate : 0
  return base + overtimePay
}

export interface DailyLabourReportFilters {
  date?: string
  siteId?: string
}

export async function getDailyLabourReport(filters: DailyLabourReportFilters) {
  const user = await requireUser()
  if (!hasPermission(user.role, 'reports.view')) throw new Error('Unauthorized')
  if (!user.companyId) throw new Error('Unauthorized: No active company context')
  const companyId = user.companyId

  const dateStr = filters.date ?? new Date().toISOString().split('T')[0]
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
    throw new Error('Invalid date: expected YYYY-MM-DD')
  }
  const [year, month, day] = dateStr.split('-').map(Number)
  const targetDate = new Date(Date.UTC(year, month - 1, day))
  if (
    targetDate.getUTCFullYear() !== year ||
    targetDate.getUTCMonth() !== month - 1 ||
    targetDate.getUTCDate() !== day
  ) {
    throw new Error('Invalid date: not a real calendar date')
  }

  let requestedSite: { id: string; name: string } | null = null
  if (filters.siteId) {
    requestedSite = await prisma.site.findFirst({
      where: { id: filters.siteId, companyId, deletedAt: null },
      select: { id: true, name: true }
    })
    if (!requestedSite) throw new Error('Site not found or access denied')
  }

  const sites = await prisma.site.findMany({
    where: {
      companyId,
      deletedAt: null,
      ...(requestedSite ? { id: requestedSite.id } : {})
    },
    select: { id: true, name: true },
    orderBy: { name: 'asc' }
  })

  const siteIds = sites.map(s => s.id)

  const [attendanceRecords, contractorAttendance, dprs] = await Promise.all([
    prisma.labourAttendance.findMany({
      where: { date: targetDate, siteId: { in: siteIds } },
      include: { labour: true }
    }),
    prisma.contractorAttendance.findMany({
      where: { companyId, date: targetDate, siteId: { in: siteIds } },
      include: { subcontractor: true }
    }),
    prisma.dailyProgressReport.findMany({
      where: { companyId, date: targetDate, siteId: { in: siteIds } }
    })
  ])

  // Defensive same-company filter: siteIds are already company-scoped, but the
  // labour record itself is the source of truth for wage figures.
  const companyAttendance = attendanceRecords.filter(a => a.labour.companyId === companyId)

  const siteReports = sites.map(site => {
    const directLabour = companyAttendance
      .filter(a => a.siteId === site.id)
      .map(a => {
        const dailyWage = Number(a.labour.dailyWage)
        const overtimeRate = Number(a.labour.overtimeRate ?? 0)
        const overtimeHours = Number(a.overtimeHours)
        return {
          id: a.labour.id,
          name: a.labour.name,
          trade: a.labour.trade,
          status: a.status,
          dailyWage,
          overtimeHours,
          overtimeRate,
          advance: Number(a.advance),
          wageEstimate: estimateDirectWage(a.status, dailyWage, overtimeHours, overtimeRate)
        }
      })

    const contractors = contractorAttendance
      .filter(c => c.siteId === site.id)
      .map(c => ({
        id: c.id,
        subcontractorName: c.subcontractor.name,
        trade: c.subcontractor.trade,
        headcount: c.labourCount,
        startTime: c.startTime,
        dailyAdvance: Number(c.dailyAdvance),
        notes: c.notes
      }))

    const dprRecord = dprs.find(r => r.siteId === site.id) ?? null

    return {
      siteId: site.id,
      siteName: site.name,
      directLabour,
      contractors,
      dpr: dprRecord
        ? {
            workDone: dprRecord.workDone,
            workPlanned: dprRecord.workPlanned,
            labourCount: dprRecord.labourCount,
            weather: dprRecord.weather,
            delayReason: dprRecord.delayReason,
            qualityIssue: dprRecord.qualityIssue,
            safetyIssue: dprRecord.safetyIssue
          }
        : null,
      summary: {
        directWorkerCount: directLabour.length,
        presentCount: directLabour.filter(r => r.status === 'PRESENT').length,
        halfDayCount: directLabour.filter(r => r.status === 'HALF_DAY').length,
        absentCount: directLabour.filter(r => r.status === 'ABSENT').length,
        contractorHeadcount: contractors.reduce((sum, c) => sum + c.headcount, 0),
        totalWageEstimate: directLabour.reduce((sum, r) => sum + r.wageEstimate, 0),
        totalOvertimeHours: directLabour.reduce((sum, r) => sum + r.overtimeHours, 0),
        totalDirectAdvance: directLabour.reduce((sum, r) => sum + r.advance, 0),
        totalContractorAdvance: contractors.reduce((sum, c) => sum + c.dailyAdvance, 0)
      }
    }
  })

  return {
    date: dateStr,
    siteId: requestedSite?.id ?? null,
    sites: siteReports
  }
}
