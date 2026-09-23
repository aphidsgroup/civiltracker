import { NextResponse } from 'next/server'
import { createApprovalAction, getApprovalsAction } from '@/actions/approvals'
import { approvalApiError } from '@/lib/approvals/api-errors'
import { requireApprovalApiUser } from '@/lib/approvals/api-guard'
import type { ApprovalEntityType, ApprovalPriority } from '@prisma/client'

type CreateApprovalPayload = {
  entityType?: ApprovalEntityType
  entityId?: string
  title?: string
  amount?: number | null
  description?: string | null
  priority?: ApprovalPriority
  siteId?: string | null
  approvalType?: string
}

/**
 * The REST surface is a transport for the hardened approval workflow, not a second
 * implementation of it. Both handlers delegate to the actions, so the site binding,
 * tenant-scoped entity resolution and fail-closed reads cannot drift apart from the
 * server actions the UI uses.
 */
export async function GET(request: Request) {
  try {
    await requireApprovalApiUser('approvals.view')

    const { searchParams } = new URL(request.url)

    // The action composes the well-formed-site predicate itself, so a malformed legacy
    // row is excluded by the query rather than filtered out after the fact.
    const approvals = await getApprovalsAction({
      status: searchParams.get('status') ?? undefined,
      entityType: searchParams.get('entityType') ?? undefined,
      search: searchParams.get('search') ?? undefined,
    })

    return NextResponse.json({ success: true, data: approvals })
  } catch (error) {
    return approvalApiError(error)
  }
}

export async function POST(request: Request) {
  try {
    await requireApprovalApiUser('approvals.view')

    let body: CreateApprovalPayload
    try {
      body = ((await request.json()) ?? {}) as CreateApprovalPayload
    } catch {
      return NextResponse.json({ error: 'Malformed request body' }, { status: 400 })
    }

    const { entityType, entityId, title, amount, description, priority, siteId, approvalType } = body

    if (!entityType || !entityId || !title) {
      return NextResponse.json({ error: 'Missing mandatory fields' }, { status: 400 })
    }

    // Every remaining rule — the unsupported VARIATION workflow, the mandatory site for a
    // site-bound entity type, the site/company check and the linked entity lookup scoped
    // to that exact company and site — belongs to the action.
    const approval = await createApprovalAction({
      siteId: siteId ?? null,
      entityType,
      entityId,
      title,
      amount: amount ?? null,
      description: description ?? null,
      priority: priority || 'NORMAL',
      approvalType,
    })

    return NextResponse.json({ success: true, data: approval })
  } catch (error) {
    return approvalApiError(error)
  }
}
