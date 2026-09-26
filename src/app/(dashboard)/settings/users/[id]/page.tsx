import { prisma } from '@/lib/prisma'
import { redirect, notFound } from 'next/navigation'
import { exitDeniedPage, liveCompanySiteWhere, resolveTenantPageAccess } from '@/lib/pages/tenant-page-access'
import Link from 'next/link'
import { revalidatePath } from 'next/cache'
import { UserMinus, Eye } from 'lucide-react'
import { removeEmployeeFromCompany, resetUserPassword, updateEmployee } from '@/actions/users'
import DangerConfirmSubmit from '@/components/ui/DangerConfirmSubmit'
import ModuleAccessSelector from '@/components/ui/ModuleAccessSelector'

export const dynamic = 'force-dynamic'

async function handlePasswordReset(formData: FormData) {
  'use server'
  const userId = formData.get('userId') as string
  const newPassword = formData.get('newPassword') as string
  const confirmPassword = formData.get('confirmPassword') as string
  if (newPassword !== confirmPassword) {
    throw new Error('Passwords do not match.')
  }
  await resetUserPassword(userId, newPassword)
  revalidatePath('/settings/users')
  redirect('/settings/users')
}

export default async function EditUserPage({ params }: { params: Promise<{ id: string }> }) {
  const resolvedParams = await params
  const memberId = resolvedParams.id

  // Same live permission the member actions on this page enforce.
  const gate = await resolveTenantPageAccess({ grants: [{ permission: 'company.manage' }] })
  if (gate.status === 'denied') exitDeniedPage(gate, `/settings/users/${memberId}`)
  const { companyId } = gate.access

  // A membership of another company answers exactly like a missing one.
  const member = await prisma.companyMember.findFirst({
    where: { id: memberId, companyId },
    include: { user: true },
  })

  if (!member) return notFound()

  const sites = await prisma.site.findMany({
    where: { ...liveCompanySiteWhere(companyId), status: 'ACTIVE' },
    select: { id: true, name: true },
  })

  return (
    <div className="min-h-screen bg-gray-50/50">
      <div className="flex items-center justify-between px-6 py-4 bg-white border-b border-gray-200">
        <h1 className="text-xl font-semibold text-gray-900">Manage Team Member</h1>
      </div>

      <div className="p-6 max-w-2xl mx-auto space-y-5">
        {/* Role & Status Form */}
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6">
          <h2 className="text-sm font-bold text-slate-700 mb-4">Profile & Access</h2>
          <form action={updateEmployee}>
            <input type="hidden" name="memberId" value={member.id} />

            <div className="space-y-6">
              <div className="bg-slate-50 p-4 rounded-lg border border-slate-100">
                <div className="text-sm font-semibold text-slate-900">{member.user.name}</div>
                <div className="text-xs text-slate-500">{member.user.email} · {member.user.phone || 'No phone'}</div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">Role *</label>
                  <select
                    name="role"
                    required
                    defaultValue={member.role}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  >
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
                  <select
                    name="isActive"
                    required
                    defaultValue={member.isActive ? 'true' : 'false'}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  >
                    <option value="true">Active (Can Login)</option>
                    <option value="false">Inactive (Suspended)</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Assigned Sites (Visibility)</label>
                <div className="text-xs text-gray-500 mb-3 border-l-2 border-amber-400 pl-2">
                  Select which projects this user can access in the mobile app.
                </div>
                <div className="space-y-2 max-h-48 overflow-y-auto border border-gray-200 rounded-lg p-3 bg-slate-50">
                  {sites.length === 0 && <div className="text-xs text-gray-400">No active sites found.</div>}
                  {sites.map(site => (
                    <label key={site.id} className="flex items-center gap-3 p-2 hover:bg-slate-100 rounded cursor-pointer">
                      <input
                        type="checkbox"
                        name="siteIds"
                        value={site.id}
                        defaultChecked={member.siteIds.includes(site.id)}
                        className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                      />
                      <span className="text-sm font-medium text-gray-800">{site.name}</span>
                    </label>
                  ))}
                </div>
              </div>
            </div>

            {/* Module Controls */}
            <div className="pt-2 border-t border-gray-100">
              <ModuleAccessSelector initialModules={member.moduleControls as string[] | undefined} />
            </div>

            <div className="mt-6 flex items-center gap-3 border-t border-gray-100 pt-5">
              <button
                type="submit"
                className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold rounded-lg shadow-sm transition-colors cursor-pointer"
              >
                Save Changes
              </button>
              <Link
                href="/settings/users"
                className="px-5 py-2.5 bg-gray-100 hover:bg-gray-200 text-gray-700 text-sm font-medium rounded-lg transition-colors inline-block"
              >
                Cancel
              </Link>
            </div>
          </form>
        </div>

        {/* Password Reset Section */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="flex items-center gap-3 px-6 py-4 border-b border-slate-100 bg-amber-50/60">
            <div className="w-9 h-9 rounded-xl bg-amber-100 flex items-center justify-center flex-shrink-0">
              <Eye size={16} className="text-amber-600" />
            </div>
            <div>
              <div className="text-sm font-extrabold text-slate-800">Set / View Password</div>
              <div className="text-xs text-slate-500 font-medium">Enter a new password for this user. It is masked by default.</div>
            </div>
          </div>

          <form action={handlePasswordReset} className="p-6 space-y-4">
            <input type="hidden" name="userId" value={member.userId} />
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-1.5">New Password</label>
              <input
                type="password"
                name="newPassword"
                required
                minLength={6}
                placeholder="Type new password"
                className="w-full border border-slate-300 rounded-xl px-4 py-2.5 text-sm text-slate-900 bg-white focus:outline-none focus:ring-2 focus:ring-amber-400/40 focus:border-amber-400 transition-all font-mono"
              />
            </div>
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-1.5">Confirm Password</label>
              <input
                type="password"
                name="confirmPassword"
                required
                minLength={6}
                placeholder="Re-type to confirm"
                className="w-full border border-slate-300 rounded-xl px-4 py-2.5 text-sm text-slate-900 bg-white focus:outline-none focus:ring-2 focus:ring-amber-400/40 focus:border-amber-400 transition-all font-mono"
              />
            </div>
            <p className="text-xs text-slate-400">After setting, share the new password with the user through a secure channel.</p>
            <div className="pt-1 flex gap-3">
              <button
                type="submit"
                className="flex-1 py-2.5 bg-amber-500 hover:bg-amber-600 text-white text-sm font-bold rounded-xl transition-colors cursor-pointer shadow-sm"
              >
                Reset Password
              </button>
              <Link
                href="/settings/users"
                className="flex-1 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-sm font-semibold rounded-xl transition-colors text-center"
              >
                Cancel
              </Link>
            </div>
          </form>
        </div>
        {/* Remove from Company — soft delete, keeps all data */}
        <div className="bg-rose-50 rounded-xl border border-rose-200 shadow-sm p-6">
          <div className="flex items-start gap-3">
            <div className="w-9 h-9 rounded-xl bg-rose-100 flex items-center justify-center flex-shrink-0 mt-0.5">
              <UserMinus size={16} className="text-rose-600" />
            </div>
            <div className="flex-1">
              <div className="text-sm font-extrabold text-rose-800">Remove from Company</div>
              <div className="text-xs text-rose-600/80 mt-0.5 leading-relaxed">
                Deactivates this member&apos;s access. Their account and <strong>all data they entered</strong> (expenses, DPRs, attendance) is permanently kept.
              </div>
              <form action={removeEmployeeFromCompany} className="mt-4">
                <input type="hidden" name="memberId" value={member.id} />
                <DangerConfirmSubmit
                  entityLabel={member.user.name ?? member.user.email}
                  confirmText={member.user.name ?? member.user.email}
                  buttonText="Remove from Company"
                  helperText="Type the exact team member name or email to deactivate their company access while keeping all historical data."
                  variant="card"
                />
              </form>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
