import prisma from '../src/lib/prisma'

async function main() {
  const [templates, vendors, subs] = await Promise.all([
    prisma.checklistTemplate.findMany({
      select: { id: true, name: true, isGlobal: true, companyId: true }
    }),
    prisma.vendor.findMany({
      take: 5,
      select: { id: true, name: true, amountPayable: true, companyId: true, isActive: true }
    }),
    prisma.subcontractor.findMany({
      take: 5,
      select: { id: true, name: true, raBilled: true, advance: true, retention: true, isActive: true }
    })
  ])
  console.log('=== CHECKLIST TEMPLATES ===')
  console.log(JSON.stringify(templates, null, 2))
  console.log('\n=== VENDORS ===')
  console.log(JSON.stringify(vendors, null, 2))
  console.log('\n=== SUBCONTRACTORS ===')
  console.log(JSON.stringify(subs, null, 2))
}

main().catch(console.error).finally(() => prisma.$disconnect())
