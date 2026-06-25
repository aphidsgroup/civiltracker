import { auth } from '@/lib/auth'
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { Role } from '@prisma/client'

const publicPaths = ['/login', '/api/auth', '/offline', '/client-portal']

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl

  // Allow public paths
  if (publicPaths.some((p) => pathname.startsWith(p))) {
    return NextResponse.next()
  }

  // Allow static files
  if (
    pathname.startsWith('/_next') ||
    pathname.startsWith('/favicon') ||
    pathname.startsWith('/icons') ||
    pathname.startsWith('/manifest') ||
    pathname === '/sw.js'
  ) {
    return NextResponse.next()
  }

  const session = await auth()

  if (!session?.user) {
    return NextResponse.redirect(new URL('/login', request.url))
  }

  const role = session.user.role as Role

  // Super admin route protection
  if (pathname.startsWith('/super-admin') && role !== Role.SUPER_ADMIN) {
    return NextResponse.redirect(new URL('/dashboard', request.url))
  }

  // Mobile route — accessible to field staff and above
  if (pathname.startsWith('/mobile')) {
    const mobileRoles: Role[] = [
      Role.SUPER_ADMIN,
      Role.COMPANY_ADMIN,
      Role.PROJECT_MANAGER,
      Role.SITE_ENGINEER,
      Role.SUPERVISOR,
      Role.ACCOUNTANT,
      Role.PURCHASE_MANAGER,
    ]
    if (!mobileRoles.includes(role)) {
      return NextResponse.redirect(new URL('/login', request.url))
    }
  }

  return NextResponse.next()
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
}
