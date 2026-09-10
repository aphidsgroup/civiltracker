import { describe, expect, it } from 'vitest'
import { readFile } from 'node:fs/promises'
import path from 'node:path'

const pages = [
  path.resolve('src/app/(client)/client-portal/payments/page.tsx'),
  path.resolve('src/app/(client)/client-portal/photos/page.tsx'),
]

describe('client portal payments and photos authorization boundaries', () => {
  for (const page of pages) {
    it(`${path.basename(path.dirname(page))}/${path.basename(page)} has no raw identity or tenant fallback`, async () => {
      const source = await readFile(page, 'utf8')

      expect(source).toMatch(/getClientPortalSite|getClientPortalSites/)
      expect(source).not.toMatch(/from ['"]@\/lib\/auth['"]/)
      expect(source).not.toMatch(/session\.user\.email|session\?\.user\?\.email/)
      expect(source).not.toMatch(/clientRecord\?\.companyId|clientRecord \|\|/)
      expect(source).not.toMatch(/companyId:\s*clientRecord/s)
      if (page.endsWith('/payments/page.tsx')) {
        expect(source).toMatch(/invoiceScopes\s*=\s*assignedSites\.flatMap/s)
        expect(source).toMatch(/\{\s*siteId:\s*site\.id,\s*clientId:\s*site\.clientId,\s*companyId:\s*site\.companyId\s*\}/s)
        expect(source).toMatch(/rawInvoices\s*=\s*invoiceScopes\.length\s*>\s*0[\s\S]*:\s*\[\]/s)
        expect(source).toMatch(/where:\s*\{\s*OR:\s*invoiceScopes\s*\}/s)
      }
    })
  }
})
