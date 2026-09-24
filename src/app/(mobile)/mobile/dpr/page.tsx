import { requireUser } from '@/lib/auth/require-user'
import { getRoleRedirect, hasPermission } from '@/lib/permissions'
import { createDpr } from '@/actions/dpr'
import { prisma } from '@/lib/prisma'
import { redirect } from 'next/navigation'
import { ClipboardList } from 'lucide-react'
import DprFormClient from './DprFormClient'

export default async function MobileDprPage({ searchParams }: { searchParams: Promise<{ siteId?: string }> }) {
  // Live principal, never the JWT claims; revoked members throw here, before any read.
  const user = await requireUser()
  // SUPER_ADMIN has no company context and `createDpr` refuses it anyway.
  if (user.role === 'SUPER_ADMIN') redirect('/super-admin/dashboard')
  if (!user.companyId) redirect('/login')
  if (!hasPermission(user.role, 'dpr.create')) redirect(getRoleRedirect(user.role))

  const { siteId } = await searchParams

  const sites = await prisma.site.findMany({
    where: { companyId: user.companyId, deletedAt: null, status: 'ACTIVE' },
    select: { id: true, name: true }
  })
  const defaultSiteId = sites.some((site) => site.id === siteId) ? siteId : undefined

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
      
      <DprFormClient sites={sites} defaultSiteId={defaultSiteId} submitAction={submitDpr} />
    </div>
  )
}
