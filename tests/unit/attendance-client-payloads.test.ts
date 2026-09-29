import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'

/**
 * Regression for the muster-roll screens after the attendance actions stopped accepting
 * money. The clients used to echo the stored advance back on every muster save and worker
 * edit (`advance: advances[id]`), which the actions now refuse for any non-zero value, and
 * sent a contractor's advance as a bare number without the confirmation and reason.
 *
 * Now the roll and profile payloads carry no advance key at all, an advance is sent only
 * through the explicit payment payloads (decimal text, typed-back name, reason), and a
 * positive amount from a user without payment access is refused with a message instead
 * of being dropped. The register renders no editable advance and offers the payment
 * button only when the page grants it.
 */

vi.mock('@/actions/mobile-labour', () => ({
  addMobileWorkerAction: vi.fn(),
  updateWorkerAction: vi.fn(),
  saveMobileAttendanceAction: vi.fn(),
  recordLabourAdvanceAction: vi.fn(),
}))

const { contractorLogPayload, labourAdvancePayload, musterRollRow, workerEditPayload } = await import('@/lib/attendance-payloads')
const { default: AttendanceRegisterClient } = await import('@/components/labour/AttendanceRegisterClient')

const WORKER = {
  id: 'lab_1',
  name: 'Ravi',
  phone: null,
  trade: 'MASON',
  dailyWage: 700,
  siteId: 'site_1',
  site: { id: 'site_1', name: 'Tower A' },
  status: 'PRESENT',
  overtimeHours: 0,
  advance: 250,
}

const LOG = { siteId: 'site_1', contractorName: 'Bricks Co', contractorType: 'BRICKWORK', labourCount: 8, startTime: '08:00' }

describe('nonfinancial payloads', () => {
  it('builds a muster row with no advance even from a row that holds one', () => {
    const row = { ...WORKER, labourId: WORKER.id, startTime: '08:30' }
    const built = musterRollRow(row)
    expect(built).toEqual({ labourId: 'lab_1', siteId: 'site_1', status: 'PRESENT', startTime: '08:30' })
    expect(built).not.toHaveProperty('advance')
  })

  it('builds a worker edit with no advance even from a worker that holds one', () => {
    const built = workerEditPayload({ ...WORKER, customTrade: '' })
    expect(built).toEqual({ id: 'lab_1', name: 'Ravi', trade: 'MASON', customTrade: '', dailyWage: 700, siteId: 'site_1' })
    expect(built).not.toHaveProperty('advance')
  })
})

describe('contractorLogPayload', () => {
  it.each([undefined, '', '  ', '0', '0.00'])('sends no advance fields for %j', (amount) => {
    const advance = amount === undefined ? undefined : { amount, confirmation: '', reason: '' }
    for (const canPay of [false, true]) {
      const built = contractorLogPayload({ ...LOG, advance }, canPay)
      expect(built).toEqual({ ok: true, payload: LOG })
    }
  })

  it('refuses a positive advance from a user without payment access instead of dropping it', () => {
    const built = contractorLogPayload({ ...LOG, advance: { amount: '500', confirmation: 'Bricks Co', reason: 'Tools' } }, false)
    expect(built.ok).toBe(false)
    if (!built.ok) expect(built.error).toMatch(/payment access/)
  })

  it('sends a positive advance as decimal text with the confirmation and reason', () => {
    const built = contractorLogPayload({ ...LOG, advance: { amount: ' 1500.50 ', confirmation: ' Bricks Co ', reason: ' Weekly advance ' } }, true)
    expect(built).toEqual({
      ok: true,
      payload: { ...LOG, dailyAdvance: '1500.50', advanceConfirmation: 'Bricks Co', advanceReason: 'Weekly advance' },
    })
  })

  it.each(['1e3', '-5', '12.345', 'abc', '100000000'])('refuses the amount %j', (amount) => {
    const built = contractorLogPayload({ ...LOG, advance: { amount, confirmation: 'Bricks Co', reason: 'Tools' } }, true)
    expect(built).toEqual({ ok: false, error: 'Invalid daily advance' })
  })

  it('refuses a positive advance without a reason or confirmation', () => {
    expect(contractorLogPayload({ ...LOG, advance: { amount: '500', confirmation: 'Bricks Co', reason: ' ' } }, true))
      .toEqual({ ok: false, error: 'Advance reason is required' })
    expect(contractorLogPayload({ ...LOG, advance: { amount: '500', confirmation: ' ', reason: 'Tools' } }, true).ok).toBe(false)
  })
})

describe('labourAdvancePayload', () => {
  const INPUT = { labourId: 'lab_1', siteId: 'site_1', amount: '300', currentAdvance: 250, confirmation: 'Ravi', reason: 'Food' }

  it('sends decimal text and the balance the payer saw', () => {
    expect(labourAdvancePayload(INPUT)).toEqual({
      ok: true,
      payload: { labourId: 'lab_1', siteId: 'site_1', amount: '300', expectedAdvance: '250.00', confirmationText: 'Ravi', reason: 'Food' },
    })
    const built = labourAdvancePayload({ ...INPUT, currentAdvance: 0.1 + 0.2 })
    expect(built.ok && built.payload.expectedAdvance).toBe('0.30')
  })

  it.each(['', '0', '-1', '1e2', '10.001'])('refuses the amount %j', (amount) => {
    expect(labourAdvancePayload({ ...INPUT, amount })).toEqual({ ok: false, error: 'Invalid advance amount' })
  })

  it('refuses a missing reason or confirmation', () => {
    expect(labourAdvancePayload({ ...INPUT, reason: '' })).toEqual({ ok: false, error: 'Advance reason is required' })
    expect(labourAdvancePayload({ ...INPUT, confirmation: '' }).ok).toBe(false)
  })
})

describe('AttendanceRegisterClient advance controls', () => {
  const render = (canRecordAdvance?: boolean) =>
    renderToStaticMarkup(createElement(AttendanceRegisterClient, {
      initialLabour: [WORKER],
      sites: [WORKER.site],
      dateString: 'Today',
      targetDateIso: '2026-09-28',
      canRecordAdvance,
    }))

  it('shows the stored advance read-only and no payment button without payment access', () => {
    const html = render()
    expect(html).toContain('₹250')
    expect(html).not.toContain('Pay advance to Ravi')
    // The only number input on the row is overtime.
    expect(html.match(/<input[^>]*type="number"/g)).toHaveLength(1)
  })

  it('offers the explicit payment button when the page grants it', () => {
    const html = render(true)
    expect(html).toContain('aria-label="Pay advance to Ravi"')
    expect(html.match(/<input[^>]*type="number"/g)).toHaveLength(1)
  })
})
