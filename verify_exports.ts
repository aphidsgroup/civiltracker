import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const exports = await prisma.reportExport.findMany({
    orderBy: { createdAt: 'desc' },
    take: 5,
    include: { generatedBy: true },
  });

  console.log('--- RECENT EXPORTS ---');
  for (const exp of exports) {
    console.log(`[${exp.createdAt.toISOString()}] ${exp.reportType} (${exp.format}) by ${exp.generatedBy.email}`);
  }

  const audits = await prisma.auditLog.findMany({
    where: {
      action: {
        in: ['REPORT_EXPORTED_PDF', 'REPORT_EXPORTED_EXCEL']
      }
    },
    orderBy: { createdAt: 'desc' },
    take: 5,
  });

  console.log('--- RECENT AUDIT LOGS ---');
  for (const log of audits) {
    console.log(`[${log.createdAt.toISOString()}] Action: ${log.action}, Details: ${log.details}`);
  }

  if (exports.length > 0 && audits.length > 0) {
    console.log('✅ Export logging verified successfully.');
    process.exit(0);
  } else {
    console.log('❌ Export logging verification failed: missing records.');
    process.exit(1);
  }
}

main().catch(console.error).finally(() => prisma.$disconnect());
