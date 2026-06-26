require('dotenv').config({ path: '.env' })
const { PrismaClient } = require('@prisma/client')
const p = new PrismaClient()

p.company.findFirst({
  select: { id: true, status: true, plan: true, storageUsed: true, deletedAt: true, slug: true, userLimit: true, siteLimit: true }
})
.then(c => {
  console.log('Company sample:', JSON.stringify(c, null, 2))
})
.catch(e => {
  console.error('ERROR:', e.message)
})
.finally(() => p.$disconnect())
