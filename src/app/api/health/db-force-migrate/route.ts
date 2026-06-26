import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import fs from 'fs'
import path from 'path'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const migrationPath = path.join(process.cwd(), 'prisma/migrations/20260626000002_add_missing_phase9_columns/migration.sql')
    const sql = fs.readFileSync(migrationPath, 'utf8')
    
    // Execute each statement
    const statements = sql.split(';').filter(s => s.trim().length > 0)
    const results = []
    
    for (const stmt of statements) {
      if (stmt.trim().startsWith('--')) continue; // Skip full comment blocks if they are standalone
      try {
        await prisma.$executeRawUnsafe(stmt)
        results.push({ stmt: stmt.substring(0, 50) + '...', status: 'success' })
      } catch (err: any) {
        results.push({ stmt: stmt.substring(0, 50) + '...', status: 'error', error: err.message })
      }
    }
    
    return NextResponse.json({ success: true, results })
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message, stack: error.stack })
  }
}
