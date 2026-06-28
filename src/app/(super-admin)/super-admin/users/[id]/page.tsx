import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { redirect, notFound } from 'next/navigation'
import Link from 'next/link'
import { revalidatePath } from 'next/cache'
import { ArrowLeft, Shield, User, Building2 } from 'lucide-react'
import { resetUserPassword } from '@/actions/users'

async function handleReset(formData: FormData) {
  'use server'
  const userId = formData.get('userId') as string
  const newPassword = formData.get('newPassword') as string
  const confirmPassword = formData.get('confirmPassword') as string
  if (newPassword !== confirmPassword) throw new Error('Passwords do not match.')
  await resetUserPassword(userId, newPassword)
  revalidatePath('/super-admin/users')
  redirect('/super-admin/users')
}

export default async function SAUserDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (session?.user?.role !== 'SUPER_ADMIN') redirect('/dashboard')

  const { id: userId } = await params

  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: {
      companyMembers: {
        include: { company: { select: { id: true, name: true, status: true } } },
        take: 1,
      },
    },
  })
  if (!user) return notFound()

  const member = user.companyMembers[0]

  return (
    <div className="min-h-screen bg-slate-50/50">
      {/* Header */}
      <div className="flex items-center gap-4 px-8 py-5 bg-white border-b border-slate-200">
        <Link
          href="/super-admin/users"
          className="w-9 h-9 rounded-xl bg-slate-100 flex items-center justify-center hover:bg-slate-200 transition-colors"
        >
          <ArrowLeft size={16} className="text-slate-600" />
        </Link>
        <div>
          <h1 className="text-lg font-extrabold text-slate-800 tracking-tight">Manage User</h1>
          <p className="text-xs text-slate-500 font-medium mt-0.5">Super Admin — Reset Password & View Details</p>
        </div>
      </div>

      <div className="p-8 max-w-2xl mx-auto space-y-5">
        {/* User Profile Card */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-[#fc6e20] to-[#e85b0d] flex items-center justify-center text-white font-extrabold text-xl flex-shrink-0">
              {(user.name ?? user.email).substring(0, 2).toUpperCase()}
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-[17px] font-extrabold text-slate-900 leading-none">{user.name ?? '—'}</div>
              <div className="text-sm text-slate-500 font-medium mt-1">{user.email}</div>
              {user.phone && <div className="text-xs text-slate-400 font-medium mt-0.5">{user.phone}</div>}
            </div>
            <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold border ${
              user.isActive ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-rose-50 text-rose-700 border-rose-200'
            }`}>
              <span className="w-1.5 h-1.5 rounded-full bg-current" />
              {user.isActive ? 'Active' : 'Inactive'}
            </span>
          </div>

          <div className="grid grid-cols-2 gap-3 mt-5 pt-5 border-t border-slate-100">
            <div className="flex items-center gap-2.5 p-3 bg-slate-50 rounded-xl">
              <User size={14} className="text-[#fc6e20] flex-shrink-0" />
              <div>
                <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Role</div>
                <div className="text-sm font-bold text-slate-800 mt-0.5">{user.role.replace(/_/g, ' ')}</div>
              </div>
            </div>
            {member && (
              <div className="flex items-center gap-2.5 p-3 bg-slate-50 rounded-xl">
                <Building2 size={14} className="text-[#fc6e20] flex-shrink-0" />
                <div>
                  <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Company</div>
                  <div className="text-sm font-bold text-slate-800 mt-0.5 truncate">{member.company.name}</div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Reset Password Card */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="flex items-center gap-3 px-6 py-4 border-b border-slate-100 bg-amber-50/50">
            <div className="w-9 h-9 rounded-xl bg-amber-100 flex items-center justify-center flex-shrink-0">
              <Shield size={16} className="text-amber-600" />
            </div>
            <div>
              <div className="text-sm font-extrabold text-slate-800">Reset Password</div>
              <div className="text-xs text-slate-500 font-medium">Set a new password for this user</div>
            </div>
          </div>

          <form action={handleReset} className="p-6 space-y-4">
            <input type="hidden" name="userId" value={user.id} />
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-1.5">
                New Password
              </label>
              <input
                type="password"
                name="newPassword"
                required
                minLength={6}
                placeholder="Enter new password (min 6 chars)"
                className="w-full border border-slate-300 rounded-xl px-4 py-2.5 text-sm text-slate-900 bg-white focus:outline-none focus:ring-2 focus:ring-[#fc6e20]/40 focus:border-[#fc6e20] transition-all"
              />
            </div>
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-1.5">
                Confirm Password
              </label>
              <input
                type="password"
                name="confirmPassword"
                required
                minLength={6}
                placeholder="Re-enter new password"
                className="w-full border border-slate-300 rounded-xl px-4 py-2.5 text-sm text-slate-900 bg-white focus:outline-none focus:ring-2 focus:ring-[#fc6e20]/40 focus:border-[#fc6e20] transition-all"
              />
            </div>
            <div className="pt-2 flex gap-3">
              <button
                type="submit"
                className="flex-1 py-2.5 bg-[#fc6e20] hover:bg-[#e85b0d] text-white text-sm font-bold rounded-xl transition-colors cursor-pointer shadow-sm"
              >
                Reset Password
              </button>
              <Link
                href="/super-admin/users"
                className="flex-1 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-sm font-semibold rounded-xl transition-colors text-center"
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
