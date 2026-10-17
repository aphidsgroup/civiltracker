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
  companyLogo?: string | null
  moduleControls?: ModuleControlsValue
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  trustHost: true,
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

        const inputEmail = (credentials.email as string).trim()
        const inputPassword = credentials.password as string

        // 1. Try finding user directly by user email (case-insensitive)
        let user = await prisma.user.findFirst({
          where: {
            email: { equals: inputEmail, mode: 'insensitive' },
          },
          include: {
            companyMembers: {
              where: { isActive: true },
              include: { company: true },
              take: 1,
            },
          },
        })

        // 2. If not found by user email, check if inputEmail is the Company's contact email
        // (Allows logging in using the company email address entered during company creation)
        if (!user) {
          const company = await prisma.company.findFirst({
            where: {
              email: { equals: inputEmail, mode: 'insensitive' },
              deletedAt: null,
            },
            include: {
              members: {
                where: { role: 'COMPANY_ADMIN', isActive: true },
                include: { user: true },
                take: 1,
              },
            },
          })

          if (company && company.members[0]?.user) {
            user = await prisma.user.findUnique({
              where: { id: company.members[0].user.id },
              include: {
                companyMembers: {
                  where: { isActive: true },
                  include: { company: true },
                  take: 1,
                },
              },
            })
          }
        }

        if (!user || !user.isActive) {
          throw new Error('Invalid credentials')
        }

        // Compare password (also try trimmed if raw fails, to handle mobile autocomplete spaces)
        let isValid = await bcrypt.compare(inputPassword, user.passwordHash)
        if (!isValid && inputPassword.trim() !== inputPassword) {
          isValid = await bcrypt.compare(inputPassword.trim(), user.passwordHash)
        }

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
          companyLogo: member?.company?.logo ?? null,
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
        token.companyLogo = (user as AuthUserPayload).companyLogo ?? undefined
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
        session.user.companyLogo = token.companyLogo as string | undefined
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
    companyLogo?: string | null
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
      companyLogo?: string | null
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
    companyLogo?: string | null
    moduleControls?: ModuleControlsValue
  }
}
