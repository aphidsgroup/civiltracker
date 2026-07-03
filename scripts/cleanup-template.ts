import prisma from '../src/lib/prisma'
prisma.checklistTemplate.delete({ where: { id: 'cmr5gpnib0000shb4j2l0wfoy' } })
  .then(() => console.log('Deleted duplicate template'))
  .catch(console.error)
  .finally(() => prisma.$disconnect())
