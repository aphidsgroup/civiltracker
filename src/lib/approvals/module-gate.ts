import { requireModuleEnabled } from '@/lib/auth/require-module'

export const APPROVALS_MODULE = 'APPROVALS'

/**
 * The APPROVALS module half of every approval read and transition, checked on the live
 * company before any approval query. It lives in the shared entry points
 * (`requireApprovalReader` and the transition loader in `@/actions/approvals`) rather than
 * in the REST guard alone, because a Server Action is a public POST endpoint that never
 * passes through `/api/approvals`.
 */
export async function requireApprovalsModule(): Promise<void> {
  await requireModuleEnabled(APPROVALS_MODULE)
}
