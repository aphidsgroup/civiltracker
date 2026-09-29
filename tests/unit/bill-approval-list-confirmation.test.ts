import { readFileSync } from 'node:fs'
import path from 'node:path'
import { createElement, type ReactElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * Client-side cover for the bills approval list after the approve endpoints stopped
 * injecting the `APPROVE` token themselves.
 *
 * `BillApprovalList` used to POST `/api/expenses/[id]/approve` with no body on a single
 * click. Approval now goes through an inline typed confirmation: the confirm control is
 * disabled until the input holds exactly `APPROVE`, and the request carries that typed value
 * as JSON `{ confirmationText }`. Reject keeps its bodyless POST.
 *
 * The unit project runs in node without a DOM, so the component's form is exercised by
 * invoking its `onSubmit` prop directly and its disabled state is read from static markup.
 */
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }))

const { BILL_APPROVE_CONFIRM_TEXT, isBillApproveConfirmed, submitBillAction } = await import(
  '@/components/bills/bill-approval-request'
)
const { default: BillApprovalList, BillApproveConfirmation } = await import(
  '@/components/bills/BillApprovalList'
)
const { parseApproveRequestBody } = await import('@/lib/approvals/api-approve-body')

const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) => new Response('{}', { status: 200 }))

beforeEach(() => {
  fetchMock.mockClear()
})

