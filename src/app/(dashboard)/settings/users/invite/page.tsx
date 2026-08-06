import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { Role } from '@prisma/client'
import bcrypt from 'bcryptjs'
import { Shield } from 'lucide-react'
import ModuleAccessSelector from '@/components/ui/ModuleAccessSelector'

async function createUser(formData: FormData) {
  'use server'
  const session = await auth()
  if (!session?.user?.companyId) throw new Error('Unauthorized')

  const companyId = session.user.companyId
  const name = formData.get('name') as string
  const email = formData.get('email') as string
  const phone = formData.get('phone') as string
  const password = formData.get('password') as string
  const role = formData.get('role') as Role
  const siteIds = formData.getAll('siteIds') as string[]
  const moduleControlsStr = formData.get('moduleControls') as string | null
  let moduleControls = null
  if (moduleControlsStr) {
    try { moduleControls = JSON.parse(moduleControlsStr) } catch {}
  }

  if (!name || !email || !password || !role) return

  // Check user limit
  const company = await prisma.company.findUnique({
    where: { id: companyId },
    include: { _count: { select: { members: { where: { isActive: true } } } } },
  })

  if (!company) throw new Error('Company not found')
  if (company._count.members >= company.userLimit) {
    throw new Error('User limit reached. Please upgrade your plan.')
  }

  // Check if email exists
  const existing = await prisma.user.findUnique({ where: { email } })
  if (existing) throw new Error('Email already in use')

  const passwordHash = await bcrypt.hash(password, 12)

  await prisma.$transaction(async (tx) => {
    const user = await tx.user.create({
      data: {
        name,
        email,
        phone,
        passwordHash,
        role,
      },
    })

    await tx.companyMember.create({
      data: {
        userId: user.id,
        companyId,
        role,
        siteIds: siteIds.length > 0 ? siteIds : [],
        moduleControls,
        isActive: true,
      },
    })
  })

  redirect('/employees')
}

const roleDescriptions: Record<string, { label: string; desc: string; access: string }> = {
  COMPANY_ADMIN: {
    label: 'Company Admin',
    desc: 'Full access to all features',
    access: 'All modules, all sites, all reports, all settings',
  },
  PROJECT_MANAGER: {
    label: 'Project Manager',
    desc: 'Manages sites, expenses, approvals',
    access: 'Sites, Expenses, Labour, DPR, Reports, Approvals',
  },
  SITE_ENGINEER: {
    label: 'Site Engineer',
    desc: 'Daily site operations',
    access: 'Attendance, DPR, Expenses (submit), Materials',
  },
  SUPERVISOR: {
    label: 'Supervisor',
    desc: 'Labour and attendance tracking',
    access: 'Labour Attendance, DPR (view), Materials (view)',
  },
  ACCOUNTANT: {
    label: 'Accountant',
    desc: 'Financial records and reports',
    access: 'Expenses, Salary, Invoices, Reports',
  },
  PURCHASE_MANAGER: {
    label: 'Purchase Manager',
    desc: 'Purchase orders and materials',
    access: 'Purchase Requests, POs, Vendors, Materials',
  },
}

