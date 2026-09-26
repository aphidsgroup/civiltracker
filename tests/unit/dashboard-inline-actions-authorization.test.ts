import { beforeEach, describe, expect, it, vi } from 'vitest'
import { inMemoryDelegate } from './support/prisma-where'
import type { RelationResolver, Row } from './support/prisma-where'

/**
 * Regression for dashboard Server Actions declared inline in page files that authorized
 * from JWT claims alone.
 *
 * `boq/new`, `labour/new`, the labour list, `materials/new`, `purchase/new`, the vendor
 * and subcontractor list and new pages, `tasks/new`, `clients/new` and `clients/advances`
 * each trusted `session.user.companyId` from the token: a revoked member, a demoted role
 * or any role at all (a CLIENT, a SUBCONTRACTOR) could write, company modules were never
 * consulted, and every user-supplied id was written as given — a site, vendor or assignee
 * of another tenant, a soft-deleted site, or (for the labour pay-out) an attendance row of
 * any worker, found by bare labour id.
 *
 * Now each action lives in a shared `src/actions/*` module and runs the live
 * `requireTenantMutation` / `requireSiteMutation` gate — live principal, live permission,
 * live module — before its first read, and binds every referenced id to exactly the live
 * company (sites live, vendors active on a live site, assignees active members). Related
 * writes run in one transaction.
 *
 * `@/lib/permissions`, `@/lib/auth/require-module` and `@/lib/auth/site-mutation` are real.
 */
const mocks = vi.hoisted(() => ({
  requireUser: vi.fn(),
  auth: vi.fn(),
  revalidatePath: vi.fn(),
  redirect: vi.fn(),
  logActivity: vi.fn(),
  prisma: {
    company: { findUnique: vi.fn() },
    companyMember: { findFirst: vi.fn() },
    site: { findFirst: vi.fn(), updateMany: vi.fn() },
    bOQItem: { create: vi.fn() },
    labour: { create: vi.fn(), findFirst: vi.fn(), updateMany: vi.fn(), update: vi.fn(), findUnique: vi.fn() },
    labourAttendance: { findFirst: vi.fn(), updateMany: vi.fn(), update: vi.fn() },
    material: { create: vi.fn() },
    purchaseOrder: { create: vi.fn() },
    vendor: { create: vi.fn(), findFirst: vi.fn(), updateMany: vi.fn(), update: vi.fn(), findUnique: vi.fn() },
    subcontractor: { create: vi.fn(), findFirst: vi.fn(), updateMany: vi.fn(), update: vi.fn(), findUnique: vi.fn() },
    task: { create: vi.fn() },
    client: { create: vi.fn(), findFirst: vi.fn() },
    payment: { create: vi.fn() },
    $transaction: vi.fn(),
  },
}))

vi.mock('@/lib/auth', () => ({ auth: mocks.auth }))
vi.mock('@/lib/auth/require-user', () => ({ requireUser: mocks.requireUser }))
vi.mock('@/lib/prisma', () => ({ prisma: mocks.prisma, default: mocks.prisma }))
vi.mock('next/cache', () => ({ revalidatePath: mocks.revalidatePath }))
vi.mock('next/navigation', () => ({ redirect: mocks.redirect }))
vi.mock('@/lib/audit', () => ({ logActivity: mocks.logActivity }))

const boq = await import('@/actions/boq')
const labour = await import('@/actions/labour')
const materials = await import('@/actions/materials')
const purchase = await import('@/actions/purchase')
const vendors = await import('@/actions/vendors')
const subcontractors = await import('@/actions/subcontractors')
const tasks = await import('@/actions/tasks')
const clients = await import('@/actions/clients')
const advances = await import('@/actions/client-advance')

const DELETED = new Date('2026-01-01')

const SITES: Row[] = [
  { id: 'site_1', companyId: 'company_1', deletedAt: null, name: 'Tower A', clientId: 'client_1' },
  { id: 'site_2', companyId: 'company_1', deletedAt: null, name: 'Tower B', clientId: null, engineerId: 'user_site_engineer' },
  { id: 'site_deleted', companyId: 'company_1', deletedAt: DELETED, name: 'Old', clientId: null },
  { id: 'site_foreign', companyId: 'company_2', deletedAt: null, name: 'Rival', clientId: null },
]

