import { prisma } from '@/lib/prisma'
import { NextResponse } from 'next/server'
import { ensureCompanyContext, requireApiPermission } from '@/lib/auth/require-api-permission'
import { logActivity } from '@/lib/audit'

// PATCH /api/expenses/[id] — Edit a PENDING expense (creator or company admin)
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const authResult = await requireApiPermission('expenses.view', 'EXPENSES')
  if (authResult instanceof NextResponse) return authResult

  const companyContextError = ensureCompanyContext(authResult)
  if (companyContextError) return companyContextError

  const companyFilter = authResult.role === 'SUPER_ADMIN' ? {} : { companyId: authResult.companyId }
  const expense = await prisma.expense.findFirst({ where: { id, ...companyFilter, deletedAt: null } })
  if (!expense) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  // Only PENDING expenses can be edited
  if (expense.approvalStatus !== 'PENDING') {
    return NextResponse.json({ error: 'Only PENDING expenses can be edited' }, { status: 400 })
  }

  // Only the creator or admin/company_admin can edit
  const isAdmin = ['SUPER_ADMIN', 'COMPANY_ADMIN', 'ACCOUNTANT'].includes(authResult.role)
  const isCreator = expense.createdById === authResult.id
  if (!isAdmin && !isCreator) {
    return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
  }

  const body = await request.json()
  const { amount, category, paymentMode, paidTo, description, billNumber, notes } = body

  await prisma.expense.update({
    where: { id },
    data: {
      ...(amount !== undefined && { amount: parseFloat(amount) }),
      ...(category && { category }),
      ...(paymentMode && { paymentMode }),
      ...(paidTo !== undefined && { paidTo: paidTo || null }),
      ...(description !== undefined && { description }),
      ...(billNumber !== undefined && { billNumber: billNumber || null }),
      ...(notes !== undefined && { notes: notes || null }),
    },
  })

  return NextResponse.json({ success: true })
}

// DELETE /api/expenses/[id] — Soft-delete a PENDING expense (creator or admin)
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const authResult = await requireApiPermission('expenses.view', 'EXPENSES')
  if (authResult instanceof NextResponse) return authResult

  const companyContextError = ensureCompanyContext(authResult)
  if (companyContextError) return companyContextError

  const companyFilter = authResult.role === 'SUPER_ADMIN' ? {} : { companyId: authResult.companyId }
  const expense = await prisma.expense.findFirst({ where: { id, ...companyFilter, deletedAt: null } })
  if (!expense) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  // Only PENDING expenses can be deleted
  if (expense.approvalStatus !== 'PENDING') {
    return NextResponse.json({ error: 'Only PENDING expenses can be deleted' }, { status: 400 })
  }

  // Only the creator or admin can delete
  const isAdmin = ['SUPER_ADMIN', 'COMPANY_ADMIN', 'ACCOUNTANT'].includes(authResult.role)
  const isCreator = expense.createdById === authResult.id
  if (!isAdmin && !isCreator) {
    return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
  }

  const body = await request.json().catch(() => ({}))
  const dangerConfirmText = typeof body?.dangerConfirmText === 'string' ? body.dangerConfirmText.trim() : ''
  const expectedConfirmText = (expense.description || expense.paidTo || expense.billNumber || expense.id).trim()
  if (dangerConfirmText !== expectedConfirmText) {
    return NextResponse.json({ error: 'Delete confirmation text did not match the expense label' }, { status: 400 })
  }

  const deletedAt = new Date()
  await prisma.expense.update({
    where: { id },
    data: { deletedAt },
  })

  await logActivity({
    userId: authResult.id,
    companyId: expense.companyId,
    action: 'DELETE',
    module: 'EXPENSE',
    recordId: expense.id,
    description: `${authResult.name ?? authResult.email} deleted pending expense "${expense.description || expense.paidTo || expense.billNumber || expense.id}"`,
    before: {
      deletedAt: expense.deletedAt,
      amount: Number(expense.amount),
      category: expense.category,
      approvalStatus: expense.approvalStatus,
      paidTo: expense.paidTo,
      description: expense.description,
      billNumber: expense.billNumber,
    },
    after: {
      deletedAt: deletedAt.toISOString(),
      amount: Number(expense.amount),
      category: expense.category,
      approvalStatus: expense.approvalStatus,
      paidTo: expense.paidTo,
      description: expense.description,
      billNumber: expense.billNumber,
    },
  })

  return NextResponse.json({ success: true })
}
