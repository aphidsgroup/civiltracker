import { auth } from '@/lib/auth'
import { createDpr } from '@/actions/dpr'
import { prisma } from '@/lib/prisma'
import { redirect } from 'next/navigation'
import Link from 'next/link'
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
    await createDpr(formData)
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
