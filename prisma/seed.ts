/* eslint-disable @typescript-eslint/no-unused-vars */
import { PrismaClient, Role, SiteStatus, ExpenseCategory, PaymentMode, LabourTrade } from '@prisma/client'
import bcrypt from 'bcryptjs'

const prisma = new PrismaClient()

async function main() {
  console.log('🌱 Seeding Civil Tracker database...')

  // Clean slate
  await prisma.auditLog.deleteMany()
  await prisma.notification.deleteMany()
  await prisma.approval.deleteMany()
  await prisma.billAttachment.deleteMany()
  await prisma.expense.deleteMany()
  await prisma.labourAttendance.deleteMany()
  await prisma.salaryRunItem.deleteMany()
  await prisma.salaryRun.deleteMany()
  await prisma.labour.deleteMany()
  await prisma.materialTransaction.deleteMany()
  await prisma.material.deleteMany()
  await prisma.sitePhoto.deleteMany()
  await prisma.dailyProgressReport.deleteMany()
  await prisma.task.deleteMany()
  await prisma.bOQItem.deleteMany()
  await prisma.purchaseRequest.deleteMany()
  await prisma.purchaseOrder.deleteMany()
  await prisma.document.deleteMany()
  await prisma.invoice.deleteMany()
  await prisma.payment.deleteMany()
  await prisma.client.deleteMany()
  await prisma.vendor.deleteMany()
  await prisma.subcontractor.deleteMany()
  await prisma.site.deleteMany()
  await prisma.companyMember.deleteMany()
  await prisma.companySubscription.deleteMany()
  await prisma.company.deleteMany()
  await prisma.subscriptionPlan.deleteMany()
  await prisma.user.deleteMany()

  const hash = (pw: string) => bcrypt.hash(pw, 12)

  // ── Plans ────────────────────────────────────────────────────
  const starterPlan = await prisma.subscriptionPlan.create({
    data: { name: 'Starter', price: 1999, maxSites: 2, maxUsers: 5, storageGb: 2, features: ['Sites', 'Expenses', 'Bills', 'Attendance'] },
  })
  const growthPlan = await prisma.subscriptionPlan.create({
    data: { name: 'Growth', price: 4999, maxSites: 10, maxUsers: 25, storageGb: 20, features: ['All Starter', 'BOQ', 'Materials', 'DPR', 'Reports'] },
  })
  const proPlan = await prisma.subscriptionPlan.create({
    data: { name: 'Pro', price: 9999, maxSites: 50, maxUsers: 100, storageGb: 100, features: ['All Growth', 'RA Bills', 'Client Portal', 'API', 'Priority Support'] },
  })
  console.log('✅ Plans created')

  // ── Super Admin ──────────────────────────────────────────────
  const superAdmin = await prisma.user.create({
    data: { email: 'admin@civiltracker.in', name: 'Platform Admin', phone: '+91 99999 00001', passwordHash: await hash('Admin@123456'), role: Role.SUPER_ADMIN },
  })
  console.log('✅ Super admin created')

  // ── Company ──────────────────────────────────────────────────
  const company = await prisma.company.create({
    data: { name: 'Madras Crafters', slug: 'madras-crafters', gst: '33ABCMC1234F1Z5', phone: '+91 44 4000 5000', email: 'info@madrascrafters.in', address: '14, Anna Salai', city: 'Chennai', state: 'Tamil Nadu', pincode: '600002', status: 'ACTIVE', plan: 'Growth' },
  })
  await prisma.companySubscription.create({ data: { companyId: company.id, planId: growthPlan.id } })

  // 2nd company for Super Admin demo
  const company2 = await prisma.company.create({
    data: { name: 'SKB Constructions', slug: 'skb-constructions', gst: '29ABCSK4321H1Z1', phone: '+91 80 2200 3300', email: 'info@skbconstructions.in', city: 'Bangalore', state: 'Karnataka', status: 'TRIAL', plan: 'Starter' },
  })
  await prisma.companySubscription.create({ data: { companyId: company2.id, planId: starterPlan.id } })

  console.log('✅ Companies created')

  // ── Users ────────────────────────────────────────────────────
  const arun = await prisma.user.create({ data: { email: 'arun@madras-crafters.in', name: 'Arun Selvaraj', phone: '+91 98401 55011', passwordHash: await hash('Admin@123456'), role: Role.COMPANY_ADMIN } })
  const priya = await prisma.user.create({ data: { email: 'priya@madras-crafters.in', name: 'Priya Rajan', phone: '+91 98401 55012', passwordHash: await hash('Admin@123456'), role: Role.ACCOUNTANT } })
  const murugan = await prisma.user.create({ data: { email: 'murugan@madras-crafters.in', name: 'Murugan R', phone: '+91 94440 55013', passwordHash: await hash('Admin@123456'), role: Role.SITE_ENGINEER } })
  const vetrivel = await prisma.user.create({ data: { email: 'vetrivel@madras-crafters.in', name: 'Vetrivel K', phone: '+91 94440 55014', passwordHash: await hash('Admin@123456'), role: Role.SUPERVISOR } })
  const clientUser = await prisma.user.create({ data: { email: 'client@annanagar.in', name: 'R. Subramanian', phone: '+91 98401 11100', passwordHash: await hash('Admin@123456'), role: Role.CLIENT } })

  await prisma.companyMember.createMany({
    data: [
      { userId: arun.id, companyId: company.id, role: Role.COMPANY_ADMIN },
      { userId: priya.id, companyId: company.id, role: Role.ACCOUNTANT },
      { userId: murugan.id, companyId: company.id, role: Role.SITE_ENGINEER },
      { userId: vetrivel.id, companyId: company.id, role: Role.SUPERVISOR },
      { userId: clientUser.id, companyId: company.id, role: Role.CLIENT },
    ],
  })
  console.log('✅ Users created')

  // ── Sites ────────────────────────────────────────────────────
  const annaNagar = await prisma.site.create({
    data: { companyId: company.id, name: 'Anna Nagar Villa Project', slug: 'anna-nagar-villa', location: 'Anna Nagar, Chennai', address: '3rd Avenue, Anna Nagar, Chennai - 600040', clientName: 'R. Subramanian', contractType: 'Item-rate', budget: 18500000, spent: 11400000, progress: 62, status: SiteStatus.ACTIVE, currentStage: 'MEP', startDate: new Date('2026-02-08'), handoverDate: new Date('2026-12-18'), engineerId: murugan.id, createdById: arun.id },
  })
  const porur = await prisma.site.create({
    data: { companyId: company.id, name: 'Porur Residential Renovation', slug: 'porur-residential', location: 'Porur, Chennai', clientName: 'K. Lakshmi', contractType: 'Cost-plus', budget: 6800000, spent: 2800000, progress: 41, status: SiteStatus.ACTIVE, currentStage: 'PLASTERING', startDate: new Date('2026-03-15'), createdById: arun.id },
  })
  const tambaram = await prisma.site.create({
    data: { companyId: company.id, name: 'Tambaram Commercial Interior', slug: 'tambaram-commercial', location: 'Tambaram, Chennai', clientName: 'Vel Interiors', contractType: 'Lump-sum', budget: 24000000, spent: 19000000, progress: 79, status: SiteStatus.ACTIVE, currentStage: 'FLOORING', startDate: new Date('2025-11-01'), createdById: arun.id },
  })
  const ecr = await prisma.site.create({
    data: { companyId: company.id, name: 'ECR Beach House', slug: 'ecr-beach-house', location: 'ECR, Chennai', clientName: 'D. Mehta', contractType: 'Item-rate', budget: 31000000, spent: 7000000, progress: 23, status: SiteStatus.ACTIVE, currentStage: 'FOUNDATION', startDate: new Date('2026-04-01'), createdById: arun.id },
  })
  const kundrathur = await prisma.site.create({
    data: { companyId: company.id, name: 'Kundrathur G+1 House', slug: 'kundrathur-g1', location: 'Kundrathur, Chennai', clientName: 'S. Babu', contractType: 'Lump-sum', budget: 5200000, spent: 600000, progress: 9, status: SiteStatus.ACTIVE, currentStage: 'FOUNDATION', startDate: new Date('2026-06-01'), createdById: arun.id },
  })
  console.log('✅ 5 sites created')

  // ── Vendors ──────────────────────────────────────────────────
  const vendor1 = await prisma.vendor.create({ data: { companyId: company.id, name: 'Sree Dhanalakshmi Enterprises', phone: '+91 98401 55021', gst: '33ABRPS1234H1Z5', category: 'Cement & Steel', address: 'Anna Salai, Chennai', paymentTerms: '15 days', rating: 4.8, totalPurchase: 3420000, amountPayable: 84500 } })
  await prisma.vendor.createMany({
    data: [
      { companyId: company.id, name: 'Lakshmi Build Mart', phone: '+91 99625 71140', gst: '33LBMXX1234H1Z5', category: 'Blocks & Sand', paymentTerms: '30 days', rating: 4.5, totalPurchase: 1860000, amountPayable: 132000 },
      { companyId: company.id, name: 'RR Transport', phone: '+91 89255 30012', category: 'Transport', paymentTerms: 'Cash', rating: 4.0, totalPurchase: 380000, amountPayable: 9400 },
      { companyId: company.id, name: 'Asian Paints Dealer', phone: '+91 90031 22815', category: 'Paints', paymentTerms: 'Cash', rating: 4.6, totalPurchase: 940000, amountPayable: 46200 },
      { companyId: company.id, name: 'Anna Hardware', phone: '+91 94440 08213', category: 'Tools & Hardware', paymentTerms: 'Cash', rating: 4.2, totalPurchase: 610000, amountPayable: 0 },
    ],
  })
  console.log('✅ Vendors created')

  // ── Labour ───────────────────────────────────────────────────
  const labourList = [
    { name: 'Murugan', trade: LabourTrade.MASON, dailyWage: 950 },
    { name: 'Rajesh Kumar', trade: LabourTrade.HELPER, dailyWage: 650 },
    { name: 'Kumar', trade: LabourTrade.BAR_BENDER, dailyWage: 900 },
    { name: 'Selvam', trade: LabourTrade.CARPENTER, dailyWage: 1000 },
    { name: 'Babu', trade: LabourTrade.HELPER, dailyWage: 650 },
    { name: 'Anbarasu', trade: LabourTrade.ELECTRICIAN, dailyWage: 1100 },
    { name: 'Karthik', trade: LabourTrade.PAINTER, dailyWage: 850 },
    { name: 'Velan', trade: LabourTrade.TILE_WORKER, dailyWage: 950 },
  ]
  const labours = await Promise.all(labourList.map(l => prisma.labour.create({ data: { companyId: company.id, siteId: annaNagar.id, name: l.name, trade: l.trade, dailyWage: l.dailyWage } })))
  console.log('✅ Labour created')

  // ── Attendance ───────────────────────────────────────────────
  const today = new Date(); today.setHours(0, 0, 0, 0)
  const statuses = ['PRESENT', 'PRESENT', 'PRESENT', 'PRESENT', 'HALF_DAY', 'PRESENT', 'PRESENT', 'ABSENT'] as const
  await Promise.all(labours.map((l, i) => prisma.labourAttendance.create({ data: { labourId: l.id, siteId: annaNagar.id, date: today, status: statuses[i], overtimeHours: i < 2 ? 2 : i === 5 ? 1 : 0, markedById: murugan.id } })))
  console.log('✅ Attendance marked')

  // ── Expenses ─────────────────────────────────────────────────
  const exp1 = await prisma.expense.create({ data: { companyId: company.id, siteId: annaNagar.id, category: ExpenseCategory.MATERIAL, description: 'Cement 120 bags — UltraTech PPC', amount: 84500, paymentMode: PaymentMode.CREDIT, paidTo: 'Sree Dhanalakshmi Enterprises', billNumber: 'INV-2418', billDate: new Date('2026-06-24'), approvalStatus: 'PENDING', createdById: murugan.id } })
  const exp2 = await prisma.expense.create({ data: { companyId: company.id, siteId: annaNagar.id, category: ExpenseCategory.DIESEL, description: 'JCB + generator diesel', amount: 9400, paymentMode: PaymentMode.CASH, paidTo: 'VRL Diesel', billDate: new Date('2026-06-24'), approvalStatus: 'APPROVED', createdById: murugan.id, approvedById: arun.id, approvedAt: new Date() } })
  const exp3 = await prisma.expense.create({ data: { companyId: company.id, siteId: annaNagar.id, category: ExpenseCategory.TRANSPORT, description: 'Material lorry freight', amount: 6800, paymentMode: PaymentMode.UPI, paidTo: 'RR Transport', billDate: new Date('2026-06-23'), approvalStatus: 'PAID', createdById: murugan.id, approvedById: arun.id, approvedAt: new Date() } })
  const exp4 = await prisma.expense.create({ data: { companyId: company.id, siteId: annaNagar.id, category: ExpenseCategory.TOOLS_EQUIPMENT, description: 'Cutting blades and drill bits', amount: 12300, paymentMode: PaymentMode.CASH, paidTo: 'Anna Hardware', billDate: new Date('2026-06-23'), approvalStatus: 'APPROVED', createdById: murugan.id, approvedById: arun.id, approvedAt: new Date() } })
  const exp5 = await prisma.expense.create({ data: { companyId: company.id, siteId: annaNagar.id, category: ExpenseCategory.SITE_PETTY_CASH, description: 'Site tea, water, and daily supplies', amount: 1150, paymentMode: PaymentMode.CASH, paidTo: 'Site store', billDate: new Date('2026-06-23'), approvalStatus: 'APPROVED', createdById: murugan.id, approvedById: arun.id, approvedAt: new Date() } })
  const exp6 = await prisma.expense.create({ data: { companyId: company.id, siteId: tambaram.id, category: ExpenseCategory.SUBCONTRACTOR, description: 'Tiling work advance — Bharath Interiors', amount: 240000, paymentMode: PaymentMode.BANK_TRANSFER, paidTo: 'Bharath Interiors', billDate: new Date('2026-06-22'), approvalStatus: 'PENDING', createdById: murugan.id } })
  console.log('✅ Expenses created')

  // ── Approvals ────────────────────────────────────────────────
  await prisma.approval.create({ data: { companyId: company.id, siteId: annaNagar.id, module: 'BILL', recordId: exp1.id, requestedById: murugan.id, status: 'PENDING' } })
  await prisma.approval.create({ data: { companyId: company.id, siteId: tambaram.id, module: 'BILL', recordId: exp6.id, requestedById: murugan.id, status: 'PENDING' } })
  console.log('✅ Approvals created')

  // ── Materials ─────────────────────────────────────────────────
  const mats = [
    { name: 'Cement (UltraTech PPC)', brand: 'UltraTech', unit: 'bags', openingStock: 180, currentStock: 12, minStock: 50, unitCost: 420 },
    { name: 'TMT Steel 8mm', brand: 'TATA Tiscon', unit: 'tonne', openingStock: 2.4, currentStock: 0.4, minStock: 1.5, unitCost: 65000 },
    { name: 'M-Sand', brand: 'Local quarry', unit: 'unit', openingStock: 8, currentStock: 3, minStock: 2, unitCost: 6500 },
    { name: 'AAC Blocks', brand: 'Magicrete', unit: 'nos', openingStock: 1200, currentStock: 400, minStock: 200, unitCost: 45 },
    { name: 'Emulsion Paint', brand: 'Asian Paints', unit: 'litre', openingStock: 200, currentStock: 140, minStock: 50, unitCost: 280 },
    { name: 'Wall Putty', brand: 'Birla White', unit: 'bags', openingStock: 40, currentStock: 8, minStock: 25, unitCost: 650 },
  ]
  await Promise.all(mats.map(m => prisma.material.create({ data: { companyId: company.id, siteId: annaNagar.id, ...m } })))
  console.log('✅ Materials created')

  // ── DPR ──────────────────────────────────────────────────────
  await prisma.dailyProgressReport.create({
    data: { companyId: company.id, siteId: annaNagar.id, date: today, workDone: 'First-floor slab shuttering completed for Block A. Column reinforcement tied to lintel level. Cement (120 bags) received and stacked. Electrical conduit routing 70% complete.', workPlanned: 'Slab concreting Block A from 6 AM. Bar bending for staircase. Electrical conduit on ground floor.', labourCount: 32, weather: '32°C Clear', clientVisible: true, createdById: murugan.id },
  })
  console.log('✅ DPR created')

  // ── BOQ ──────────────────────────────────────────────────────
  const boqData = [
    { category: 'Civil', description: 'Earthwork & excavation', unit: 'cum', qty: 420, rate: 185 },
    { category: 'Structural', description: 'PCC & RCC foundation', unit: 'cum', qty: 86, rate: 6400 },
    { category: 'Structural', description: 'RCC columns & slab', unit: 'cum', qty: 142, rate: 7200 },
    { category: 'Civil', description: 'Brick / block masonry', unit: 'sqm', qty: 1280, rate: 780 },
    { category: 'Civil', description: 'Internal plastering', unit: 'sqm', qty: 2640, rate: 240 },
    { category: 'Electrical', description: 'Electrical points & wiring', unit: 'point', qty: 310, rate: 1150 },
    { category: 'Plumbing', description: 'CP & sanitary fittings', unit: 'set', qty: 12, rate: 18500 },
    { category: 'Flooring', description: 'Vitrified tile flooring', unit: 'sqm', qty: 980, rate: 1250 },
  ]
  await Promise.all(boqData.map(b => {
    const amount = b.qty * b.rate
    return prisma.bOQItem.create({ data: { companyId: company.id, siteId: annaNagar.id, version: 3, category: b.category, description: b.description, unit: b.unit, quantity: b.qty, rate: b.rate, amount, gstPercent: 18, totalWithGst: amount * 1.18, clientApproved: true, clientApprovedAt: new Date('2026-02-14') } })
  }))
  console.log('✅ BOQ created')

  // ── Tasks ─────────────────────────────────────────────────────
  await prisma.task.createMany({
    data: [
      { companyId: company.id, siteId: annaNagar.id, name: 'Foundation & footing', stage: 'FOUNDATION', status: 'COMPLETED', progress: 100, completedAt: new Date('2026-03-12') },
      { companyId: company.id, siteId: annaNagar.id, name: 'RCC structure G+1', stage: 'RCC', status: 'COMPLETED', progress: 100, completedAt: new Date('2026-04-28') },
      { companyId: company.id, siteId: annaNagar.id, name: 'Masonry & block work', stage: 'MASONRY', status: 'COMPLETED', progress: 100, completedAt: new Date('2026-06-02') },
      { companyId: company.id, siteId: annaNagar.id, name: 'MEP — electrical', stage: 'MEP', status: 'IN_PROGRESS', progress: 70, dueDate: new Date('2026-07-02') },
      { companyId: company.id, siteId: annaNagar.id, name: 'MEP — plumbing', stage: 'MEP', status: 'IN_PROGRESS', progress: 55, dueDate: new Date('2026-07-04') },
      { companyId: company.id, siteId: annaNagar.id, name: 'Plastering Block A', stage: 'PLASTERING', status: 'IN_PROGRESS', progress: 30, dueDate: new Date('2026-07-08') },
      { companyId: company.id, siteId: annaNagar.id, name: 'Painting — external', stage: 'PAINTING', status: 'NOT_STARTED', progress: 0, dueDate: new Date('2026-08-05') },
      { companyId: company.id, siteId: annaNagar.id, name: 'False ceiling works', stage: 'INTERIOR', status: 'NOT_STARTED', progress: 0, dueDate: new Date('2026-08-12') },
      { companyId: company.id, siteId: annaNagar.id, name: 'Waterproofing — terrace', stage: 'MEP', status: 'DELAYED', progress: 20, dueDate: new Date('2026-06-30'), delayReason: 'Client variation in progress' },
    ],
  })
  console.log('✅ Tasks created')

  // ── Subcontractors ────────────────────────────────────────────
  await prisma.subcontractor.createMany({
    data: [
      { companyId: company.id, name: 'Bharath Interiors', trade: 'Tiling & Flooring', gst: '33BHINT1234H1Z5', workOrderValue: 860000, raBilled: 240000, retention: 86000, advance: 50000 },
      { companyId: company.id, name: 'SK Electricals', trade: 'Electrical', workOrderValue: 420000, raBilled: 0, retention: 42000, advance: 0 },
      { companyId: company.id, name: 'Murali Plumbing Works', trade: 'Plumbing', workOrderValue: 310000, raBilled: 0, retention: 31000, advance: 30000 },
      { companyId: company.id, name: 'Royal Painters', trade: 'Painting', workOrderValue: 0, raBilled: 0, retention: 0, advance: 40000, status: 'Mobilising' },
    ],
  })
  console.log('✅ Subcontractors created')

  // ── Client ────────────────────────────────────────────────────
  await prisma.client.create({
    data: { companyId: company.id, siteId: annaNagar.id, name: 'R. Subramanian', phone: '+91 98401 11100', email: 'client@annanagar.in', portalToken: 'anna-nagar-client-portal-token-2026', portalAccess: true, contractValue: 18500000, amountPaid: 11000000, amountDue: 1400000 },
  })

  // ── Notifications ─────────────────────────────────────────────
  await prisma.notification.createMany({
    data: [
      { userId: arun.id, companyId: company.id, type: 'APPROVAL_REQUIRED', title: 'Bill pending approval', message: 'Cement bill ₹84,500 from Sree Dhanalakshmi needs approval', link: '/bills' },
      { userId: murugan.id, companyId: company.id, type: 'DPR_REMINDER', title: 'DPR reminder', message: 'Daily Report for Anna Nagar Villa due by 7 PM', link: '/mobile/add/dpr' },
      { userId: arun.id, companyId: company.id, type: 'LOW_STOCK', title: 'Low stock alert', message: 'Cement at Anna Nagar Villa — only 12 bags (min: 50)', link: '/materials' },
    ],
  })
  console.log('✅ Client & notifications created')

  console.log('\n🎉 Seed complete!')
  console.log('Demo accounts:')
  console.log('  Super Admin:   admin@civiltracker.in / Admin@123456')
  console.log('  Company Admin: arun@madras-crafters.in / Admin@123456')
  console.log('  Site Engineer: murugan@madras-crafters.in / Admin@123456')
  console.log('  Accountant:    priya@madras-crafters.in / Admin@123456')
  console.log('  Client:        client@annanagar.in / Admin@123456')
}

main()
  .catch(e => { console.error('❌ Seed failed:', e); process.exit(1) })
  .finally(async () => { await prisma.$disconnect() })