const siteOf: RelationResolver = (row, key) => {
  if (key !== 'site') return undefined
  return SITES.find((site) => site.id === row.siteId) ?? null
}

const MEMBERS: Row[] = [
  { userId: 'user_pm', companyId: 'company_1', isActive: true, siteIds: [] },
  { userId: 'user_site_engineer', companyId: 'company_1', isActive: true, siteIds: [] },
  { userId: 'user_inactive', companyId: 'company_1', isActive: false, siteIds: [] },
  { userId: 'user_foreign', companyId: 'company_2', isActive: true, siteIds: [] },
]

const VENDORS: Row[] = [
  { id: 'vendor_1', companyId: 'company_1', siteId: null, isActive: true, name: 'Sri Ram Traders', category: null, amountPayable: 0 },
  { id: 'vendor_site', companyId: 'company_1', siteId: 'site_1', isActive: true, name: 'Site Vendor', category: null, amountPayable: 0 },
  { id: 'vendor_inactive', companyId: 'company_1', siteId: null, isActive: false, name: 'Gone', category: null, amountPayable: 0 },
  { id: 'vendor_deleted_site', companyId: 'company_1', siteId: 'site_deleted', isActive: true, name: 'Old', category: null, amountPayable: 0 },
  { id: 'vendor_foreign', companyId: 'company_2', siteId: null, isActive: true, name: 'Rival', category: null, amountPayable: 0 },
]

const SUBS: Row[] = [
  { id: 'sub_1', companyId: 'company_1', siteId: 'site_1', isActive: true, name: 'A.K. Builders', trade: null, status: 'Active', raBilled: 0, advance: 0, retention: 0 },
  { id: 'sub_deleted_site', companyId: 'company_1', siteId: 'site_deleted', isActive: true, name: 'Old', trade: null, status: 'Active', raBilled: 0, advance: 0, retention: 0 },
  { id: 'sub_foreign', companyId: 'company_2', siteId: null, isActive: true, name: 'Rival', trade: null, status: 'Active', raBilled: 0, advance: 0, retention: 0 },
]

const WORKERS: Row[] = [
  { id: 'labour_1', companyId: 'company_1', siteId: 'site_1', name: 'Ramesh', trade: 'MASON', isActive: true },
  { id: 'labour_deleted_site', companyId: 'company_1', siteId: 'site_deleted', name: 'Old', trade: 'MASON', isActive: true },
  { id: 'labour_foreign', companyId: 'company_2', siteId: 'site_foreign', name: 'Rival', trade: 'MASON', isActive: true },
]

const CLIENTS: Row[] = [
  { id: 'client_1', companyId: 'company_1' },
  { id: 'client_foreign', companyId: 'company_2' },
]

function principal(role: string, companyId = 'company_1') {
  return { id: `user_${role.toLowerCase()}`, name: role, email: `${role.toLowerCase()}@acme.test`, role, companyId }
}

function form(fields: Record<string, string>) {
  const data = new FormData()
  for (const [key, value] of Object.entries(fields)) data.set(key, value)
  return data
}

const WRITES = () => [
  mocks.prisma.bOQItem.create, mocks.prisma.labour.create, mocks.prisma.labour.updateMany, mocks.prisma.labour.update,
  mocks.prisma.labourAttendance.updateMany, mocks.prisma.labourAttendance.update, mocks.prisma.material.create,
  mocks.prisma.purchaseOrder.create, mocks.prisma.vendor.create, mocks.prisma.vendor.updateMany, mocks.prisma.vendor.update,
  mocks.prisma.subcontractor.create, mocks.prisma.subcontractor.updateMany, mocks.prisma.subcontractor.update,
  mocks.prisma.task.create, mocks.prisma.client.create, mocks.prisma.payment.create, mocks.prisma.site.updateMany,
]

function expectNoWrites() {
  for (const write of WRITES()) expect(write).not.toHaveBeenCalled()
}

