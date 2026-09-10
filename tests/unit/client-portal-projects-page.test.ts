import { describe, expect, it } from 'vitest'
import { readFile } from 'node:fs/promises'
import path from 'node:path'

const projectsPage = path.resolve('src/app/(client)/client-portal/projects/page.tsx')

describe('client portal projects page authorization boundary', () => {
  it('uses the explicit client-site resolver and contains no identity or tenant fallback', async () => {
    const source = await readFile(projectsPage, 'utf8')

    expect(source).toContain("getClientPortalSites")
    expect(source).not.toMatch(/from ['"]@\/lib\/auth['"]/)
    expect(source).not.toContain('prisma.client.findFirst')
    expect(source).not.toContain('session.user.email')
    expect(source).not.toContain('session.user.companyId')
    expect(source).not.toContain('clientRecord ||')
    expect(source).not.toMatch(/site\.findMany\(\{\s*where:\s*\{\s*companyId:/s)
  })
})
