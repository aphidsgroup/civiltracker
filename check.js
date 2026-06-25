// eslint-disable-next-line @typescript-eslint/no-require-imports
const { PrismaClient } = require('@prisma/client'); 
const prisma = new PrismaClient(); 

async function check() { 
  const cols = await prisma.$queryRaw`SELECT column_name FROM information_schema.columns WHERE table_name = 'Approval'`; 
  console.dir(cols, {depth:null});
  
  const counts = {
    Company: await prisma.company.count(),
    User: await prisma.user.count(),
    Site: await prisma.site.count(),
    Expense: await prisma.expense.count(),
    BillAttachment: await prisma.billAttachment.count(),
    Approval: await prisma.approval.count(),
    ApprovalComment: await prisma.approvalComment.count(),
    ApprovalTimeline: await prisma.approvalTimeline.count()
  };
  console.log("Counts:", counts);

  await prisma.$disconnect(); 
} 
check();