const BOQ_FORM = { siteId: 'site_1', category: 'Civil', description: 'Earthwork', unit: 'Cum', quantity: '10', rate: '100', gstPercent: '18' }
const LABOUR_FORM = { siteId: 'site_1', name: 'Ramesh', phone: '', trade: 'MASON', dailyWage: '600', overtimeRate: '' }
const MATERIAL_FORM = { siteId: 'site_1', name: 'OPC Cement', brand: '', unit: 'Bags', openingStock: '10', minStock: '2' }
const PO_FORM = { vendorId: 'vendor_1', poNumber: 'PO-2026-1001', totalAmount: '5000', notes: '' }
const VENDOR_FORM = { name: 'Sri Ram Traders', email: '', phone: '', gst: '', category: '', paymentTerms: '', address: '', siteId: '' }
const SUB_FORM = { name: 'A.K. Builders', phone: '', trade: '', gst: '', workOrderValue: '1000', siteId: '' }
const TASK_FORM = { siteId: 'site_1', name: 'Slab shuttering', description: '', assignedToId: '', startDate: '', dueDate: '' }
const CLIENT_FORM = { name: 'John Doe', phone: '', email: '', siteId: '', contractValue: '100000' }
const ADVANCE_FORM = { siteId: 'site_1', amount: '25000', purpose: 'Mobilisation', receivedAt: '2026-09-01T10:00' }

/** Every action, called by a principal who holds its permission, on valid input. */
const ACTIONS: Array<{ name: string; run: () => Promise<unknown>; permitted: string; module: string }> = [
  { name: 'createBoqItemAction', run: () => boq.createBoqItemAction(form(BOQ_FORM)), permitted: 'PROJECT_MANAGER', module: 'BOQ' },
  { name: 'createLabourAction', run: () => labour.createLabourAction(form(LABOUR_FORM)), permitted: 'COMPANY_ADMIN', module: 'LABOUR' },
  { name: 'updateLabourRosterAction', run: () => labour.updateLabourRosterAction(form({ id: 'labour_1', ...LABOUR_FORM, openingAdvance: '0', status: 'active' })), permitted: 'COMPANY_ADMIN', module: 'LABOUR' },
  { name: 'markLabourPaidAction', run: () => labour.markLabourPaidAction(form({ id: 'labour_1', amount: '500' })), permitted: 'COMPANY_ADMIN', module: 'LABOUR' },
  { name: 'deactivateLabourAction', run: () => labour.deactivateLabourAction(form({ id: 'labour_1', dangerConfirmText: 'Ramesh' })), permitted: 'COMPANY_ADMIN', module: 'LABOUR' },
  { name: 'createMaterialAction', run: () => materials.createMaterialAction(form(MATERIAL_FORM)), permitted: 'PROJECT_MANAGER', module: 'MATERIALS' },
  { name: 'createPurchaseOrderAction', run: () => purchase.createPurchaseOrderAction(form(PO_FORM)), permitted: 'PURCHASE_MANAGER', module: 'MATERIALS' },
  { name: 'createVendorAction', run: () => vendors.createVendorAction(form(VENDOR_FORM)), permitted: 'PURCHASE_MANAGER', module: 'MATERIALS' },
  { name: 'updateVendorAction', run: () => vendors.updateVendorAction(form({ id: 'vendor_1', ...VENDOR_FORM, amountPayable: '0', isActive: 'true' })), permitted: 'PURCHASE_MANAGER', module: 'MATERIALS' },
  { name: 'markVendorPaidAction', run: () => vendors.markVendorPaidAction(form({ id: 'vendor_1' })), permitted: 'ACCOUNTANT', module: 'MATERIALS' },
  { name: 'deactivateVendorAction', run: () => vendors.deactivateVendorAction(form({ id: 'vendor_1', dangerConfirmText: 'Sri Ram Traders' })), permitted: 'PURCHASE_MANAGER', module: 'MATERIALS' },
  { name: 'createSubcontractorAction', run: () => subcontractors.createSubcontractorAction(form(SUB_FORM)), permitted: 'PURCHASE_MANAGER', module: 'MATERIALS' },
  { name: 'updateSubcontractorAction', run: () => subcontractors.updateSubcontractorAction(form({ id: 'sub_1', name: 'A.K. Builders', status: 'Active' })), permitted: 'PURCHASE_MANAGER', module: 'MATERIALS' },
  { name: 'markSubcontractorPaidAction', run: () => subcontractors.markSubcontractorPaidAction(form({ id: 'sub_1', amount: '100' })), permitted: 'ACCOUNTANT', module: 'MATERIALS' },
  { name: 'deactivateSubcontractorAction', run: () => subcontractors.deactivateSubcontractorAction(form({ id: 'sub_1', dangerConfirmText: 'A.K. Builders' })), permitted: 'PURCHASE_MANAGER', module: 'MATERIALS' },
  { name: 'createTaskAction', run: () => tasks.createTaskAction(form(TASK_FORM)), permitted: 'PROJECT_MANAGER', module: 'TASKS' },
  { name: 'createClientAction', run: () => clients.createClientAction(form(CLIENT_FORM)), permitted: 'ACCOUNTANT', module: 'CLIENTS' },
  { name: 'createClientAdvanceFromFormAction', run: () => advances.createClientAdvanceFromFormAction(form(ADVANCE_FORM)), permitted: 'ACCOUNTANT', module: 'CLIENTS' },
]

