import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { ChevronLeft } from 'lucide-react'
import { EditSiteModal } from '@/components/client/EditSiteModal'
import { SiteTabsNav } from '@/components/client/SiteTabsNav'

export default async function SiteLayout({
  children,
  params,
}: {
  children: React.ReactNode
  params: Promise<{ id: string }>
}) {
  const session = await auth()
  if (!session?.user?.companyId) redirect('/login')
  
  const { id } = await params

  const site = await prisma.site.findUnique({
    where: { id, companyId: session.user.companyId, deletedAt: null },
  })

  if (!site) redirect('/sites')

  return (
    <div className="flex flex-col flex-1 h-full max-w-7xl mx-auto w-full px-4 md:px-6 py-6">
      <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
        <div className="flex items-center gap-2.5">
          <Link href="/sites" className="flex items-center gap-1.5 text-xs font-bold text-slate-500 hover:text-slate-700 transition-colors">
            <ChevronLeft className="w-4 h-4" />
            Sites
          </Link>
          <div className="text-lg font-extrabold text-slate-900">{site.name}</div>
          <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-800">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
            {site.status.replace('_', ' ')}
          </div>
          {site.targetEndDate && (
            <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-blue-100 text-blue-800">
              {(() => {
                const diff = Math.ceil((new Date(site.targetEndDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
                return diff < 0 ? `Overdue by ${-diff} days` : `${diff} days left`
              })()}
            </div>
          )}
        </div>
        <div className="flex items-center gap-2">
          <EditSiteModal site={{
            id: site.id,
            name: site.name,
            location: site.location,
            address: site.address,
            projectType: site.projectType,
            clientName: site.clientName,
            clientPhone: site.clientPhone,
            areaSqft: site.areaSqft ? Number(site.areaSqft) : null,
            startDate: site.startDate,
            targetEndDate: site.targetEndDate,
            budget: Number(site.budget),
            status: site.status
          }} />
          <div className="px-3 py-1.5 text-xs font-semibold text-slate-700 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 cursor-pointer shadow-sm transition-colors">
            Share
          </div>
        </div>
      </div>
      
      <SiteTabsNav siteId={site.id} />
      
      {/* Sub-page content */}
      <div className="mt-2">
        {children}
      </div>
    </div>
  )
}
