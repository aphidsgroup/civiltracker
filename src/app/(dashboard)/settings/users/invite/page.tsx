import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { Role } from '@prisma/client'
import bcrypt from 'bcryptjs'

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
        isActive: true,
      },
    })
  })

  redirect('/settings/users')
}

export default async function InviteUserPage() {
  const session = await auth()
  if (!session?.user?.companyId) redirect('/login')

  return (
    <div className="min-h-screen bg-gray-50/50">
      <div className="flex items-center justify-between px-6 py-4 bg-white border-b border-gray-200">
        <h1 className="text-xl font-semibold text-gray-900">Create New User</h1>
      </div>
      
      <div className="p-6 max-w-2xl mx-auto">
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6">
          <form action={createUser}>
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">Full Name *</label>
                <input name="name" required placeholder="John Doe"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-[#fc6e20] focus:border-transparent" />
              </div>
              
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">Email Address *</label>
                <input name="email" type="email" required placeholder="john@company.com"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-[#fc6e20] focus:border-transparent" />
              </div>
              
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">Phone Number</label>
                <input name="phone" type="tel" placeholder="+91 98765 43210"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-[#fc6e20] focus:border-transparent" />
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">Password *</label>
                <input name="password" type="password" required placeholder="Enter login password"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-[#fc6e20] focus:border-transparent" />
                <p className="mt-1 text-xs text-gray-500">Provide this password to the user so they can log in.</p>
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">Role *</label>
                <select name="role" required defaultValue="SITE_ENGINEER"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-[#fc6e20] focus:border-transparent">
                  <option value="COMPANY_ADMIN">Company Admin</option>
                  <option value="PROJECT_MANAGER">Project Manager</option>
                  <option value="SITE_ENGINEER">Site Engineer</option>
                  <option value="SUPERVISOR">Supervisor</option>
                  <option value="ACCOUNTANT">Accountant</option>
                  <option value="CLIENT">Client</option>
                </select>
              </div>
            </div>

            <div className="mt-8 flex items-center gap-3 border-t border-gray-100 pt-5">
              <button type="submit"
                className="px-5 py-2.5 bg-[#fc6e20] hover:bg-[#e85b0d] text-white text-sm font-semibold rounded-lg shadow-sm transition-colors cursor-pointer">
                Create User
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
