
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
async function test() {
  try {
    const today = new Date();
    today.setHours(0,0,0,0);
    console.log('Querying...');
    const data = await prisma.labour.findMany({ take: 1, include: { attendance: { where: { date: today }, take: 1 } } });
    console.log('Result:', data);
  } catch (e) {
    console.error('ERROR:', e);
  } finally {
    await prisma.$disconnect();
  }
}
test();

