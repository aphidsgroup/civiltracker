import prisma from './prisma'

/**
 * Recalculates the exact total spent on a given site
 * by summing approved expenses and labour advances.
 */
export async function syncSiteBudget(siteId: string) {
  try {
    // 1. Sum Approved Expenses
    const expenses = await prisma.expense.aggregate({
      where: { siteId, approvalStatus: 'APPROVED', deletedAt: null },
      _sum: { amount: true }
    })
    
    // 2. Sum Labour Advances
    const advances = await prisma.labourAttendance.aggregate({
      where: { siteId, advance: { gt: 0 } },
      _sum: { advance: true }
    })
    
    // Total spent
    const totalSpent = Number(expenses._sum.amount || 0) + Number(advances._sum.advance || 0)
    
    // Update site
    await prisma.site.update({
      where: { id: siteId },
      data: { spent: totalSpent }
    })
    
    return totalSpent
  } catch (err) {
    console.error(`Failed to sync budget for site ${siteId}`, err)
    return null
  }
}
