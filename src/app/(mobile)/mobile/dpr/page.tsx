import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { hasPermission } from '@/lib/permissions'
import { Role } from '@prisma/client'
import { createApprovalAction } from '@/actions/approvals'
import { ClipboardList, Send } from 'lucide-react'

export default async function MobileDprPage({ searchParams }: { searchParams: Promise<{ siteId?: string }> }) {
  const session = await auth()
  if (!session?.user) redirect('/login')

  const companyId = session.user.companyId
  if (!companyId) redirect('/login')

  const { siteId } = await searchParams

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
    <div className="p-4 pb-24 max-w-lg mx-auto bg-gray-50 min-h-screen">
      <div className="flex items-center gap-2.5 mb-5 pt-2">
        <div className="p-2 bg-amber-50 text-amber-600 rounded-xl">
          <ClipboardList className="w-5 h-5" />
        </div>
        <h1 className="text-lg font-bold text-gray-900">Submit Daily Progress</h1>
      </div>
      
      <form action={submitDpr} className="bg-white p-5 rounded-2xl shadow-sm border border-gray-100 flex flex-col gap-4">
        <div>
          <label className="block text-xs font-semibold uppercase tracking-wider text-gray-600 mb-1.5">Site</label>
          <select name="siteId" defaultValue={siteId || ""} className="w-full px-3.5 py-2.5 bg-white border border-gray-200 rounded-xl text-sm font-medium text-gray-900 focus:outline-none focus:ring-2 focus:ring-amber-500 shadow-sm" required>
            <option value="">Select a site...</option>
            {sites.map(s => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-xs font-semibold uppercase tracking-wider text-gray-600 mb-1.5">Date</label>
          <input type="date" name="date" className="w-full px-3.5 py-2.5 bg-white border border-gray-200 rounded-xl text-sm font-medium text-gray-900 focus:outline-none focus:ring-2 focus:ring-amber-500 shadow-sm" defaultValue={new Date().toISOString().split('T')[0]} required />
        </div>

        <div>
          <label className="block text-xs font-semibold uppercase tracking-wider text-gray-600 mb-1.5">Work Done Today</label>
          <textarea name="workDone" className="w-full px-3.5 py-2.5 bg-white border border-gray-200 rounded-xl text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-amber-500 shadow-sm resize-none" rows={3} placeholder="Describe the activities completed today..." required></textarea>
        </div>

        <div>
          <label className="block text-xs font-semibold uppercase tracking-wider text-gray-600 mb-1.5">Total Labour Count</label>
          <input type="number" name="labourCount" className="w-full px-3.5 py-2.5 bg-white border border-gray-200 rounded-xl text-sm font-medium text-gray-900 focus:outline-none focus:ring-2 focus:ring-amber-500 shadow-sm" placeholder="0" min="0" required />
        </div>

        <div>
          <label className="block text-xs font-semibold uppercase tracking-wider text-gray-600 mb-1.5">Delay Reasons (if any)</label>
          <input type="text" name="delayReason" className="w-full px-3.5 py-2.5 bg-white border border-gray-200 rounded-xl text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-amber-500 shadow-sm" placeholder="e.g. Rain, Material shortage" />
        </div>

        <button type="submit" className="w-full mt-2 py-3.5 px-4 bg-amber-500 hover:bg-amber-600 active:bg-amber-700 text-white font-bold rounded-xl text-sm shadow-md transition-colors flex items-center justify-center gap-2">
          <Send className="w-4 h-4" />
          Submit DPR
        </button>
      </form>
    </div>
  )
}
