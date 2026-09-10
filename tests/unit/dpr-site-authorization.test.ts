import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  requireUser: vi.fn(),
  createApprovalAction: vi.fn(),
  prisma: {
    site: { findFirst: vi.fn() },
    dailyProgressReport: { create: vi.fn() },
  },
}))

vi.mock('@/lib/auth/require-user', () => ({ requireUser: mocks.requireUser }))
vi.mock('@/actions/approvals', () => ({ createApprovalAction: mocks.createApprovalAction }))
vi.mock('@/lib/prisma', () => ({ prisma: mocks.prisma, default: mocks.prisma }))

const { createDpr } = await import('@/actions/dpr')

function form(siteId = 'site_1') {
  const data = new FormData()
  data.set('siteId', siteId)
  data.set('workDone', 'Concrete poured')
  data.set('labourCount', '5')
  data.set('date', '2026-09-10')
  return data
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.requireUser.mockResolvedValue({ id: 'engineer_1', role: 'SITE_ENGINEER', companyId: 'company_1' })
  mocks.prisma.site.findFirst.mockResolvedValue({ id: 'site_1' })
  mocks.prisma.dailyProgressReport.create.mockResolvedValue({ id: 'dpr_1' })
})

describe('createDpr tenant authorization', () => {
  it('queries the submitted site with the live caller company before writing a DPR', async () => {
    await createDpr(form())

    expect(mocks.prisma.site.findFirst).toHaveBeenCalledWith({
      where: { id: 'site_1', companyId: 'company_1', deletedAt: null },
      select: { id: true },
    })
  })

  it('rejects a site outside the caller company without creating DPR or approval records', async () => {
    mocks.prisma.site.findFirst.mockResolvedValue(null)

    await expect(createDpr(form('other_company_site'))).rejects.toThrow(/site not found or access denied/i)
    expect(mocks.prisma.dailyProgressReport.create).not.toHaveBeenCalled()
    expect(mocks.createApprovalAction).not.toHaveBeenCalled()
  })
})
