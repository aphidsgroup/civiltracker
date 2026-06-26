import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { redirect, notFound } from 'next/navigation'
import Link from 'next/link'
import { revalidatePath } from 'next/cache'

async function updateUser(formData: FormData) {
  'use server'
  const session = await auth()
  if (!session?.user?.companyId) return

  const memberId = formData.get('memberId') as string
  const role = formData.get('role') as any
  const isActive = formData.get('isActive') === 'true'
  const siteIds = formData.getAll('siteIds') as string[]

  await prisma.companyMember.update({
    where: { id: memberId, companyId: session.user.companyId },
    data: { role, isActive, siteIds },
  })

  revalidatePath('/settings/users')
  redirect('/settings/users')
}

export default async function EditUserPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session?.user?.companyId) redirect('/login')
  
  const resolvedParams = await params
  const memberId = resolvedParams.id

  const member = await prisma.companyMember.findUnique({
    where: { id: memberId, companyId: session.user.companyId },
    include: { user: true }
  })

  if (!member) return notFound()

  const sites = await prisma.site.findMany({
    where: { companyId: session.user.companyId, status: 'ACTIVE' },
    select: { id: true, name: true }
  })

  return (
    <div className="min-h-screen bg-gray-50/50">
      <div className="flex items-center justify-between px-6 py-4 bg-white border-b border-gray-200">
        <h1 className="text-xl font-semibold text-gray-900">Manage Team Member</h1>
      </div>
      
      <div className="p-6 max-w-2xl mx-auto">
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6">
          <form action={updateUser}>
            <input type="hidden" name="memberId" value={member.id} />
            
            <div className="space-y-6">
              <div className="bg-slate-50 p-4 rounded-lg border border-slate-100 mb-6">
                <div className="text-sm font-semibold text-slate-900">{member.user.name}</div>
                <div className="text-xs text-slate-500">{member.user.email} • {member.user.phone || 'No phone'}</div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">Role *</label>
                  <select name="role" required defaultValue={member.role}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent">
                    <option value="COMPANY_ADMIN">Company Admin</option>
                    <option value="PROJECT_MANAGER">Project Manager</option>
                    <option value="SITE_ENGINEER">Site Engineer</option>
                    <option value="SUPERVISOR">Supervisor</option>
                    <option value="ACCOUNTANT">Accountant</option>
                    <option value="PURCHASE_MANAGER">Purchase Manager</option>
                  </select>
                </div>
                
                <div>
                  <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">Status *</label>
                  <select name="isActive" required defaultValue={member.isActive ? 'true' : 'false'}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent">
                    <option value="true">Active (Can Login)</option>
                    <option value="false">Inactive (Suspended)</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Assigned Sites (Visibility)</label>
                <div className="text-xs text-gray-500 mb-3 border-l-2 border-amber-400 pl-2">
                  Select which projects this user can access in the mobile PWA. If none are selected, they may not see any projects unless globally assigned.
                </div>
                <div className="space-y-2 max-h-48 overflow-y-auto border border-gray-200 rounded-lg p-3 bg-slate-50">
                  {sites.length === 0 && <div className="text-xs text-gray-400">No active sites found.</div>}
                  {sites.map(site => (
                    <label key={site.id} className="flex items-center gap-3 p-2 hover:bg-slate-100 rounded cursor-pointer">
                      <input type="checkbox" name="siteIds" value={site.id} defaultChecked={member.siteIds.includes(site.id)}
                        className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500" />
                      <span className="text-sm font-medium text-gray-800">{site.name}</span>
                    </label>
                  ))}
                </div>
              </div>
            </div>

            <div className="mt-8 flex items-center gap-3 border-t border-gray-100 pt-5">
              <button type="submit"
                className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold rounded-lg shadow-sm transition-colors cursor-pointer">
                Save Changes
              </button>
              <Link href="/settings/users"
                className="px-5 py-2.5 bg-gray-100 hover:bg-gray-200 text-gray-700 text-sm font-medium rounded-lg transition-colors inline-block">
                Cancel
              </Link>
            </div>
          </form>
        </div>
      </div>
    </div>
  )
}
