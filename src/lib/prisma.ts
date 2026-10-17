import { PrismaClient } from '@prisma/client'
import { Pool, neonConfig } from '@neondatabase/serverless'
import { PrismaNeon } from '@prisma/adapter-neon'
import ws from 'ws'

if (!neonConfig.webSocketConstructor) {
  neonConfig.webSocketConstructor = ws
}

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
  pool: Pool | undefined
}

function getConnectionString(): string {
  const url =
    (process.env.DATABASE_URL?.trim() || '') ||
    (process.env.POSTGRES_PRISMA_URL?.trim() || '') ||
    (process.env.DIRECT_URL?.trim() || '') ||
    (process.env.POSTGRES_URL?.trim() || '')

  if (!url) {
    throw new Error(
      'Database connection URL is missing. Please set DATABASE_URL or POSTGRES_PRISMA_URL in environment variables.'
    )
  }
  return url
}

function createPrismaClient(): PrismaClient {
  const connectionString = getConnectionString()
  const pool = new Pool({ connectionString })
  const adapter = new PrismaNeon(pool)
  return new PrismaClient({
    adapter,
    log: process.env.NODE_ENV === 'production' ? ['error'] : ['query', 'error', 'warn'],
  })
}

const prisma = globalForPrisma.prisma ?? createPrismaClient()

// Cache on globalThis across all environments to prevent connection pool exhaustion in serverless / hot-reloads
globalForPrisma.prisma = prisma

export { prisma }
export default prisma
