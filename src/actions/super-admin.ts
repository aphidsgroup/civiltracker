'use server'

import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import bcrypt from 'bcryptjs'
import { revalidatePath } from 'next/cache'

export async function changeSuperAdminPassword(password: string) {
  const session = await auth()
  
  if (session?.user?.role !== 'SUPER_ADMIN') {
    throw new Error('Unauthorized')
  }

  if (!password || password.length < 6) {
    throw new Error('Password must be at least 6 characters long')
  }

  const hashedPassword = await bcrypt.hash(password, 10)

  await prisma.user.update({
    where: { id: session.user.id },
    data: { password: hashedPassword }
  })

  revalidatePath('/super-admin/settings')
  
  return { success: true }
}
