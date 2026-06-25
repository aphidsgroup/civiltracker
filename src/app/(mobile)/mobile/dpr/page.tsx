import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { hasPermission } from '@/lib/permissions'
import { Role } from '@prisma/client'
import { createApprovalAction } from '@/actions/approvals'

export default async function MobileDprPage() {
  const session = await auth()
  if (!session?.user) redirect('/login')

  const companyId = session.user.companyId
  if (!companyId) redirect('/login')

  const sites = await prisma.site.findMany({
    where: { companyId, deletedAt: null },
    select: { id: true, name: true }
  })

  async function submitDpr(formData: FormData) {
    'use server'
    const session = await auth()
    if (!session?.user?.companyId) return
    if (!hasPermission(session.user.role as Role, 'dpr.create')) {
      throw new Error('FORBIDDEN: Missing required permission "dpr.create"')
    }

    const siteId = formData.get('siteId') as string
    const workDone = formData.get('workDone') as string
    const labourCount = parseInt(formData.get('labourCount') as string) || 0
    const delayReason = formData.get('delayReason') as string
    const dateStr = formData.get('date') as string
    const date = dateStr ? new Date(dateStr) : new Date()

    const dpr = await prisma.dailyProgressReport.create({
      data: {
        companyId: session.user.companyId,
        siteId,
        workDone,
        labourCount,
        delayReason,
        date,
        createdById: session.user.id
      }
    })

    await createApprovalAction({
      siteId,
      entityType: 'DPR',
      entityId: dpr.id,
      title: `DPR: ${workDone.substring(0, 35)}...`,
      description: `Work completed: ${workDone}\nLabour count: ${labourCount}\nDelay rationale: ${delayReason || 'None'}`,
      priority: 'NORMAL',
      approvalType: 'OPERATIONAL',
    })

    redirect('/mobile/home')
  }

  return (
    <div className="module" style={{ paddingBottom: '80px' }}>
      <div className="qtitle" style={{ marginBottom: '16px' }}>Submit Daily Progress</div>
      
      <form action={submitDpr} className="card" style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
        <div>
          <label className="ct-label">Site</label>
          <select name="siteId" className="ct-input" required>
            <option value="">Select a site...</option>
            {sites.map(s => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>
        </div>

        <div>
          <label className="ct-label">Date</label>
          <input type="date" name="date" className="ct-input" defaultValue={new Date().toISOString().split('T')[0]} required />
        </div>

        <div>
          <label className="ct-label">Work Done Today</label>
          <textarea name="workDone" className="ct-textarea" placeholder="Describe the activities completed today..." required></textarea>
        </div>

        <div>
          <label className="ct-label">Total Labour Count</label>
          <input type="number" name="labourCount" className="ct-input" placeholder="0" min="0" required />
        </div>

        <div>
          <label className="ct-label">Delay Reasons (if any)</label>
          <input type="text" name="delayReason" className="ct-input" placeholder="e.g. Rain, Material shortage" />
        </div>

        <button type="submit" className="qwide" style={{ marginTop: '8px', width: '100%', justifyContent: 'center' }}>
          Submit DPR
        </button>
      </form>
    </div>
  )
}