let modules: unknown

beforeEach(() => {
  vi.clearAllMocks()
  modules = ['SITES', 'BOQ', 'LABOUR', 'MATERIALS', 'TASKS', 'CLIENTS']
  // The token claims another company and role; only the live principal may be used.
  mocks.auth.mockResolvedValue({ user: { id: 'user_token', role: 'COMPANY_ADMIN', companyId: 'company_2' } })
  mocks.requireUser.mockResolvedValue(principal('COMPANY_ADMIN'))
  mocks.prisma.company.findUnique.mockImplementation(async () => ({ modulesJson: modules, status: 'ACTIVE' }))
  mocks.prisma.companyMember.findFirst.mockImplementation(inMemoryDelegate(MEMBERS).findFirst)
  mocks.prisma.site.findFirst.mockImplementation(inMemoryDelegate(SITES).findFirst)
  mocks.prisma.site.updateMany.mockImplementation(inMemoryDelegate(SITES).updateMany)
  mocks.prisma.vendor.findFirst.mockImplementation(inMemoryDelegate(VENDORS, siteOf).findFirst)
  mocks.prisma.vendor.updateMany.mockImplementation(inMemoryDelegate(VENDORS, siteOf).updateMany)
  mocks.prisma.subcontractor.findFirst.mockImplementation(inMemoryDelegate(SUBS, siteOf).findFirst)
  mocks.prisma.subcontractor.updateMany.mockImplementation(inMemoryDelegate(SUBS, siteOf).updateMany)
  mocks.prisma.labour.findFirst.mockImplementation(inMemoryDelegate(WORKERS, siteOf).findFirst)
  mocks.prisma.labour.updateMany.mockImplementation(inMemoryDelegate(WORKERS, siteOf).updateMany)
  mocks.prisma.labourAttendance.findFirst.mockResolvedValue({ id: 'attendance_1' })
  mocks.prisma.labourAttendance.updateMany.mockResolvedValue({ count: 1 })
  mocks.prisma.client.findFirst.mockImplementation(inMemoryDelegate(CLIENTS).findFirst)
  for (const create of [
    mocks.prisma.bOQItem.create, mocks.prisma.labour.create, mocks.prisma.material.create, mocks.prisma.purchaseOrder.create,
    mocks.prisma.vendor.create, mocks.prisma.subcontractor.create, mocks.prisma.task.create, mocks.prisma.client.create,
    mocks.prisma.payment.create,
  ]) create.mockResolvedValue({ id: 'created_1' })
  mocks.prisma.$transaction.mockImplementation(async (fn: (tx: typeof mocks.prisma) => unknown) => fn(mocks.prisma))
})

