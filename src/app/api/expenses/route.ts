import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { NextResponse } from 'next/server'
import { z } from 'zod'

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
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (session.user.role === 'CLIENT') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  if (!session.user.companyId && session.user.role !== 'SUPER_ADMIN') {
    return NextResponse.json({ error: 'Unauthorized: No active company context' }, { status: 401 })
  }

  const { searchParams } = new URL(request.url)
  const siteId = searchParams.get('siteId')

  const companyFilter = session.user.role === 'SUPER_ADMIN' ? {} : { companyId: session.user.companyId }

  const expenses = await prisma.expense.findMany({
    where: { ...companyFilter, ...(siteId ? { siteId } : {}), deletedAt: null },
    include: { site: { select: { name: true } }, createdBy: { select: { name: true } } },
    orderBy: { createdAt: 'desc' },
    take: 100,
  })

  return NextResponse.json({ expenses })
}

export async function POST(request: Request) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (session.user.role === 'CLIENT') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  if (!session.user.companyId && session.user.role !== 'SUPER_ADMIN') {
    return NextResponse.json({ error: 'Unauthorized: No active company context' }, { status: 401 })
  }

  const body = await request.json()
  const parsed = schema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })

  const data = parsed.data

  const companyId = session.user.companyId!

  const site = await prisma.site.findFirst({
    where: { id: data.siteId, ...(session.user.role === 'SUPER_ADMIN' ? {} : { companyId }) }
  })
  if (!site) return NextResponse.json({ error: 'Forbidden: Site not found or access denied' }, { status: 404 })

  const actualCompanyId = site.companyId || companyId

  const expense = await prisma.expense.create({
    data: {
      companyId: actualCompanyId,
      siteId: data.siteId,
      category: data.category as 'MATERIAL',
      description: data.description,
      amount: data.amount,
      paymentMode: data.paymentMode as 'CASH',
      paidTo: data.paidTo,
      billNumber: data.billNumber,
      billDate: data.billDate ? new Date(data.billDate) : null,
      notes: data.notes,
      approvalStatus: 'PENDING',
      createdById: session.user.id,
    },
  })

  await prisma.approval.create({
    data: {
      companyId: actualCompanyId,
      siteId: data.siteId,
      module: 'BILL',
      recordId: expense.id,
      requestedById: session.user.id,
    },
  })

  return NextResponse.json({ success: true, expense })
}
