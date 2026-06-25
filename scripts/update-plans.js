require('dotenv').config({ path: '.env' });
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function main() {
  const c = await prisma.company.findMany({
    select: { name: true, plan: true, id: true, slug: true }
  });
  console.log(c);
  
  // If we find them, update them to ENTERPRISE or PRO
  for (const comp of c) {
    if (comp.plan === 'TRIAL') {
      const plan = comp.slug === 'buildogram' ? 'ENTERPRISE' : 'PRO'; // educated guess
      await prisma.company.update({
        where: { id: comp.id },
        data: { plan }
      });
      console.log(`Updated ${comp.name} to ${plan}`);
    }
  }
}

main().then(() => prisma.$disconnect());
