import { NextResponse } from 'next/server'
import type { Permission } from '@/lib/permissions'
import type { SessionUser } from '@/types'
import { requirePermission } from './require-permission'
import { requireModuleEnabled } from './require-module'

export async function requireApiPermission(permission: Permission, moduleName?: string): Promise<SessionUser | NextResponse> {
  try {
    const user = await requirePermission(permission)
    if (moduleName) {
      await requireModuleEnabled(moduleName)
    }
    return user
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    const status = message.startsWith('UNAUTHORIZED:') ? 401 : 403
    return NextResponse.json({ error: message }, { status })
  }
}

export function ensureCompanyContext(user: SessionUser): NextResponse | null {
  if (!user.companyId && user.role !== 'SUPER_ADMIN') {
    return NextResponse.json({ error: 'Unauthorized: No active company context' }, { status: 401 })
  }
  return null
}
