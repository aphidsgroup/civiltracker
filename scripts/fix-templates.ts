import prisma from '../src/lib/prisma'

async function main() {
  // Get ALL templates with stage counts
  const all = await prisma.checklistTemplate.findMany({
    include: { _count: { select: { stages: true } } },
    orderBy: { createdAt: 'asc' }
  })

  console.log(`\nALL templates in DB (${all.length} total):\n`)
  for (const t of all) {
    console.log(`  id=${t.id}`)
    console.log(`  name="${t.name}"`)
    console.log(`  isGlobal=${t.isGlobal}`)
    console.log(`  companyId=${t.companyId ?? 'null (global)'}`)
    console.log(`  stages=${t._count.stages}`)
    console.log(`  createdAt=${t.createdAt}`)
    console.log()
  }

  // Delete ALL company-owned templates with 0 stages
  const toDelete = all.filter(t => !t.isGlobal && t._count.stages === 0)
  if (toDelete.length > 0) {
    console.log(`Deleting ${toDelete.length} empty company templates...`)
    for (const t of toDelete) {
      await prisma.checklistTemplate.delete({ where: { id: t.id } })
      console.log(`  ✓ Deleted "${t.name}" (${t.id}) for company ${t.companyId}`)
    }
  } else {
    console.log('No empty company templates found to delete.')
  }
}

main().catch(console.error).finally(() => prisma.$disconnect())
