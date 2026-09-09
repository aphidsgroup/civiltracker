import { z } from 'zod'
import { Role } from '@prisma/client'

import { INVITABLE_EMPLOYEE_ROLES } from '@/lib/permissions'

const ALL_ROLES = Object.values(Role) as [string, ...string[]]

const siteIdsSchema = z
  .array(z.string().trim().min(1).max(64))
  .max(200, { error: 'Too many sites selected.' })
  .default([])

const moduleControlsSchema = z
  .array(z.string().trim().min(1).max(120))
  .max(100, { error: 'Too many modules selected.' })
  .nullable()
  .optional()

const emailSchema = z
  .string({ error: 'Email address is required.' })
  .trim()
  .toLowerCase()
  .pipe(z.email({ error: 'Enter a valid email address.' }))

/** Payload accepted by the single employee invitation server action. */
export const inviteEmployeeSchema = z.object({
  name: z
    .string({ error: 'Full name is required.' })
    .trim()
    .min(2, { error: 'Full name must be at least 2 characters.' })
    .max(120, { error: 'Full name is too long.' }),
  email: emailSchema,
  phone: z
    .string()
    .trim()
    .max(20, { error: 'Phone number is too long.' })
    .optional()
    .transform(value => (value ? value : undefined)),
  password: z
    .string({ error: 'A login password is required.' })
    .min(8, { error: 'Password must be at least 8 characters.' })
    .max(128, { error: 'Password is too long.' }),
  // SUPER_ADMIN, CLIENT, VENDOR and SUBCONTRACTOR are not employee roles and can
  // never be granted through this path, regardless of who is calling.
  role: z.enum(INVITABLE_EMPLOYEE_ROLES, { error: 'Select a valid employee role.' }),
  siteIds: siteIdsSchema,
  moduleControls: moduleControlsSchema,
})

/** Payload accepted by the member role/access update server action. */
export const updateEmployeeSchema = z.object({
  memberId: z.string({ error: 'Team member is required.' }).trim().min(1).max(64),
  role: z.enum(ALL_ROLES, { error: 'Select a valid role.' }),
  isActive: z.boolean(),
  siteIds: siteIdsSchema,
  moduleControls: moduleControlsSchema,
})

export type InviteEmployeeInput = z.infer<typeof inviteEmployeeSchema>
export type UpdateEmployeeInput = z.infer<typeof updateEmployeeSchema>
