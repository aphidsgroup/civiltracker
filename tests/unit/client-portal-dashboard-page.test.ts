import { describe, expect, it } from 'vitest'
import { readFile } from 'node:fs/promises'
import path from 'node:path'

const dashboardPage = path.resolve('src/app/(client)/client-portal/page.tsx')

describe('client portal dashboard authorization boundary', () => {
  it('uses assigned-site resolvers and contains no email or tenant-wide fallback', async () => {
    const source = await readFile(dashboardPage, 'utf8')

    expect(source).toContain('getClientPortalSites')
    expect(source).toContain('getClientPortalSite')
    expect(source).not.toMatch(/from ['"]@\/lib\/auth['"]/)
    expect(source).not.toContain('session?.user?.email')
    expect(source).not.toContain('clientRecord?.companyId')
    expect(source).not.toMatch(/companyId:\s*clientRecord/s)
    expect(source).toMatch(/invoices:\s*\{\s*where:\s*\{\s*siteId:\s*site\.id,\s*clientId:\s*site\.clientId,\s*companyId:\s*site\.companyId/s)
    expect(source).not.toMatch(/siteId\s*\?[^:]+:\s*\{\s*companyId/s)
  })
})