describe('submitBillAction', () => {
  it.each([
    ['no confirmation', undefined],
    ['empty text', ''],
    ['lowercase', 'approve'],
    ['padded', ' APPROVE '],
    ['partial', 'APPROV'],
  ])('sends no approve request with %s', async (_label, typed) => {
    const res = await submitBillAction('exp_1', 'approve', typed, fetchMock as unknown as typeof fetch)

    expect(res).toBeNull()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('posts the typed APPROVE as a JSON confirmationText body', async () => {
    const typed = 'APPROVE'
    await submitBillAction('exp_1', 'approve', typed, fetchMock as unknown as typeof fetch)

    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('/api/expenses/exp_1/approve')
    expect(init?.method).toBe('POST')
    expect(init?.headers).toEqual({ 'Content-Type': 'application/json' })
    expect(JSON.parse(String(init?.body))).toEqual({ confirmationText: typed })
  })

  it('produces a body the approve route accepts and passes through verbatim', async () => {
    await submitBillAction('exp_1', 'approve', 'APPROVE', fetchMock as unknown as typeof fetch)
    const [url, init] = fetchMock.mock.calls[0]

    const parsed = await parseApproveRequestBody(new Request(`http://localhost${url}`, init))
    expect(parsed.ok).toBe(true)
    if (parsed.ok) expect(parsed.body.confirmationText).toBe('APPROVE')
  })

  it('keeps reject as a bodyless POST', async () => {
    await submitBillAction('exp_1', 'reject', undefined, fetchMock as unknown as typeof fetch)

    expect(fetchMock).toHaveBeenCalledWith('/api/expenses/exp_1/reject', { method: 'POST' })
  })

  it('arms only on the exact token', () => {
    expect(BILL_APPROVE_CONFIRM_TEXT).toBe('APPROVE')
    expect(isBillApproveConfirmed('APPROVE')).toBe(true)
    expect(isBillApproveConfirmed('APPROVE ')).toBe(false)
    expect(isBillApproveConfirmed('Approve')).toBe(false)
  })
})

describe('BillApproveConfirmation', () => {
  function renderConfirmation(typed: string, loading = false) {
    const onConfirm = vi.fn()
    const props = {
      billId: 'exp_1',
      typed,
      loading,
      onTypedChange: vi.fn(),
      onConfirm,
      onCancel: vi.fn(),
    }
    return { onConfirm, props, form: BillApproveConfirmation(props) as ReactElement<{ onSubmit: (e: unknown) => void }> }
  }

  function submit(form: ReactElement<{ onSubmit: (e: unknown) => void }>) {
    const preventDefault = vi.fn()
    form.props.onSubmit({ preventDefault })
    expect(preventDefault).toHaveBeenCalled()
  }

  /**
   * Attribute names on an HTML opening tag. Quoted values are consumed whole, so text inside
   * a value (e.g. the Tailwind `disabled:opacity-50` class) is never mistaken for a name.
   */
  function attributeNames(openingTag: string) {
    const attrs = openingTag.replace(/^<[^\s>]+/, '').replace(/\/?>$/, '')
    const pattern = /\s*([^\s"'=<>\/]+)(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s"'=<>`]+))?/gy
    const names: string[] = []
    let consumed = 0
    let match: RegExpExecArray | null
    while ((match = pattern.exec(attrs)) !== null) {
      names.push(match[1].toLowerCase())
      consumed = pattern.lastIndex
    }
    expect(attrs.slice(consumed).trim(), 'unparsed attribute text').toBe('')
    return names
  }

  /** Whether the single submit button in the rendered form carries the boolean `disabled` attribute. */
  function confirmButtonDisabled(props: Parameters<typeof BillApproveConfirmation>[0]) {
    const markup = renderToStaticMarkup(createElement(BillApproveConfirmation, props))
    const submitButtons = (markup.match(/<button\b(?:"[^"]*"|'[^']*'|[^"'>])*>/g) ?? []).filter((tag) =>
      /\stype="submit"/.test(tag)
    )
    expect(submitButtons).toHaveLength(1)
    return attributeNames(submitButtons[0]).includes('disabled')
  }

  it('reads the boolean disabled attribute, not class text', () => {
    const withClassOnly = '<button type="submit" class="px-3 disabled:opacity-50">'
    const withAttribute = '<button type="submit" disabled="" class="px-3 disabled:opacity-50">'
    const withBareAttribute = '<button type="submit" class="disabled:opacity-50" disabled>'

    expect(attributeNames(withClassOnly)).not.toContain('disabled')
    expect(attributeNames(withAttribute)).toContain('disabled')
    expect(attributeNames(withBareAttribute)).toContain('disabled')
  })

  it.each(['', 'approve', 'APPROV', 'APPROVE '])('does not confirm when %j is typed', (typed) => {
    const { onConfirm, form, props } = renderConfirmation(typed)

    submit(form)
    expect(onConfirm).not.toHaveBeenCalled()
    expect(confirmButtonDisabled(props)).toBe(true)
  })

  it('confirms and enables once APPROVE is typed', () => {
    const { onConfirm, form, props } = renderConfirmation('APPROVE')

    submit(form)
    expect(onConfirm).toHaveBeenCalledTimes(1)
    expect(confirmButtonDisabled(props)).toBe(false)
  })

  it('does not confirm while a request is pending', () => {
    const { onConfirm, form, props } = renderConfirmation('APPROVE', true)

    submit(form)
    expect(onConfirm).not.toHaveBeenCalled()
    expect(confirmButtonDisabled(props)).toBe(true)
  })
})

describe('BillApprovalList', () => {
  const pendingBill = {
    id: 'exp_1',
    description: 'Cement',
    amount: 1000,
    category: 'MATERIAL',
    paymentMode: 'CASH',
    approvalStatus: 'PENDING',
    paidTo: null,
    billNumber: null,
    billDate: null,
    createdAt: new Date('2026-01-01'),
    site: { id: 'site_1', name: 'Tower A' },
    createdBy: { name: 'Engineer' },
    billAttachments: [],
  }

  it('renders Approve as an opener, not an immediate submit', () => {
    const markup = renderToStaticMarkup(createElement(BillApprovalList, { bills: [pendingBill] }))

    expect(markup).toContain('Approve')
    expect(markup).not.toContain('Confirm Approve')
  })

  it('routes every request through the confirmation-gated helper', () => {
    const source = readFileSync(
      path.join(process.cwd(), 'src/components/bills/BillApprovalList.tsx'),
      'utf8'
    )

    expect(source).not.toMatch(/\bfetch\(/)
    expect(source).not.toMatch(/confirmationText\s*:\s*['"]APPROVE['"]/)
    expect(source).toContain("handleAction(bill.id, 'approve', typed)")
  })
})
