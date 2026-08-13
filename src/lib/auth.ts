import NextAuth from 'next-auth'
import Credentials from 'next-auth/providers/credentials'
import { prisma } from '@/lib/prisma'
import bcrypt from 'bcryptjs'
import { Prisma, Role } from '@prisma/client'

type ModuleControlsValue = Prisma.JsonValue | null

type AuthUserPayload = {
  id: string
  role: Role
  companyId?: string | null
  companySlug?: string | null
  companyName?: string | null
  moduleControls?: ModuleControlsValue
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [
    Credentials({
      name: 'credentials',
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Password', type: 'password' },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) {
          throw new Error('Email and password required')
        }

        const user = await prisma.user.findUnique({
          where: { email: credentials.email as string },
          include: {
            companyMembers: {
              where: { isActive: true },
              include: { company: true },
              take: 1,
            },
          },
        })

        if (!user || !user.isActive) {
          throw new Error('Invalid credentials')
        }

        const isValid = await bcrypt.compare(
          credentials.password as string,
          user.passwordHash
        )

        if (!isValid) {
          throw new Error('Invalid credentials')
        }

        // Update last login
        await prisma.user.update({
          where: { id: user.id },
          data: { lastLoginAt: new Date() },
        })

        const member = user.companyMembers[0]

        return {
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role,
          companyId: member?.companyId ?? null,
          companySlug: member?.company?.slug ?? null,
          companyName: member?.company?.name ?? null,
          moduleControls: member?.moduleControls ?? null,
          image: user.avatar,
        }
      },
    }),
  ],
  session: { strategy: 'jwt' },
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id
        token.role = (user as AuthUserPayload).role
        token.companyId = (user as AuthUserPayload).companyId ?? undefined
        token.companySlug = (user as AuthUserPayload).companySlug ?? undefined
        token.companyName = (user as AuthUserPayload).companyName ?? undefined
        token.moduleControls = (user as AuthUserPayload).moduleControls ?? undefined
      }
      return token
    },
    async session({ session, token }) {
      if (token && session.user) {
        session.user.id = token.id as string
        session.user.role = token.role as Role
        session.user.companyId = token.companyId as string | undefined
        session.user.companySlug = token.companySlug as string | undefined
        session.user.companyName = token.companyName as string | undefined
        session.user.moduleControls = token.moduleControls as ModuleControlsValue | undefined
      }
      return session
    },
  },
  pages: {
    signIn: '/login',
    error: '/login',
  },
})

// Extend next-auth types
declare module 'next-auth' {
  interface User {
    role: Role
    companyId?: string | null
    companySlug?: string | null
    companyName?: string | null
    moduleControls?: ModuleControlsValue
  }
  interface Session {
    user: {
      id: string
      email: string
      name: string
      role: Role
      companyId?: string
      companySlug?: string
      companyName?: string
      moduleControls?: ModuleControlsValue
      image?: string | null
    }
  }
  interface JWT {
    id: string
    role: Role
    companyId?: string
    companySlug?: string
    companyName?: string
    moduleControls?: ModuleControlsValue
  }
}
