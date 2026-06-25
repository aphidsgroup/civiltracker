import { redirect } from 'next/navigation'
import { auth } from '@/lib/auth'
import { getRoleRedirect } from '@/lib/permissions'
import { Role } from '@prisma/client'

export default async function HomePage() {
  const session = await auth()
  if (!session?.user) redirect('/login')
  redirect(getRoleRedirect(session.user.role as Role))
}
