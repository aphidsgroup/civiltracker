import { PrismaClient } from '@prisma/client'
import { syncSiteBudget } from '../src/lib/budget'

const prisma = new PrismaClient()

async function main() {
  console.log('Recalculating site budgets with advances...')
  const sites = await prisma.site.findMany({
    where: { deletedAt: null }
  })

  for (const site of sites) {
    const totalSpent = await syncSiteBudget(site.id)
    if (totalSpent !== null) {
      console.log(`Site ${site.name} sync complete. New spent = ${totalSpent}`)
    }
  }

  console.log('Done recalculating site budgets.')
}

main()
  .catch(e => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
