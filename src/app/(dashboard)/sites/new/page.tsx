import prisma from '@/lib/prisma'
import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { exitDeniedPage, resolveTenantPageAccess } from '@/lib/pages/tenant-page-access'
import { requireTenantMutation } from '@/lib/auth/site-mutation'
import { checklistTemplateTree, createSiteForTenant } from '@/lib/sites/create-site'
import { parseNewSiteForm } from '@/lib/validation/sites'
import { NewSiteClient } from './NewSiteClient'

export const dynamic = 'force-dynamic'

/**
 * A public POST endpoint like any Server Action, so it is not a create path of its own:
 * the live `sites.create` + SITES gate runs before the form is read, the form is mapped
 * onto the strict `createSite` payload, and the write goes through the shared
 * `createSiteForTenant` (assignees, site limit, duplicate name, checklist snapshot and
 * required audit record in one transaction).
 */
async function createSiteAction(formData: FormData) {
  'use server'
  const user = await requireTenantMutation('sites.create', 'SITES')
  const { site, templateId, selectedTaskIds } = parseNewSiteForm(formData)
  await createSiteForTenant(user, site, { templateId, selectedTaskIds })

  revalidatePath('/sites')
  redirect('/sites')
}

export default async function NewSitePage() {
  const gate = await resolveTenantPageAccess({ grants: [{ permission: 'sites.create', module: 'SITES' }] })
  if (gate.status === 'denied') exitDeniedPage(gate, '/sites/new')
  const { companyId } = gate.access

  // Load the best available template: company-cloned first, then global master
  const template = await prisma.checklistTemplate.findFirst({
    where: {
      OR: [
        { companyId, isGlobal: false },
        { isGlobal: true },
      ]
    },
    include: checklistTemplateTree,
    orderBy: [
      { isGlobal: 'asc' }, // company templates first (isGlobal=false → 'asc' sorts false before true)
      { createdAt: 'desc' }
    ]
  })

  return (
    <>
      <div className="flex items-center justify-between pb-6 border-b border-slate-200 mb-8">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">New Site</h1>
          <p className="text-sm text-slate-500 mt-1">Add a new construction site to your company</p>
        </div>
      </div>
      <NewSiteClient template={template} createSiteAction={createSiteAction} />
    </>
  )
}
