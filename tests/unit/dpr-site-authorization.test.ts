import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  requireUser: vi.fn(),
  submitApprovalRequest: vi.fn(),
  prisma: {
    site: { findFirst: vi.fn() },
    dailyProgressReport: { create: vi.fn() },
  },
}))

vi.mock('@/lib/auth/require-user', () => ({ requireUser: mocks.requireUser }))
vi.mock('@/lib/approvals/submit', () => ({ submitApprovalRequest: mocks.submitApprovalRequest }))
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
    expect(mocks.submitApprovalRequest).not.toHaveBeenCalled()
  })

  // The public createApprovalAction now requires approvals.view, which SUPERVISOR does
  // not hold; the DPR flow is authorized by dpr.create and must keep submitting.
  it('still raises the DPR approval for a SUPERVISOR through the internal submitter', async () => {
    const supervisor = { id: 'supervisor_1', role: 'SUPERVISOR', companyId: 'company_1' }
    mocks.requireUser.mockResolvedValue(supervisor)

    await expect(createDpr(form())).resolves.toEqual({ success: true, dprId: 'dpr_1' })

    expect(mocks.submitApprovalRequest).toHaveBeenCalledWith(
      supervisor,
      expect.objectContaining({ siteId: 'site_1', entityType: 'DPR', entityId: 'dpr_1' })
    )
  })

  it('refuses a role without dpr.create before any write or approval request', async () => {
    mocks.requireUser.mockResolvedValue({ id: 'vendor_1', role: 'VENDOR', companyId: 'company_1' })

    await expect(createDpr(form())).rejects.toThrow(/dpr\.create/)

    expect(mocks.prisma.dailyProgressReport.create).not.toHaveBeenCalled()
    expect(mocks.submitApprovalRequest).not.toHaveBeenCalled()
  })
})
