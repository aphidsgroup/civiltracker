import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { LocationCollectionNotice, SitePhotoLocationBadge } from './SitePhotoLocation'

describe('SitePhotoLocationBadge', () => {
  it('labels legacy GPS-less photos as unavailable', () => {
    const html = renderToStaticMarkup(<SitePhotoLocationBadge location={{ status: 'UNAVAILABLE', exact: null }} />)
    expect(html).toMatch(/GPS unavailable/)
    expect(html).not.toMatch(/maps/i)
  })

  it('shows only a GPS-tagged status to viewers without exact-location access', () => {
    const html = renderToStaticMarkup(<SitePhotoLocationBadge location={{ status: 'DEVICE_REPORTED', exact: null }} />)
    expect(html).toMatch(/GPS tagged/)
    expect(html).not.toMatch(/\d+\.\d{4,}/)
    expect(html).not.toMatch(/google\.com\/maps/)
  })

  it('shows the company admin a precise location card with a safe maps link and device-reported wording', () => {
    const html = renderToStaticMarkup(
      <SitePhotoLocationBadge
        location={{
          status: 'DEVICE_REPORTED',
          exact: {
            latitude: 13.0827123,
            longitude: 80.2707456,
            accuracyMeters: 8.5,
            capturedAt: '2026-10-15T05:59:55.000Z',
            mapsUrl: 'https://www.google.com/maps/search/?api=1&query=13.0827123%2C80.2707456',
          },
        }}
      />,
    )
    expect(html).toContain('13.082712, 80.270746')
    expect(html).toContain('±9 m')
    expect(html).toContain('href="https://www.google.com/maps/search/?api=1&amp;query=13.0827123%2C80.2707456"')
    expect(html).toContain('rel="noopener noreferrer"')
    expect(html).toMatch(/device-reported/i)
    expect(html).toMatch(/not tamper-proof/i)
  })
})

describe('LocationCollectionNotice', () => {
  it('explains one-time capture, admin-only access and no background tracking', () => {
    const html = renderToStaticMarkup(<LocationCollectionNotice />)
    expect(html).toMatch(/precise location/i)
    expect(html).toMatch(/only your company admin/i)
    expect(html).toMatch(/no background tracking/i)
  })
})
