import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { redirect } from 'next/navigation'
import Link from 'next/link'

async function createTask(formData: FormData) {
  'use server'
  const session = await auth()
  if (!session?.user?.companyId) throw new Error('Unauthorized')

  const companyId = session.user.companyId
  const siteId = formData.get('siteId') as string
  const name = formData.get('name') as string
  const description = formData.get('description') as string
  const assignedToId = formData.get('assignedToId') as string
  const startDateStr = formData.get('startDate') as string
  const dueDateStr = formData.get('dueDate') as string

  if (!name || !siteId) return

  await prisma.task.create({
    data: {
      companyId,
      siteId,
      name,
      description: description || null,
      assignedToId: assignedToId || null,
      startDate: startDateStr ? new Date(startDateStr) : null,
      dueDate: dueDateStr ? new Date(dueDateStr) : null,
      createdById: session.user.id,
      status: 'NOT_STARTED',
      stage: 'FOUNDATION', // default
    },
  })

  redirect('/tasks')
}

export default async function NewTaskPage() {
  const session = await auth()
  if (!session?.user?.companyId) redirect('/login')

  const [sites, staff] = await Promise.all([
    prisma.site.findMany({
      where: { companyId: session.user.companyId, status: 'ACTIVE' },
      select: { id: true, name: true }
    }),
    prisma.companyMember.findMany({
      where: { companyId: session.user.companyId, isActive: true },
      include: { user: { select: { name: true } } }
    })
  ])

  return (
    <div className="min-h-screen bg-gray-50/50">
      <div className="flex items-center px-6 py-4 bg-white border-b border-gray-200">
        <h1 className="text-xl font-semibold text-gray-900">Create New Task</h1>
      </div>
      
      <div className="p-6 max-w-2xl">
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6">
          <form action={createTask}>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="sm:col-span-2">
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">Task Name / Title *</label>
                <input name="name" required placeholder="Slab Shuttering & Reinforcement"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent" />
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">Project / Site *</label>
                <select name="siteId" required
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent">
                  <option value="">-- Choose Site --</option>
                  {sites.map(site => (
                    <option key={site.id} value={site.id}>{site.name}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">Assign To</label>
                <select name="assignedToId"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent">
                  <option value="">-- Unassigned --</option>
                  {staff.map(member => (
                    <option key={member.id} value={member.userId}>{member.user.name} ({member.role})</option>
                  ))}
                </select>
              </div>
              
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">Start Date</label>
                <input name="startDate" type="date"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent" />
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">Due Date</label>
                <input name="dueDate" type="date"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent" />
              </div>

              <div className="sm:col-span-2">
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">Description & Instructions</label>
                <textarea name="description" rows={3} placeholder="Detailed instructions for the site team..."
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent" />
              </div>
            </div>

            <div className="mt-8 flex items-center gap-3 border-t border-gray-100 pt-5">
              <button type="submit"
                className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold rounded-lg shadow-sm transition-colors cursor-pointer">
                Create Task
              </button>
              <Link href="/tasks"
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
