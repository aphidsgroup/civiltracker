import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

export async function GET() {
  const start = Date.now()
  let dbStatus: 'ok' | 'error' = 'error'
  let dbLatencyMs: number | null = null

  try {
    await prisma.$queryRaw`SELECT 1`
    dbLatencyMs = Date.now() - start
    dbStatus = 'ok'
  } catch {
    dbStatus = 'error'
  }

  const healthy = dbStatus === 'ok'

  return NextResponse.json(
    {
      status: healthy ? 'ok' : 'degraded',
      version: '1.0.0',
      timestamp: new Date().toISOString(),
      services: {
        database: {
          status: dbStatus,
          latencyMs: dbLatencyMs,
        },
      },
    },
    { status: healthy ? 200 : 503 }
  )
}