describe('live principal, permission and module gate', () => {
  it.each(ACTIONS)('$name succeeds for a live principal holding its permission', async ({ run, permitted }) => {
    mocks.requireUser.mockResolvedValue(principal(permitted))
    await expect(run()).resolves.not.toThrow()
    expect(mocks.auth).not.toHaveBeenCalled()
  })

  it.each(ACTIONS)('$name refuses a revoked principal whose token is still valid, before any read', async ({ run }) => {
    mocks.requireUser.mockRejectedValue(new Error('UNAUTHORIZED: Active company membership required'))
    await expect(run()).rejects.toThrow(/UNAUTHORIZED/)
    expect(mocks.prisma.site.findFirst).not.toHaveBeenCalled()
    expectNoWrites()
  })

  it.each(ACTIONS)('$name refuses a live CLIENT (demoted from a token role that could write)', async ({ run }) => {
    mocks.requireUser.mockResolvedValue(principal('CLIENT'))
    await expect(run()).rejects.toThrow(/FORBIDDEN/)
    expect(mocks.prisma.site.findFirst).not.toHaveBeenCalled()
    expectNoWrites()
  })

  it.each(ACTIONS)('$name refuses SUPER_ADMIN, which has no tenant context', async ({ run }) => {
    mocks.requireUser.mockResolvedValue({ ...principal('SUPER_ADMIN'), companyId: undefined })
    await expect(run()).rejects.toThrow(/FORBIDDEN/)
    expectNoWrites()
  })

  it.each(ACTIONS)('$name refuses when its module is disabled for the live company', async ({ run, module }) => {
    modules = ['SITES', 'BOQ', 'LABOUR', 'MATERIALS', 'TASKS', 'CLIENTS'].filter((name) => name !== module)
    await expect(run()).rejects.toThrow(new RegExp(`Module ${module} is not enabled`))
    expectNoWrites()
  })

  it('labour writes need labour.manage, not only attendance.mark', async () => {
    mocks.requireUser.mockResolvedValue(principal('PROJECT_MANAGER'))
    await expect(labour.createLabourAction(form(LABOUR_FORM))).rejects.toThrow(/labour\.manage/)
    await expect(labour.markLabourPaidAction(form({ id: 'labour_1', amount: '500' }))).rejects.toThrow(/labour\.manage/)
    expectNoWrites()
  })

  it('vendor and subcontractor payments need payments.manage', async () => {
    mocks.requireUser.mockResolvedValue(principal('PURCHASE_MANAGER'))
    await expect(vendors.markVendorPaidAction(form({ id: 'vendor_1' }))).rejects.toThrow(/payments\.manage/)
    await expect(subcontractors.markSubcontractorPaidAction(form({ id: 'sub_1', amount: '100' }))).rejects.toThrow(/payments\.manage/)
    expectNoWrites()
  })
})

