import { auth } from '@/lib/auth'
import { SessionUser } from '@/types'

export async function requireUser(): Promise<SessionUser> {
  const session = await auth()
  if (!session || !session.user) {
    throw new Error('UNAUTHORIZED: Authentication required')
  }
  return session.user as SessionUser
}
