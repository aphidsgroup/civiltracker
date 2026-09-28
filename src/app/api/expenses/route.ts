import { prisma } from '@/lib/prisma'
import type { Prisma } from '@prisma/client'
import { NextResponse } from 'next/server'
import { revalidatePath } from 'next/cache'
import { ensureCompanyContext, requireApiPermission } from '@/lib/auth/require-api-permission'
import { requireModuleEnabled } from '@/lib/auth/require-module'
import { assignedSiteScope, readsAssignedSitesOnly } from '@/lib/auth/site-mutation'
import {
  assertApprovalSubmitPermission,
  createApprovalRequestRecord,
  findApprovalSubmitSite,
} from '@/lib/approvals/submit'
import { EXPENSE_ATTACHMENT_NOT_FOUND, parseExpenseApiInput } from '@/lib/validation/expenses'
import type { ExpenseActionInput } from '@/lib/validation/expenses'

/** A refusal raised inside the transaction; it rolls the transaction back and answers 403. */
class ExpenseRefusal extends Error {}

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

  // The body is parsed by the canonical expense policy (strict key allowlist, enum
  // category and payment mode, two-decimal bounded amount, real bill date, bounded
  // trimmed text, strict media id) before any site, media or transaction access.
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid expense: body must be valid JSON' }, { status: 400 })
  }

  let data: ExpenseActionInput
  try {
    data = parseExpenseApiInput(body)
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : ''
    // A malformed media id answers exactly like an unusable upload.
    if (message === EXPENSE_ATTACHMENT_NOT_FOUND) return NextResponse.json({ error: message }, { status: 403 })
    return NextResponse.json({ error: message.startsWith('Invalid expense:') ? message : 'Invalid expense' }, { status: 400 })
  }
  const mediaAssetId = data.mediaAssetId

  // Filing a bill against an upload needs BILLS, the module that upload was stored under.
  if (mediaAssetId) {
    try {
      await requireModuleEnabled('BILLS')
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Forbidden'
      return NextResponse.json({ error: message }, { status: 403 })
    }
  }

  // Live, in-tenant site only: a soft-deleted site is refused before any write.
  const site = await findApprovalSubmitSite(authResult, data.siteId)
  if (!site) return NextResponse.json({ error: 'Forbidden: Site not found or access denied' }, { status: 404 })

  // Expense, bill attachment, BILL approval and its initial timeline entry commit
  // together, so a failed approval write can never leave a PENDING expense with no
  // approval pointing at it. The uploaded bill is resolved first: it must be a BILL upload
  // by this same user for exactly this site and company, not yet attached to any expense,
  // and every attachment field stored is copied from that asset.
  let expense
  try {
    expense = await prisma.$transaction(async (tx) => {
      let attachment: {
        cloudinaryPublicId: string
        secureUrl: string
        format: string | null
        bytes: number | null
        width: number | null
        height: number | null
        originalName: string | null
      } | null = null
      if (mediaAssetId) {
        attachment = await tx.mediaAsset.findFirst({
          where: { id: mediaAssetId, companyId: site.companyId, siteId: site.id, module: 'BILL', uploadedById: authResult.id },
          select: {
            cloudinaryPublicId: true,
            secureUrl: true,
            format: true,
            bytes: true,
            width: true,
            height: true,
            originalName: true,
          },
        })
        if (!attachment) throw new ExpenseRefusal(EXPENSE_ATTACHMENT_NOT_FOUND)

        // One upload backs one bill, so the same file cannot be claimed twice.
        const bound = await tx.billAttachment.findFirst({
          where: { cloudinaryPublicId: attachment.cloudinaryPublicId },
          select: { id: true },
        })
        if (bound) throw new ExpenseRefusal('Forbidden: Uploaded bill is already attached')
      }

      const created = await tx.expense.create({
        data: {
          companyId: site.companyId,
          siteId: site.id,
          category: data.category,
          description: data.description ?? (data.notes ? data.notes.substring(0, 50) : `Expense for ${data.category}`),
          amount: data.amount,
          paymentMode: data.paymentMode,
          paidTo: data.paidTo,
          billNumber: data.billNumber,
          billDate: data.billDate ?? null,
          notes: data.notes,
          approvalStatus: 'PENDING',
          createdById: authResult.id,
          ...(attachment
            ? {
                billAttachments: {
                  create: {
                    cloudinaryPublicId: attachment.cloudinaryPublicId,
                    secureUrl: attachment.secureUrl,
                    originalName: attachment.originalName,
                    format: attachment.format,
                    bytes: attachment.bytes,
                    width: attachment.width,
                    height: attachment.height,
                    uploadedById: authResult.id,
                  },
                },
              }
            : {}),
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
    if (error instanceof ExpenseRefusal) return NextResponse.json({ error: error.message }, { status: 403 })
    console.error('Failed to create expense', error)
    return NextResponse.json({ error: 'Failed to create expense' }, { status: 500 })
  }

  revalidatePath('/approvals')
  revalidatePath('/mobile/approvals')

  return NextResponse.json({ success: true, expense })
}
