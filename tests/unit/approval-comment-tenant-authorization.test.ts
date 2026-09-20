import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  requireUser: vi.fn(),
  revalidatePath: vi.fn(),
  prisma: {
    approval: { findFirst: vi.fn() },
    approvalComment: { create: vi.fn() },
  },
}))

vi.mock('@/lib/auth/require-user', () => ({ requireUser: mocks.requireUser }))
vi.mock('@/lib/permissions', () => ({ hasPermission: vi.fn() }))
vi.mock('@/lib/prisma', () => ({ prisma: mocks.prisma, default: mocks.prisma }))
vi.mock('next/cache', () => ({ revalidatePath: mocks.revalidatePath }))
vi.mock('@/lib/audit', () => ({ logActivity: vi.fn() }))

const { addApprovalCommentAction } = await import('@/actions/approvals')

beforeEach(() => {
  vi.clearAllMocks()
  mocks.requireUser.mockResolvedValue({ id: 'user_1', role: 'COMPANY_ADMIN', companyId: 'company_1' })
})

describe('approval comment tenant authorization', () => {
  it('rejects another-company approval before comment creation', async () => {
    mocks.prisma.approval.findFirst.mockResolvedValue(null)

    await expect(addApprovalCommentAction('other_company_approval', 'Attempted cross-tenant comment')).rejects.toThrow(/approval not found/i)

    expect(mocks.prisma.approval.findFirst).toHaveBeenCalledWith({
      where: { id: 'other_company_approval', companyId: 'company_1', deletedAt: null },
      select: { id: true, companyId: true, entityType: true, siteId: true },
    })
    expect(mocks.prisma.approvalComment.create).not.toHaveBeenCalled()
  })

  it('rejects a same-company legacy site-null EXPENSE approval before comment creation', async () => {
    // A row that predates site binding: same company, so the tenant filter admits it,
    // but the site-bound entity type carries no site and the thread must stay closed.
    mocks.prisma.approval.findFirst.mockResolvedValue({
      id: 'legacy_approval',
      companyId: 'company_1',
      entityType: 'EXPENSE',
      siteId: null,
    })

    await expect(addApprovalCommentAction('legacy_approval', 'Attempted comment on a site-less approval')).rejects.toThrow(/site/i)

    expect(mocks.prisma.approval.findFirst).toHaveBeenCalledWith({
      where: { id: 'legacy_approval', companyId: 'company_1', deletedAt: null },
      select: { id: true, companyId: true, entityType: true, siteId: true },
    })
    expect(mocks.prisma.approvalComment.create).not.toHaveBeenCalled()
    expect(mocks.revalidatePath).not.toHaveBeenCalled()
  })

  it('still comments on a company level PURCHASE_ORDER approval that has no site', async () => {
    mocks.prisma.approval.findFirst.mockResolvedValue({
      id: 'po_approval',
      companyId: 'company_1',
      entityType: 'PURCHASE_ORDER',
      siteId: null,
    })
    mocks.prisma.approvalComment.create.mockResolvedValue({ id: 'comment_1' })

    const created = await addApprovalCommentAction('po_approval', 'Company level note')

    expect(created).toEqual({ id: 'comment_1' })
    expect(mocks.prisma.approvalComment.create).toHaveBeenCalledWith({
      data: {
        companyId: 'company_1',
        approvalId: 'po_approval',
        userId: 'user_1',
        comment: 'Company level note',
      },
    })
  })
})
