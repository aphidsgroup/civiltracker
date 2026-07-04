import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { hasPermission } from '@/lib/permissions'
import { Role } from '@prisma/client'
import { createApprovalAction } from '@/actions/approvals'
import { ClipboardList, Send } from 'lucide-react'
import DprFormClient from './DprFormClient'

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
      
      <DprFormClient sites={sites} defaultSiteId={siteId} submitAction={submitDpr} />
    </div>
  )
}
