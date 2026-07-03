import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
  console.log('Recalculating site budgets...')
  const sites = await prisma.site.findMany({
    where: { deletedAt: null }
  })

  for (const site of sites) {
    const expenses = await prisma.expense.aggregate({
      where: { siteId: site.id, approvalStatus: 'APPROVED', deletedAt: null },
      _sum: { amount: true }
    })
    
    const totalSpent = Number(expenses._sum.amount || 0)
    
    if (Number(site.spent) !== totalSpent) {
      console.log(`Updating site ${site.name}: old spent = ${site.spent}, new spent = ${totalSpent}`)
      await prisma.site.update({
        where: { id: site.id },
        data: { spent: totalSpent }
      })
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
