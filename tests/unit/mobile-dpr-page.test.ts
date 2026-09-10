import { describe, expect, it } from 'vitest'
import { readFile } from 'node:fs/promises'
import path from 'node:path'

const page = path.resolve('src/app/(mobile)/mobile/dpr/page.tsx')

describe('mobile DPR submission boundary', () => {
  it('delegates DPR writes to the centralized tenant-safe action', async () => {
    const source = await readFile(page, 'utf8')

    expect(source).toContain("import { createDpr } from '@/actions/dpr'")
    expect(source).toContain('await createDpr(formData)')
    expect(source).not.toContain('prisma.dailyProgressReport.create')
    expect(source).not.toContain('createApprovalAction')
  })
})
