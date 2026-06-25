import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { redirect } from 'next/navigation'
import AttendanceMarker from '@/components/mobile/AttendanceMarker'

export default async function AttendancePage() {
  const session = await auth()
  if (!session?.user?.companyId) redirect('/login')
  const { companyId } = session.user

  const today = new Date(); today.setHours(0, 0, 0, 0)

  const labour = await prisma.labour.findMany({
    where: { companyId, isActive: true },
    include: {
      attendance: { where: { date: today }, take: 1 },
      site: { select: { name: true } },
    },
    orderBy: { name: 'asc' },
    take: 50,
  })

  return (
    <div style={{ padding: '16px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '20px' }}>
        <h1 style={{ fontSize: '18px', fontWeight: 800, margin: 0 }}>Attendance</h1>
        <span className="chip chip-mut">{new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })}</span>
      </div>
      <div style={{ marginBottom: '10px', fontSize: '12.5px', color: 'var(--mut)', fontWeight: 600 }}>
        {labour.length} workers on roster
      </div>
      <AttendanceMarker labour={labour.map(l => ({ id: l.id, name: l.name, trade: l.trade, siteName: l.site.name, attendance: l.attendance[0] ?? null }))} />
    </div>
  )
}
