import prisma from '../src/lib/prisma'

async function main() {
  const templates = await prisma.checklistTemplate.findMany({
    where: { isGlobal: true },
    include: {
      stages: {
        include: {
          categories: {
            include: { tasks: true }
          }
        }
      }
    }
  })
  
  for (const t of templates) {
    console.log(`\nTEMPLATE: ${t.name} (id: ${t.id})`)
    console.log(`  Stages: ${t.stages.length}`)
    for (const stage of t.stages) {
      console.log(`  STAGE: ${stage.name} (${stage.categories.length} categories)`)
      for (const cat of stage.categories) {
        console.log(`    CATEGORY: ${cat.name} (${cat.tasks.length} tasks)`)
      }
    }
  }
}

main().catch(console.error).finally(() => prisma.$disconnect())
