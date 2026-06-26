import { PrismaClient } from '@prisma/client'
const prisma = new PrismaClient()

async function main() {
  const company = await prisma.company.findFirst()
  if (!company) {
    console.log('No company found')
    return
  }

  const client = await prisma.client.findFirst({ where: { companyId: company.id } })
  const clientId = client ? client.id : null

  await prisma.site.create({
    data: {
      companyId: company.id,
      clientId: clientId,
      name: 'Metro Heights Tower B (Luxury Residencies)',
      slug: 'metro-heights-tower-b',
      location: 'Baner, Pune',
      status: 'ACTIVE',
      progress: 68,
      areaSqft: 45000,
      budget: 125000000,
      spent: 85000000,
      startDate: new Date('2025-01-10'),
      targetEndDate: new Date('2026-12-31'),
      currentStage: 'RCC Framing & Slab 8',
    }
  })

  await prisma.site.create({
    data: {
      companyId: company.id,
      clientId: clientId,
      name: 'Green Valley Twin Villas (Phase 1)',
      slug: 'green-valley-twin-villas',
      location: 'Wakad, Pune',
      status: 'ACTIVE',
      progress: 92,
      areaSqft: 12000,
      budget: 35000000,
      spent: 32000000,
      startDate: new Date('2024-06-15'),
      targetEndDate: new Date('2026-08-30'),
      currentStage: 'Interior Plastering & MEP',
    }
  })

  await prisma.site.create({
    data: {
      companyId: company.id,
      clientId: clientId,
      name: 'Apex Commercial Tech Park',
      slug: 'apex-commercial-tech-park',
      location: 'Hinjewadi Phase 1, Pune',
      status: 'PLANNING',
      progress: 15,
      areaSqft: 80000,
      budget: 280000000,
      spent: 42000000,
      startDate: new Date('2026-03-01'),
      targetEndDate: new Date('2028-06-30'),
      currentStage: 'Excavation & Shoring',
    }
  })

  console.log('Dummy sites created successfully')
}

main().catch(console.error).finally(() => prisma.$disconnect())