describe('site binding', () => {
  const SITE_BOUND: Array<{ name: string; run: (siteId: string) => Promise<unknown>; write: () => ReturnType<typeof vi.fn> }> = [
    { name: 'createBoqItemAction', run: (siteId) => boq.createBoqItemAction(form({ ...BOQ_FORM, siteId })), write: () => mocks.prisma.bOQItem.create },
    { name: 'createLabourAction', run: (siteId) => labour.createLabourAction(form({ ...LABOUR_FORM, siteId })), write: () => mocks.prisma.labour.create },
    { name: 'updateLabourRosterAction', run: (siteId) => labour.updateLabourRosterAction(form({ id: 'labour_1', ...LABOUR_FORM, siteId, openingAdvance: '0', status: 'active' })), write: () => mocks.prisma.labour.updateMany },
    { name: 'createMaterialAction', run: (siteId) => materials.createMaterialAction(form({ ...MATERIAL_FORM, siteId })), write: () => mocks.prisma.material.create },
    { name: 'createVendorAction', run: (siteId) => vendors.createVendorAction(form({ ...VENDOR_FORM, siteId })), write: () => mocks.prisma.vendor.create },
    { name: 'createSubcontractorAction', run: (siteId) => subcontractors.createSubcontractorAction(form({ ...SUB_FORM, siteId })), write: () => mocks.prisma.subcontractor.create },
    { name: 'createTaskAction', run: (siteId) => tasks.createTaskAction(form({ ...TASK_FORM, siteId })), write: () => mocks.prisma.task.create },
    { name: 'createClientAction', run: (siteId) => clients.createClientAction(form({ ...CLIENT_FORM, siteId })), write: () => mocks.prisma.client.create },
    { name: 'createClientAdvanceFromFormAction', run: (siteId) => advances.createClientAdvanceFromFormAction(form({ ...ADVANCE_FORM, siteId })), write: () => mocks.prisma.payment.create },
  ]

  it.each(SITE_BOUND)('$name refuses another tenant\'s site', async ({ run, write }) => {
    await expect(run('site_foreign')).rejects.toThrow(/Site not found or access denied/)
    expect(write()).not.toHaveBeenCalled()
  })

  it.each(SITE_BOUND)('$name refuses a soft-deleted site of the same company', async ({ run, write }) => {
    await expect(run('site_deleted')).rejects.toThrow(/Site not found or access denied/)
    expect(write()).not.toHaveBeenCalled()
  })

  it.each(SITE_BOUND)('$name writes the live company and the bound site', async ({ run, write }) => {
    await run('site_1')
    expect(write()).toHaveBeenCalledTimes(1)
    const [args] = write().mock.calls[0] as [{ data?: Row; where?: Row }]
    if (args.data && 'companyId' in args.data) expect(args.data.companyId).toBe('company_1')
    if (args.data && 'siteId' in args.data) expect(args.data.siteId).toBe('site_1')
  })

  it('vendor, subcontractor and client may stay company-wide when no site is chosen', async () => {
    await vendors.createVendorAction(form(VENDOR_FORM))
    await subcontractors.createSubcontractorAction(form(SUB_FORM))
    await clients.createClientAction(form(CLIENT_FORM))
    expect(mocks.prisma.vendor.create.mock.calls[0][0].data).toMatchObject({ companyId: 'company_1', siteId: null })
    expect(mocks.prisma.subcontractor.create.mock.calls[0][0].data).toMatchObject({ companyId: 'company_1', siteId: null })
    expect(mocks.prisma.client.create.mock.calls[0][0].data).toMatchObject({ companyId: 'company_1', siteId: null })
  })

  it('a field role creates material only on a site it is assigned to', async () => {
    mocks.requireUser.mockResolvedValue(principal('SITE_ENGINEER'))
    await expect(materials.createMaterialAction(form(MATERIAL_FORM))).rejects.toThrow(/Site not found or access denied/)
    expect(mocks.prisma.material.create).not.toHaveBeenCalled()

    await materials.createMaterialAction(form({ ...MATERIAL_FORM, siteId: 'site_2' }))
    expect(mocks.prisma.material.create.mock.calls[0][0].data).toMatchObject({ companyId: 'company_1', siteId: 'site_2' })
  })

  it('rejects malformed amounts before any write', async () => {
    await expect(boq.createBoqItemAction(form({ ...BOQ_FORM, quantity: '-1' }))).rejects.toThrow(/quantity/)
    await expect(labour.createLabourAction(form({ ...LABOUR_FORM, dailyWage: 'abc' }))).rejects.toThrow(/daily wage/)
    await expect(labour.createLabourAction(form({ ...LABOUR_FORM, trade: 'ASTRONAUT' }))).rejects.toThrow(/trade/)
    await expect(purchase.createPurchaseOrderAction(form({ ...PO_FORM, totalAmount: '-5' }))).rejects.toThrow(/amount/i)
    expectNoWrites()
  })
})

