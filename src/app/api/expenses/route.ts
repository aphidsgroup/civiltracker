import { prisma } from '@/lib/prisma'
import type { Prisma } from '@prisma/client'
import { NextResponse } from 'next/server'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { ensureCompanyContext, requireApiPermission } from '@/lib/auth/require-api-permission'
import { assignedSiteScope, readsAssignedSitesOnly } from '@/lib/auth/site-mutation'
import {
  assertApprovalSubmitPermission,
  createApprovalRequestRecord,
  findApprovalSubmitSite,
} from '@/lib/approvals/submit'

const schema = z.object({
  siteId: z.string(),
  category: z.string(),
  description: z.string().min(3),
  amount: z.number().positive(),
  paymentMode: z.string().default('CASH'),
  paidTo: z.string().optional(),
  billNumber: z.string().optional(),
  billDate: z.string().optional(),
  notes: z.string().optional(),
})

export async function GET(request: Request) {
  const authResult = await requireApiPermission('expenses.view', 'EXPENSES')
  if (authResult instanceof NextResponse) return authResult

  const companyContextError = ensureCompanyContext(authResult)
  if (companyContextError) return companyContextError

  const { searchParams } = new URL(request.url)
  const siteId = searchParams.get('siteId')

  const companyFilter = authResult.role === 'SUPER_ADMIN' ? {} : { companyId: authResult.companyId }

  // A field role reads only the expenses of the live sites it is assigned to: a named site
  // outside that scope is refused before any expense is read, and the list itself is
  // bound to the same scope.
  let siteFilter: Prisma.ExpenseWhereInput = {}
  if (authResult.companyId && readsAssignedSitesOnly(authResult.role)) {
    const scope = await assignedSiteScope(authResult, authResult.companyId)
    if (siteId) {
      const site = await prisma.site.findFirst({ where: { id: siteId, ...scope }, select: { id: true } })
      if (!site) return NextResponse.json({ error: 'Forbidden: Site not found or access denied' }, { status: 403 })
    }
    siteFilter = { site: scope }
  }

  const expenses = await prisma.expense.findMany({
    where: { ...companyFilter, ...siteFilter, ...(siteId ? { siteId } : {}), deletedAt: null },
    include: { site: { select: { name: true } }, createdBy: { select: { name: true } } },
    orderBy: { createdAt: 'desc' },
    take: 100,
  })

  return NextResponse.json({ expenses })
}

export async function POST(request: Request) {
  const authResult = await requireApiPermission('expenses.create', 'EXPENSES')
  if (authResult instanceof NextResponse) return authResult

  const companyContextError = ensureCompanyContext(authResult)
  if (companyContextError) return companyContextError

  // The expense is raised as a BILL approval, so the caller must also hold the BILL
  // submit permission. Checked before any read.
  try {
    assertApprovalSubmitPermission(authResult, 'BILL')
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Forbidden'
    return NextResponse.json({ error: message }, { status: 403 })
  }

  const body = await request.json()
  const parsed = schema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })

  const data = parsed.data

  // Live, in-tenant site only: a soft-deleted site is refused before any write.
  const site = await findApprovalSubmitSite(authResult, data.siteId)
  if (!site) return NextResponse.json({ error: 'Forbidden: Site not found or access denied' }, { status: 404 })

  // Expense, BILL approval and its initial timeline entry commit together, so a failed
  // approval write can never leave a PENDING expense with no approval pointing at it.
  let expense
  try {
    expense = await prisma.$transaction(async (tx) => {
      const created = await tx.expense.create({
        data: {
          companyId: site.companyId,
          siteId: site.id,
          category: data.category as 'MATERIAL',
          description: data.description,
          amount: data.amount,
          paymentMode: data.paymentMode as 'CASH',
          paidTo: data.paidTo,
          billNumber: data.billNumber,
          billDate: data.billDate ? new Date(data.billDate) : null,
          notes: data.notes,
          approvalStatus: 'PENDING',
          createdById: authResult.id,
        },
      })

      await createApprovalRequestRecord(tx, authResult, {
        companyId: site.companyId,
        siteId: site.id,
        entityType: 'BILL',
        entityId: created.id,
        title: `Expense for ${data.category}`,
        amount: data.amount,
        description: data.notes || null,
      })

      return created
    })
  } catch (error: unknown) {
    console.error('Failed to create expense', error)
    return NextResponse.json({ error: 'Failed to create expense' }, { status: 500 })
  }

  revalidatePath('/approvals')
  revalidatePath('/mobile/approvals')

  return NextResponse.json({ success: true, expense })
}
