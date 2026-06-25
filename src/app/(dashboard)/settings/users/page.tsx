import { requirePermission } from '@/lib/auth/require-permission'
import { prisma } from '@/lib/prisma'
import { createUser } from '@/actions/users'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { Users, Shield, Plus, X, Search, MoreVertical, Building2, UserPlus, Zap, CheckCircle2 } from 'lucide-react'
import { Role } from '@prisma/client'

export default async function UsersPage({ searchParams }: { searchParams: { add?: string } }) {
  const currentUser = await requirePermission('company.manage')
  const companyId = currentUser.companyId

  if (!companyId) redirect('/login')

  const company = await prisma.company.findUnique({
    where: { id: companyId },
    include: { _count: { select: { members: true } } }
  })

  if (!company) redirect('/login')

  const members = await prisma.companyMember.findMany({
    where: { companyId },
    include: { user: true },
    orderBy: { user: { name: 'asc' } }
  })

  const showAddModal = searchParams.add === 'true'
  const membersCount = company._count.members
  const userLimit = company.userLimit
  const usagePercentage = Math.min(100, Math.round((membersCount / userLimit) * 100))

  async function handleAddUser(formData: FormData) {
    'use server'
    const data = Object.fromEntries(formData.entries())
    await createUser(data)
    redirect('/settings/users')
  }

  return (
    <div className="min-h-[calc(100vh-4rem)] bg-gradient-to-br from-slate-50 via-white to-indigo-50/20 p-6 md:p-8 relative overflow-hidden rounded-tl-3xl border-t border-l border-white/50">
      {/* Decorative Blur Backgrounds */}
      <div className="absolute top-0 right-0 w-[40rem] h-[40rem] bg-indigo-400/5 rounded-full blur-[100px] pointer-events-none -z-10" />
      <div className="absolute bottom-0 left-0 w-[30rem] h-[30rem] bg-teal-400/5 rounded-full blur-[100px] pointer-events-none -z-10" />

      <div className="max-w-6xl mx-auto space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-700">
        
        {/* Header Section */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-slate-800 to-slate-600">
              Team Management
            </h1>
            <p className="text-slate-500 mt-1.5 font-medium">Manage user access and roles across your organization.</p>
          </div>
          <Link 
            href="?add=true" 
            className="inline-flex items-center justify-center gap-2 px-6 py-2.5 rounded-xl font-semibold text-white bg-gradient-to-r from-indigo-600 to-indigo-500 hover:from-indigo-500 hover:to-indigo-400 shadow-[0_8px_20px_rgb(79,70,229,0.25)] hover:shadow-[0_8px_25px_rgb(79,70,229,0.35)] hover:-translate-y-0.5 transition-all duration-300"
          >
            <Plus className="w-4 h-4" />
            Add User
          </Link>
        </div>

        {/* Usage Stats Card */}
        <div className="bg-white/60 backdrop-blur-xl border border-white/80 shadow-[0_4px_20px_rgb(0,0,0,0.03)] rounded-2xl p-6 md:p-8 flex flex-col md:flex-row items-center justify-between gap-8">
          <div className="flex items-center gap-4 w-full md:w-auto">
            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-indigo-100 to-indigo-50 flex items-center justify-center text-indigo-600 shadow-sm border border-indigo-100">
              <Users className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-slate-800">Available Licenses</h2>
              <p className="text-slate-500 text-sm">You are using {membersCount} of your {userLimit} included seats.</p>
            </div>
          </div>
          <div className="w-full md:w-1/2">
            <div className="flex justify-between items-end mb-2">
              <span className="text-2xl font-black text-indigo-600">{membersCount}<span className="text-sm font-medium text-slate-400"> / {userLimit}</span></span>
              <span className="text-sm font-semibold text-slate-500">{usagePercentage}%</span>
            </div>
            <div className="h-3 w-full bg-slate-100 rounded-full overflow-hidden shadow-inner">
              <div 
                className="h-full bg-gradient-to-r from-indigo-500 to-teal-400 rounded-full transition-all duration-1000 ease-out relative"
                style={{ width: `${usagePercentage}%` }}
              >
                <div className="absolute inset-0 bg-white/20 animate-[shimmer_2s_infinite]" />
              </div>
            </div>
          </div>
        </div>

        {/* Users Table */}
        <div className="bg-white/70 backdrop-blur-xl border border-white/80 shadow-[0_8px_30px_rgb(0,0,0,0.04)] rounded-3xl overflow-hidden">
          <div className="p-6 border-b border-slate-100 flex items-center justify-between">
            <h3 className="font-semibold text-slate-800 text-lg">Active Members</h3>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input 
                type="text" 
                placeholder="Search members..." 
                className="pl-9 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all w-64"
              />
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50/50">
                  <th className="py-4 px-6 text-xs font-semibold text-slate-500 uppercase tracking-wider">User</th>
                  <th className="py-4 px-6 text-xs font-semibold text-slate-500 uppercase tracking-wider">Role</th>
                  <th className="py-4 px-6 text-xs font-semibold text-slate-500 uppercase tracking-wider">Status</th>
                  <th className="py-4 px-6 text-xs font-semibold text-slate-500 uppercase tracking-wider text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100/80">
                {members.map((member) => (
                  <tr key={member.id} className="hover:bg-indigo-50/30 transition-colors duration-200 group">
                    <td className="py-4 px-6">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full bg-gradient-to-br from-indigo-100 to-teal-100 flex items-center justify-center text-indigo-700 font-bold shadow-sm border border-white">
                          {member.user.name.charAt(0).toUpperCase()}
                        </div>
                        <div>
                          <p className="font-semibold text-slate-800 group-hover:text-indigo-600 transition-colors">{member.user.name}</p>
                          <p className="text-sm text-slate-500">{member.user.email}</p>
                        </div>
                      </div>
                    </td>
                    <td className="py-4 px-6">
                      <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-slate-100 text-slate-600 text-xs font-medium border border-slate-200/60">
                        <Shield className="w-3.5 h-3.5 text-slate-400" />
                        {member.role.replace('_', ' ')}
                      </div>
                    </td>
                    <td className="py-4 px-6">
                      {member.isActive ? (
                        <div className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-600">
                          <div className="w-2 h-2 rounded-full bg-emerald-500 shadow-[0_0_8px_rgb(16,185,129,0.5)]"></div>
                          Active
                        </div>
                      ) : (
                        <div className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-400">
                          <div className="w-2 h-2 rounded-full bg-slate-300"></div>
                          Inactive
                        </div>
                      )}
                    </td>
                    <td className="py-4 px-6 text-right">
                      <button className="p-2 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors">
                        <MoreVertical className="w-5 h-5" />
                      </button>
                    </td>
                  </tr>
                ))}
                {members.length === 0 && (
                  <tr>
                    <td colSpan={4} className="py-12 text-center text-slate-500">
                      No members found.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Add User Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 animate-in fade-in duration-200">
          <Link href="?" className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm cursor-default" />
          <div className="relative w-full max-w-md bg-white rounded-3xl shadow-[0_20px_60px_rgb(0,0,0,0.1)] overflow-hidden animate-in zoom-in-95 slide-in-from-bottom-8 duration-300">
            {/* Modal Header */}
            <div className="px-6 py-5 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-indigo-100/50 rounded-lg text-indigo-600">
                  <UserPlus className="w-5 h-5" />
                </div>
                <h3 className="font-bold text-lg text-slate-800">Add New User</h3>
              </div>
              <Link href="?" className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-full transition-colors">
                <X className="w-5 h-5" />
              </Link>
            </div>

            {/* Modal Form */}
            <form action={handleAddUser} className="p-6 space-y-5">
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-slate-700">Full Name *</label>
                <input 
                  name="name" 
                  required 
                  placeholder="e.g. Jane Smith" 
                  className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-500 transition-all"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-sm font-medium text-slate-700">Email Address *</label>
                <input 
                  name="email" 
                  type="email" 
                  required 
                  placeholder="jane@example.com" 
                  className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-500 transition-all"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-sm font-medium text-slate-700">Phone Number</label>
                <input 
                  name="phone" 
                  placeholder="+91 9876543210" 
                  className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-500 transition-all"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-sm font-medium text-slate-700">Assign Role *</label>
                <div className="relative">
                  <select 
                    name="role" 
                    required 
                    defaultValue="SITE_ENGINEER"
                    className="w-full pl-4 pr-10 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-500 transition-all appearance-none"
                  >
                    {Object.values(Role).map(role => {
                      if (role === Role.SUPER_ADMIN) return null;
                      return (
                        <option key={role} value={role}>{role.replace('_', ' ')}</option>
                      )
                    })}
                  </select>
                  <Shield className="absolute right-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
                </div>
              </div>

              <div className="space-y-1.5 pb-2">
                <label className="text-sm font-medium text-slate-700">Temporary Password *</label>
                <input 
                  name="password" 
                  type="password" 
                  required 
                  placeholder="Min. 8 characters" 
                  className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-500 transition-all"
                />
              </div>

              <div className="flex gap-3 pt-4 border-t border-slate-100">
                <Link 
                  href="?" 
                  className="flex-1 py-2.5 px-4 text-center rounded-xl text-slate-600 font-medium hover:bg-slate-100 transition-colors"
                >
                  Cancel
                </Link>
                <button 
                  type="submit" 
                  className="flex-1 py-2.5 px-4 rounded-xl font-semibold text-white bg-indigo-600 hover:bg-indigo-700 shadow-lg shadow-indigo-200 hover:shadow-indigo-300 transition-all active:scale-95"
                >
                  Create User
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <style dangerouslySetInnerHTML={{ __html: `
        @keyframes shimmer {
          0% { transform: translateX(-100%); }
          100% { transform: translateX(100%); }
        }
      `}} />
    </div>
  )
}
