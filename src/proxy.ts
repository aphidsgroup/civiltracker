import { auth } from '@/lib/auth'
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { Role } from '@prisma/client'

const publicPaths = ['/login', '/api/auth', '/api/health', '/offline', '/api/admin']

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl

  if (publicPaths.some((p) => pathname.startsWith(p))) {
    return NextResponse.next()
  }

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
    if (pathname.startsWith('/api')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    return NextResponse.redirect(new URL('/login', request.url))
  }

  const role = session.user.role as Role

  if (role === Role.CLIENT && !pathname.startsWith('/client-portal')) {
    if (pathname.startsWith('/api')) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }
    return NextResponse.redirect(new URL('/client-portal', request.url))
  }

  if (pathname.startsWith('/super-admin') && role !== Role.SUPER_ADMIN) {
    if (pathname.startsWith('/api')) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }
    return NextResponse.redirect(new URL('/dashboard', request.url))
  }

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
      return NextResponse.redirect(new URL('/dashboard', request.url))
    }
  }

  return NextResponse.next()
}

export { proxy as middleware }

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon\\.ico|api/health)(?:.*))'],
}
