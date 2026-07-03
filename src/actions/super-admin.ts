'use server'

import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import bcrypt from 'bcryptjs'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'

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
    data: { passwordHash: hashedPassword }
  })

  revalidatePath('/super-admin/settings')
  
  return { success: true }
}

export async function deleteCompany(companyId: string) {
  const session = await auth()
  if (session?.user?.role !== 'SUPER_ADMIN') throw new Error('Unauthorized')

  await prisma.company.delete({ where: { id: companyId } })

  revalidatePath('/super-admin/companies')
  redirect('/super-admin/companies')
}

export async function deleteUser(userId: string) {
  const session = await auth()
  if (session?.user?.role !== 'SUPER_ADMIN') throw new Error('Unauthorized')

  // Cannot delete self
  if (session.user.id === userId) throw new Error('You cannot delete your own account.')

  await prisma.user.delete({ where: { id: userId } })

  revalidatePath('/super-admin/users')
  redirect('/super-admin/users')
}
