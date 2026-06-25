import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { redirect } from 'next/navigation'
import { formatDate } from '@/lib/utils'

export const metadata = { title: 'DPR | Civil Tracker' }

export default async function DprPage() {
  const session = await auth()
  if (!session?.user?.companyId) redirect('/login')
  const { companyId } = session.user

  const dprs = await prisma.dailyProgressReport.findMany({
    where: { companyId },
    include: {
      site: { select: { name: true } },
      createdBy: { select: { name: true } },
    },
    orderBy: { date: 'desc' },
    take: 30,
  })

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '22px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <h1 style={{ fontSize: '22px', fontWeight: 800, margin: '0 0 3px', letterSpacing: '-0.02em' }}>Daily Progress Reports</h1>
          <p style={{ color: 'var(--mut)', fontSize: '13px', margin: 0 }}>{dprs.length} reports</p>
        </div>
        <a href="/mobile/dpr" className="btn-primary" style={{ textDecoration: 'none' }}>+ Add DPR</a>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
        {dprs.map(dpr => (
          <div key={dpr.id} className="ct-card" style={{ padding: '18px 20px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '12px', marginBottom: '10px' }}>
              <div>
                <div style={{ fontWeight: 800, fontSize: '14.5px', marginBottom: '3px' }}>{dpr.site.name}</div>
                <div style={{ fontSize: '12px', color: 'var(--mut)', fontWeight: 500 }}>
                  {formatDate(dpr.date)} · Submitted by {dpr.createdBy.name}
                </div>
              </div>
              <div style={{ display: 'flex', gap: '8px', flexShrink: 0 }}>
                {dpr.labourCount !== null && <span className="chip chip-mut">{dpr.labourCount} workers</span>}
              </div>
            </div>
            {dpr.workDone && (
              <div style={{ fontSize: '13px', color: 'var(--ink)', fontWeight: 500, lineHeight: 1.55, background: '#f5f8fc', borderRadius: '10px', padding: '10px 12px' }}>
                {dpr.workDone}
              </div>
            )}
            {dpr.delayReason && (
              <div style={{ marginTop: '8px', fontSize: '12.5px', color: 'var(--red)', fontWeight: 600 }}>
                ⚠️ Delay: {dpr.delayReason}
              </div>
            )}
          </div>
        ))}
        {dprs.length === 0 && (
          <div className="ct-card" style={{ padding: '48px', textAlign: 'center' }}>
            <div style={{ fontSize: '40px', marginBottom: '12px' }}>📝</div>
            <div style={{ fontWeight: 700, fontSize: '15px' }}>No DPRs yet</div>
            <div style={{ color: 'var(--mut)', fontSize: '13px' }}>Add your first daily progress report from mobile</div>
          </div>
        )}
      </div>
    </div>
  )
}
