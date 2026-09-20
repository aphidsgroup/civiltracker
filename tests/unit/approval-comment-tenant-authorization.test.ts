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
      select: { companyId: true },
    })
    expect(mocks.prisma.approvalComment.create).not.toHaveBeenCalled()
  })
})