describe('referenced resource binding', () => {
  it.each(['vendor_foreign', 'vendor_inactive', 'vendor_deleted_site', 'vendor_missing'])(
    'a purchase order refuses vendor %s',
    async (vendorId) => {
      await expect(purchase.createPurchaseOrderAction(form({ ...PO_FORM, vendorId }))).rejects.toThrow(/Vendor not found or access denied/)
      expect(mocks.prisma.purchaseOrder.create).not.toHaveBeenCalled()
    },
  )

  it('a purchase order binds an active vendor of the live company inside one transaction', async () => {
    mocks.requireUser.mockResolvedValue(principal('PURCHASE_MANAGER'))
    await purchase.createPurchaseOrderAction(form(PO_FORM))
    expect(mocks.prisma.$transaction).toHaveBeenCalledTimes(1)
    expect(mocks.prisma.purchaseOrder.create.mock.calls[0][0].data).toMatchObject({
      companyId: 'company_1', vendorId: 'vendor_1', createdById: 'user_purchase_manager', totalAmount: 5000,
    })
  })

  it.each(['user_foreign', 'user_inactive', 'user_missing'])('a task refuses assignee %s', async (assignedToId) => {
    await expect(tasks.createTaskAction(form({ ...TASK_FORM, assignedToId }))).rejects.toThrow(/Assignee not found or access denied/)
    expect(mocks.prisma.task.create).not.toHaveBeenCalled()
  })

  it('a task binds an active member of the live company', async () => {
    mocks.requireUser.mockResolvedValue(principal('PROJECT_MANAGER'))
    await tasks.createTaskAction(form({ ...TASK_FORM, assignedToId: 'user_pm' }))
    expect(mocks.prisma.task.create.mock.calls[0][0].data).toMatchObject({
      companyId: 'company_1', siteId: 'site_1', assignedToId: 'user_pm', createdById: 'user_project_manager',
    })
  })

  it('a client advance on a site whose client is foreign is refused', async () => {
    SITES[0].clientId = 'client_foreign'
    try {
      await expect(advances.createClientAdvanceFromFormAction(form(ADVANCE_FORM))).rejects.toThrow(/Client not found/)
      expect(mocks.prisma.payment.create).not.toHaveBeenCalled()
    } finally {
      SITES[0].clientId = 'client_1'
    }
  })
})

describe('labour list actions', () => {
  it.each(['labour_foreign', 'labour_deleted_site', 'labour_missing'])('update refuses worker %s', async (id) => {
    await expect(labour.updateLabourRosterAction(form({ id, ...LABOUR_FORM, openingAdvance: '0', status: 'active' })))
      .rejects.toThrow(/Labour not found or access denied/)
  })

  it('update moves the worker only onto a live site of the live company', async () => {
    await labour.updateLabourRosterAction(form({ id: 'labour_1', ...LABOUR_FORM, siteId: 'site_2', openingAdvance: '0', status: 'inactive' }))
    const [args] = mocks.prisma.labour.updateMany.mock.calls[0]
    expect(args.where).toMatchObject({ id: 'labour_1', companyId: 'company_1' })
    expect(args.data).toMatchObject({ siteId: 'site_2', isActive: false, trade: 'MASON', dailyWage: 600 })
  })

  it.each(['labour_foreign', 'labour_deleted_site'])('pay-out never reads the attendance of worker %s', async (id) => {
    await expect(labour.markLabourPaidAction(form({ id, amount: '500' }))).rejects.toThrow(/Labour not found or access denied/)
    expect(mocks.prisma.labourAttendance.findFirst).not.toHaveBeenCalled()
    expectNoWrites()
  })

  it('pay-out increments the bound worker\'s latest attendance inside one transaction', async () => {
    await labour.markLabourPaidAction(form({ id: 'labour_1', amount: '500' }))
    expect(mocks.prisma.$transaction).toHaveBeenCalledTimes(1)
    expect(mocks.prisma.labourAttendance.findFirst.mock.calls[0][0].where).toEqual({ labourId: 'labour_1' })
    expect(mocks.prisma.labourAttendance.updateMany).toHaveBeenCalledWith({
      where: { id: 'attendance_1', labourId: 'labour_1' },
      data: { advance: { increment: 500 } },
    })
  })

  it('pay-out rejects a non-positive amount', async () => {
    await expect(labour.markLabourPaidAction(form({ id: 'labour_1', amount: '0' }))).rejects.toThrow(/Invalid payment amount/)
    expectNoWrites()
  })

  it('deactivation needs the worker name typed and audits the live principal', async () => {
    await expect(labour.deactivateLabourAction(form({ id: 'labour_1', dangerConfirmText: 'nope' }))).rejects.toThrow(/did not match/)
    expectNoWrites()

    await labour.deactivateLabourAction(form({ id: 'labour_1', dangerConfirmText: 'Ramesh' }))
    expect(mocks.prisma.labour.updateMany.mock.calls[0][0]).toMatchObject({ where: { id: 'labour_1', companyId: 'company_1' }, data: { isActive: false } })
    expect(mocks.logActivity).toHaveBeenCalledWith(expect.objectContaining({ userId: 'user_company_admin', companyId: 'company_1' }))
  })

  it('deactivation refuses a foreign worker', async () => {
    await expect(labour.deactivateLabourAction(form({ id: 'labour_foreign', dangerConfirmText: 'Rival' }))).rejects.toThrow(/Labour not found/)
    expectNoWrites()
  })
})

