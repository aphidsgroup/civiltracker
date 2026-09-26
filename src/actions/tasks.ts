'use server'

import prisma from '@/lib/prisma'
import { redirect } from 'next/navigation'
import { optionalText, requiredText, requireSiteMutation } from '@/lib/auth/site-mutation'

const ASSIGNEE_NOT_FOUND = 'FORBIDDEN: Assignee not found or access denied'

function parseOptionalDate(raw: FormDataEntryValue | null, field: string): Date | null {
  const text = optionalText(raw)
  if (!text) return null
  const date = new Date(text)
  if (Number.isNaN(date.getTime())) throw new Error(`Invalid ${field}`)
  return date
}

/*
 * Creates a site task. Live `tasks.manage` + TASKS is checked before any read, the site
 * must be a live site of exactly the live company, and an assignee must be an active
 * member of that company.
 */
export async function createTaskAction(formData: FormData) {
  const { user, site } = await requireSiteMutation(String(formData.get('siteId') ?? ''), 'tasks.manage', 'TASKS')
  const companyId = user.companyId

  const name = requiredText(formData.get('name'), 'Task name')
  const startDate = parseOptionalDate(formData.get('startDate'), 'start date')
  const dueDate = parseOptionalDate(formData.get('dueDate'), 'due date')
  const assignedToId = optionalText(formData.get('assignedToId'))

  if (assignedToId) {
    const member = await prisma.companyMember.findFirst({
      where: { userId: assignedToId, companyId, isActive: true },
      select: { userId: true },
    })
    if (!member) throw new Error(ASSIGNEE_NOT_FOUND)
  }

  await prisma.task.create({
    data: {
      companyId,
      siteId: site.id,
      name,
      description: optionalText(formData.get('description')),
      assignedToId,
      startDate,
      dueDate,
      createdById: user.id,
      status: 'NOT_STARTED',
      stage: 'FOUNDATION',
    },
  })

  redirect('/tasks')
}
