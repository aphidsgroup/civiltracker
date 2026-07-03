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
    
    // 2. Calculate Labour Salaries Earned (Incurred Cost)
    const attendances = await prisma.labourAttendance.findMany({
      where: { siteId, status: { in: ['PRESENT', 'HALF_DAY'] } },
      include: { labour: { select: { dailyWage: true } } }
    })
    
    let totalSalaries = 0
    for (const att of attendances) {
      const wage = Number(att.labour.dailyWage) || 0
      if (att.status === 'PRESENT') totalSalaries += wage
      else if (att.status === 'HALF_DAY') totalSalaries += (wage / 2)
      
      // Calculate overtime (assuming standard 8 hour day if no specific overtime rate is defined)
      if (att.overtimeHours > 0) {
        totalSalaries += (wage / 8) * att.overtimeHours
      }
    }
    
    // Total spent is approved expenses + total labour cost incurred
    const totalSpent = Number(expenses._sum.amount || 0) + totalSalaries
    
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
