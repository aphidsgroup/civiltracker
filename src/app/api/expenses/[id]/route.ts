import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { NextResponse } from 'next/server'
import { Role } from '@prisma/client'

// PATCH /api/expenses/[id] — Edit a PENDING expense (creator or company admin)
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const companyFilter = session.user.role === 'SUPER_ADMIN' ? {} : { companyId: session.user.companyId }
  const expense = await prisma.expense.findFirst({ where: { id, ...companyFilter, deletedAt: null } })
  if (!expense) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  // Only PENDING expenses can be edited
  if (expense.approvalStatus !== 'PENDING') {
    return NextResponse.json({ error: 'Only PENDING expenses can be edited' }, { status: 400 })
  }

  // Only the creator or admin/company_admin can edit
  const isAdmin = ['SUPER_ADMIN', 'COMPANY_ADMIN', 'ACCOUNTANT'].includes(session.user.role as string)
  const isCreator = expense.createdById === session.user.id
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
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const companyFilter = session.user.role === 'SUPER_ADMIN' ? {} : { companyId: session.user.companyId }
  const expense = await prisma.expense.findFirst({ where: { id, ...companyFilter, deletedAt: null } })
  if (!expense) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  // Only PENDING expenses can be deleted
  if (expense.approvalStatus !== 'PENDING') {
    return NextResponse.json({ error: 'Only PENDING expenses can be deleted' }, { status: 400 })
  }

  // Only the creator or admin can delete
  const isAdmin = ['SUPER_ADMIN', 'COMPANY_ADMIN', 'ACCOUNTANT'].includes(session.user.role as string)
  const isCreator = expense.createdById === session.user.id
  if (!isAdmin && !isCreator) {
    return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
  }

  await prisma.expense.update({
    where: { id },
    data: { deletedAt: new Date() },
  })

  return NextResponse.json({ success: true })
}