describe('vendor and subcontractor list actions', () => {
  it.each(['vendor_foreign', 'vendor_deleted_site', 'vendor_missing'])('vendor writes refuse %s', async (id) => {
    await expect(vendors.updateVendorAction(form({ id, ...VENDOR_FORM, amountPayable: '0', isActive: 'true' }))).rejects.toThrow(/Vendor not found/)
    mocks.requireUser.mockResolvedValue(principal('ACCOUNTANT'))
    await expect(vendors.markVendorPaidAction(form({ id }))).rejects.toThrow(/Vendor not found/)
    mocks.requireUser.mockResolvedValue(principal('PURCHASE_MANAGER'))
    await expect(vendors.deactivateVendorAction(form({ id, dangerConfirmText: 'Rival' }))).rejects.toThrow(/Vendor not found/)
    expectNoWrites()
  })

  it('vendor update rejects a negative payable', async () => {
    await expect(vendors.updateVendorAction(form({ id: 'vendor_1', ...VENDOR_FORM, amountPayable: '-1', isActive: 'true' }))).rejects.toThrow(/amount payable/)
    expectNoWrites()
  })

  it('vendor writes are scoped to the live company', async () => {
    await vendors.updateVendorAction(form({ id: 'vendor_site', ...VENDOR_FORM, amountPayable: '10', isActive: 'false' }))
    expect(mocks.prisma.vendor.updateMany.mock.calls[0][0].where).toMatchObject({ id: 'vendor_site', companyId: 'company_1' })
    expect(mocks.prisma.vendor.updateMany.mock.calls[0][0].data).toMatchObject({ amountPayable: 10, isActive: false })
  })

  it.each(['sub_foreign', 'sub_deleted_site', 'sub_missing'])('subcontractor writes refuse %s', async (id) => {
    await expect(subcontractors.updateSubcontractorAction(form({ id, name: 'X', status: 'Active' }))).rejects.toThrow(/Subcontractor not found/)
    mocks.requireUser.mockResolvedValue(principal('ACCOUNTANT'))
    await expect(subcontractors.markSubcontractorPaidAction(form({ id, amount: '100' }))).rejects.toThrow(/Subcontractor not found/)
    mocks.requireUser.mockResolvedValue(principal('PURCHASE_MANAGER'))
    await expect(subcontractors.deactivateSubcontractorAction(form({ id, dangerConfirmText: 'Rival' }))).rejects.toThrow(/Subcontractor not found/)
    expectNoWrites()
  })

  it('subcontractor payment is a database increment on the bound row', async () => {
    mocks.requireUser.mockResolvedValue(principal('ACCOUNTANT'))
    await subcontractors.markSubcontractorPaidAction(form({ id: 'sub_1', amount: '100' }))
    expect(mocks.prisma.subcontractor.updateMany.mock.calls[0][0]).toMatchObject({
      where: { id: 'sub_1', companyId: 'company_1' },
      data: { advance: { increment: 100 } },
    })
  })

  it('subcontractor update rejects an unknown status', async () => {
    await expect(subcontractors.updateSubcontractorAction(form({ id: 'sub_1', name: 'X', status: 'Hacked' }))).rejects.toThrow(/status/)
    expectNoWrites()
  })
})