export default async function InviteUserPage() {
  const session = await auth()
  if (!session?.user?.companyId) redirect('/login')
  const { companyId } = session.user

  const sites = await prisma.site.findMany({
    where: { companyId, deletedAt: null, status: 'ACTIVE' },
    select: { id: true, name: true },
    orderBy: { name: 'asc' },
  })

  return (
    <div className="min-h-screen bg-slate-50/50">
      <div className="flex items-center justify-between px-6 py-4 bg-white border-b border-slate-200">
        <div>
          <h1 className="text-xl font-extrabold text-slate-800">Add New Employee</h1>
          <p className="text-xs text-slate-500 mt-0.5">Create a login account for your team member</p>
        </div>
        <Link href="/employees" className="text-sm text-slate-500 hover:text-slate-900 font-medium transition-colors">← Back to Employees</Link>
      </div>

      <div className="p-6 max-w-2xl mx-auto space-y-5">
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
          <form action={createUser} className="space-y-5">
            {/* Basic Info */}
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-1.5">Full Name *</label>
              <input
                name="name" required placeholder="e.g. Ravi Kumar"
                className="w-full border border-slate-300 rounded-xl px-4 py-2.5 text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-[#fc6e20]/40 focus:border-[#fc6e20] transition-all"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-1.5">Email Address *</label>
                <input
                  name="email" type="email" required placeholder="ravi@yourcompany.com"
                  className="w-full border border-slate-300 rounded-xl px-4 py-2.5 text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-[#fc6e20]/40 focus:border-[#fc6e20] transition-all"
                />
              </div>
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-1.5">Phone Number</label>
                <input
                  name="phone" type="tel" placeholder="+91 98765 43210"
                  className="w-full border border-slate-300 rounded-xl px-4 py-2.5 text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-[#fc6e20]/40 focus:border-[#fc6e20] transition-all"
                />
              </div>
            </div>

            {/* Password */}
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-1.5">
                Login Password *
              </label>
              <input
                name="password" type="password" required minLength={6} placeholder="Set an employee login password"
                className="w-full border border-slate-300 rounded-xl px-4 py-2.5 text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-[#fc6e20]/40 focus:border-[#fc6e20] transition-all font-mono"
              />
              <p className="mt-1 text-xs text-slate-400">
                Share the password with the employee through a secure channel. You can reset it anytime from the Manage page.
              </p>
            </div>

            {/* Role */}
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-1.5">
                <Shield size={12} className="inline mr-1" />
                Role &amp; Access Level *
              </label>
              <select
                name="role" required defaultValue="SITE_ENGINEER"
                className="w-full border border-slate-300 rounded-xl px-4 py-2.5 text-sm text-slate-900 bg-white focus:outline-none focus:ring-2 focus:ring-[#fc6e20]/40 focus:border-[#fc6e20] transition-all"
              >
                <option value="COMPANY_ADMIN">Company Admin — Full Access</option>
                <option value="PROJECT_MANAGER">Project Manager — Sites &amp; Approvals</option>
                <option value="SITE_ENGINEER">Site Engineer — Daily Operations</option>
                <option value="SUPERVISOR">Supervisor — Labour &amp; Attendance</option>
                <option value="ACCOUNTANT">Accountant — Finance &amp; Reports</option>
                <option value="PURCHASE_MANAGER">Purchase Manager — POs &amp; Materials</option>
              </select>
            </div>

            {/* Access descriptions */}
            <div className="bg-slate-50 rounded-xl border border-slate-100 p-4">
              <div className="text-xs font-bold text-slate-600 uppercase tracking-wider mb-3">Access per Role</div>
              <div className="space-y-2">
                {Object.entries(roleDescriptions).map(([key, r]) => (
                  <div key={key} className="flex items-start gap-2.5">
                    <div className="text-xs font-bold text-slate-700 w-36 flex-shrink-0 pt-0.5">{r.label}</div>
                    <div className="text-xs text-slate-500 leading-relaxed">{r.access}</div>
                  </div>
                ))}
              </div>
            </div>

            {/* Site Access */}
            {sites.length > 0 && (
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-1.5">Site Access (Optional)</label>
                <div className="text-xs text-slate-400 mb-2 border-l-2 border-[#fc6e20] pl-2">
                  Select which project sites this employee can access. Leave all unchecked to allow access to all sites.
                </div>
                <div className="space-y-2 max-h-44 overflow-y-auto border border-slate-200 rounded-xl p-3 bg-slate-50">
                  {sites.map(site => (
                    <label key={site.id} className="flex items-center gap-3 p-2 hover:bg-slate-100 rounded-lg cursor-pointer">
                      <input
                        type="checkbox"
                        name="siteIds"
                        value={site.id}
                        className="w-4 h-4 text-[#fc6e20] border-slate-300 rounded focus:ring-[#fc6e20]"
                      />
                      <span className="text-sm font-medium text-slate-800">{site.name}</span>
                    </label>
                  ))}
                </div>
              </div>
            )}

            {/* Module Controls */}
            <div className="pt-2">
              <ModuleAccessSelector />
            </div>

            <div className="pt-2 flex items-center gap-3 border-t border-slate-100">
              <button
                type="submit"
                className="px-6 py-2.5 bg-[#fc6e20] hover:bg-[#e85b0d] text-white text-sm font-bold rounded-xl shadow-sm transition-colors cursor-pointer"
              >
                Create Employee Account
              </button>
              <Link
                href="/employees"
                className="px-6 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-sm font-medium rounded-xl transition-colors"
              >
                Cancel
              </Link>
            </div>
          </form>
        </div>
      </div>
    </div>
  )
}
