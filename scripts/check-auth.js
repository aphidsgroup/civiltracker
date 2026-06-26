require('dotenv').config({ path: '.env' })
const { PrismaClient } = require('@prisma/client')
const bcrypt = require('bcryptjs')

const p = new PrismaClient()

async function main() {
  // Check users exist and are active
  const users = await p.user.findMany({
    where: { email: { in: ['admin@civiltracker.in', 'arun@madras-crafters.in', 'murugan@madras-crafters.in'] } },
    select: { id: true, email: true, name: true, isActive: true, role: true, passwordHash: true }
  })
  
  console.log('\n=== USERS IN DB ===')
  for (const u of users) {
    const match = await bcrypt.compare('Admin@123456', u.passwordHash)
    console.log(`${u.email} | active=${u.isActive} | role=${u.role} | password_ok=${match}`)
  }

  // Check companyMembers
  const members = await p.companyMember.findMany({
    where: { user: { email: { in: ['arun@madras-crafters.in', 'murugan@madras-crafters.in'] } } },
    include: { user: { select: { email: true } }, company: { select: { name: true, slug: true } } }
  })
  console.log('\n=== COMPANY MEMBERS ===')
  for (const m of members) {
    console.log(`${m.user.email} -> ${m.company.name} (${m.company.slug}) | isActive=${m.isActive}`)
  }

  // Check NEXTAUTH_SECRET and NEXTAUTH_URL
  console.log('\n=== ENV ===')
  console.log('NEXTAUTH_SECRET set:', !!process.env.NEXTAUTH_SECRET)
  console.log('NEXTAUTH_URL:', process.env.NEXTAUTH_URL)
}

main().catch(console.error).finally(() => p.$disconnect())
