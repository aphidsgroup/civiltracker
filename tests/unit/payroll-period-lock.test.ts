import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Prisma } from '@prisma/client'
import { inMemoryDelegate, matchesWhere } from './support/prisma-where'
import type { Row } from './support/prisma-where'
import {
  assertPayrollPeriodOpen,
  lockPayrollPeriodForTransition,
  PAYROLL_PERIOD_CLOSED,
  PAYROLL_TRANSACTION_ATTEMPTS,
  PAYROLL_TRANSACTION_OPTIONS,
  payrollTransaction,
  PayrollPeriodClosedError,
} from '@/lib/payroll-period-lock'

/**
 * Unit coverage for the shared payroll-period lock.
 *
 * `assertPayrollPeriodOpen` must refuse a day inside a salary run of the exact company
 * past DRAFT when the run is company-wide, is for a booked site, or explicitly includes a
 * booked worker — and must leave DRAFT runs, other companies' runs, unrelated sites and
 * unrelated workers alone. The salary-run delegate evaluates the helper's real `where`
 * in memory (the to-many `items.some` filter is modelled locally), so each case proves
 * the predicate itself admits or excludes the run.
 *
 * `payrollTransaction` must open a SERIALIZABLE interactive transaction and retry it from
 * the start only on Prisma's serialization failure (`P2034`), at most
 * `PAYROLL_TRANSACTION_ATTEMPTS` times in all.
 */

const day = (iso: string) => new Date(`${iso}T00:00:00.000Z`)

type Run = Row & { items: Row[] }

let runs: Run[]

/** `matchesWhere` plus the `items: { some }` relation filter the run predicate uses. */
function matchesRun(run: Run, where: Row): boolean {
  return Object.entries(where).every(([key, condition]) => {
    if (key === 'OR') return (condition as Row[]).some((branch) => matchesRun(run, branch))
    if (key === 'AND') return (condition as Row[]).every((branch) => matchesRun(run, branch))
    if (key === 'items') {
      const filter = condition as Row
      if (Object.keys(filter).some((operator) => operator !== 'some')) throw new Error(`unsupported items filter`)
      return run.items.some((item) => matchesWhere(item, filter.some as Row))
    }
    return matchesWhere(run, { [key]: condition })
  })
}

const salaryRunFindFirst = vi.fn(async (args: { where: Row }) => runs.find((run) => matchesRun(run, args.where)) ?? null)
const tx = { salaryRun: { findFirst: salaryRunFindFirst } } as unknown as Prisma.TransactionClient

function run(overrides: Partial<Run>): Run {
  return {
    id: 'run_1',
    companyId: 'company_1',
    siteId: 'site_a',
    status: 'APPROVED',
    periodStart: day('2026-09-01'),
    periodEnd: day('2026-09-07'),
    items: [],
    ...overrides,
  }
}

const IN_PERIOD = day('2026-09-04')
const BOOKING = { labourId: 'labour_1', siteId: 'site_a' }

beforeEach(() => {
  runs = []
  salaryRunFindFirst.mockClear()
})

describe('assertPayrollPeriodOpen', () => {
  it('refuses any worker of the company in a company-wide finalized run', async () => {
    runs = [run({ siteId: null })]
    await expect(
      assertPayrollPeriodOpen(tx, 'company_1', IN_PERIOD, [{ labourId: 'labour_9', siteId: 'site_z' }]),
    ).rejects.toBeInstanceOf(PayrollPeriodClosedError)
  })

  it('refuses a booking on the exact site of a finalized site run', async () => {
    runs = [run({ siteId: 'site_a' })]
    await expect(assertPayrollPeriodOpen(tx, 'company_1', IN_PERIOD, [BOOKING])).rejects.toThrow(PAYROLL_PERIOD_CLOSED)
  })

  it('refuses a worker the finalized run explicitly includes, wherever it is booked', async () => {
    runs = [run({ siteId: 'site_b', items: [{ labourId: 'labour_1' }] })]
    await expect(assertPayrollPeriodOpen(tx, 'company_1', IN_PERIOD, [BOOKING])).rejects.toBeInstanceOf(
      PayrollPeriodClosedError,
    )
  })

  it('checks every booking of a batch write', async () => {
    runs = [run({ siteId: 'site_b' })]
    await expect(
      assertPayrollPeriodOpen(tx, 'company_1', IN_PERIOD, [BOOKING, { labourId: 'labour_2', siteId: 'site_b' }]),
    ).rejects.toBeInstanceOf(PayrollPeriodClosedError)
  })

  it('allows an unrelated site and an unrelated worker', async () => {
    runs = [run({ siteId: 'site_b', items: [{ labourId: 'labour_2' }] })]
    await expect(assertPayrollPeriodOpen(tx, 'company_1', IN_PERIOD, [BOOKING])).resolves.toBeUndefined()
  })

  it('allows a DRAFT run of any scope', async () => {
    runs = [
      run({ status: 'DRAFT', siteId: null }),
      run({ status: 'DRAFT', siteId: 'site_a', items: [{ labourId: 'labour_1' }] }),
    ]
    await expect(assertPayrollPeriodOpen(tx, 'company_1', IN_PERIOD, [BOOKING])).resolves.toBeUndefined()
  })

  it.each(['SUBMITTED', 'VERIFIED', 'APPROVED', 'PAID'])('refuses a %s run', async (status) => {
    runs = [run({ status })]
    await expect(assertPayrollPeriodOpen(tx, 'company_1', IN_PERIOD, [BOOKING])).rejects.toBeInstanceOf(
      PayrollPeriodClosedError,
    )
  })

  it('ignores a finalized run of another company', async () => {
    runs = [
      run({ companyId: 'company_2', siteId: null }),
      run({ companyId: 'company_2', siteId: 'site_a', items: [{ labourId: 'labour_1' }] }),
    ]
    await expect(assertPayrollPeriodOpen(tx, 'company_1', IN_PERIOD, [BOOKING])).resolves.toBeUndefined()
    expect(salaryRunFindFirst.mock.calls[0][0].where).toMatchObject({ companyId: 'company_1' })
  })

  it('closes both period bounds inclusively and nothing outside them', async () => {
    runs = [run({})]
    await expect(assertPayrollPeriodOpen(tx, 'company_1', day('2026-09-01'), [BOOKING])).rejects.toThrow()
    await expect(assertPayrollPeriodOpen(tx, 'company_1', day('2026-09-07'), [BOOKING])).rejects.toThrow()
    await expect(assertPayrollPeriodOpen(tx, 'company_1', day('2026-08-31'), [BOOKING])).resolves.toBeUndefined()
    await expect(assertPayrollPeriodOpen(tx, 'company_1', day('2026-09-08'), [BOOKING])).resolves.toBeUndefined()
  })

  it('compares the stored calendar day, not the time of day', async () => {
    runs = [run({})]
    await expect(
      assertPayrollPeriodOpen(tx, 'company_1', new Date('2026-09-07T18:30:00.000Z'), [BOOKING]),
    ).rejects.toBeInstanceOf(PayrollPeriodClosedError)
  })

  it('reads nothing when there is nothing to write', async () => {
    runs = [run({ siteId: null })]
    await expect(assertPayrollPeriodOpen(tx, 'company_1', IN_PERIOD, [])).resolves.toBeUndefined()
    expect(salaryRunFindFirst).not.toHaveBeenCalled()
  })
})

describe('lockPayrollPeriodForTransition', () => {
  const LABOUR: Row[] = [
    { id: 'labour_1', companyId: 'company_1', siteId: 'site_a' },
    { id: 'labour_2', companyId: 'company_1', siteId: 'site_b' },
    { id: 'labour_3', companyId: 'company_1', siteId: 'site_c' },
    { id: 'labour_x', companyId: 'company_2', siteId: 'site_a' },
  ]
  const ATTENDANCE: Row[] = [
    { labourId: 'labour_1', siteId: 'site_a', date: day('2026-09-02') },
    { labourId: 'labour_2', siteId: 'site_b', date: day('2026-09-03') },
    { labourId: 'labour_3', siteId: 'site_c', date: day('2026-09-03') },
    { labourId: 'labour_1', siteId: 'site_a', date: day('2026-09-20') },
    { labourId: 'labour_x', siteId: 'site_a', date: day('2026-09-02') },
  ]
  const labourOf = (row: Row, key: string) =>
    key === 'labour' ? LABOUR.find((labour) => labour.id === row.labourId) ?? null : undefined

  function lockTx() {
    const attendance = inMemoryDelegate(ATTENDANCE, labourOf)
    const labour = inMemoryDelegate(LABOUR)
    const client = {
      salaryRun: { findFirst: salaryRunFindFirst },
      labourAttendance: { count: vi.fn(attendance.count) },
      labour: { count: vi.fn(labour.count) },
    }
    return client
  }

  it('reads every attendance row and worker of the company for a company-wide run', async () => {
    runs = [run({ siteId: null, status: 'DRAFT', items: [{ labourId: 'labour_1' }] })]
    const client = lockTx()
    await lockPayrollPeriodForTransition(client as unknown as Prisma.TransactionClient, {
      id: 'run_1',
      companyId: 'company_1',
      siteId: null,
    })
    await expect(client.labourAttendance.count.mock.results[0].value).resolves.toBe(3)
    await expect(client.labour.count.mock.results[0].value).resolves.toBe(3)
  })

  it('reads the site and explicitly included workers for a site run', async () => {
    runs = [run({ siteId: 'site_a', status: 'DRAFT', items: [{ labourId: 'labour_2' }] })]
    const client = lockTx()
    await lockPayrollPeriodForTransition(client as unknown as Prisma.TransactionClient, {
      id: 'run_1',
      companyId: 'company_1',
      siteId: 'site_a',
    })
    await expect(client.labourAttendance.count.mock.results[0].value).resolves.toBe(2)
    await expect(client.labour.count.mock.results[0].value).resolves.toBe(2)
  })

  it('reads nothing for a run outside the exact binding', async () => {
    runs = [run({ siteId: 'site_a', status: 'DRAFT' })]
    const client = lockTx()
    await lockPayrollPeriodForTransition(client as unknown as Prisma.TransactionClient, {
      id: 'run_1',
      companyId: 'company_2',
      siteId: 'site_a',
    })
    expect(client.labourAttendance.count).not.toHaveBeenCalled()
    expect(client.labour.count).not.toHaveBeenCalled()
  })
})

describe('payrollTransaction', () => {
  const conflict = () => Object.assign(new Error('Transaction failed due to a write conflict or a deadlock'), { code: 'P2034' })

  function client(outcomes: Array<unknown | Error>) {
    const $transaction = vi.fn(async (fn: (inner: Prisma.TransactionClient) => Promise<unknown>) => {
      const outcome = outcomes.shift()
      if (outcome instanceof Error) throw outcome
      return fn(tx)
    })
    return { $transaction }
  }

  it('runs one SERIALIZABLE interactive transaction', async () => {
    const db = client(['ok'])
    const fn = vi.fn(async () => 'result')
    await expect(payrollTransaction(db as never, fn)).resolves.toBe('result')
    expect(PAYROLL_TRANSACTION_OPTIONS).toEqual({ isolationLevel: 'Serializable' })
    expect(db.$transaction).toHaveBeenCalledTimes(1)
    expect(db.$transaction).toHaveBeenCalledWith(fn, { isolationLevel: 'Serializable' })
    expect(fn).toHaveBeenCalledWith(tx)
  })

  it('retries a P2034 serialization failure from the start', async () => {
    const db = client([conflict(), 'ok'])
    const fn = vi.fn(async () => 'result')
    await expect(payrollTransaction(db as never, fn)).resolves.toBe('result')
    expect(db.$transaction).toHaveBeenCalledTimes(2)
    for (const call of db.$transaction.mock.calls) expect(call[1]).toEqual({ isolationLevel: 'Serializable' })
  })

  it('does not retry any other error', async () => {
    const closed = new PayrollPeriodClosedError()
    const unique = Object.assign(new Error('Unique constraint failed'), { code: 'P2002' })
    for (const error of [closed, unique, new Error('boom')]) {
      const db = client([error, 'ok'])
      await expect(payrollTransaction(db as never, async () => 'result')).rejects.toBe(error)
      expect(db.$transaction).toHaveBeenCalledTimes(1)
    }
  })

  it('does not retry an error the callback throws inside the transaction', async () => {
    const db = client(['ok', 'ok'])
    const fn = vi.fn(async () => {
      throw new PayrollPeriodClosedError()
    })
    await expect(payrollTransaction(db as never, fn)).rejects.toBeInstanceOf(PayrollPeriodClosedError)
    expect(fn).toHaveBeenCalledTimes(1)
  })

  it('gives up after the capped number of attempts and throws the last conflict', async () => {
    expect(PAYROLL_TRANSACTION_ATTEMPTS).toBe(3)
    const failures = Array.from({ length: PAYROLL_TRANSACTION_ATTEMPTS + 2 }, conflict)
    const last = failures[PAYROLL_TRANSACTION_ATTEMPTS - 1]
    const db = client([...failures])
    await expect(payrollTransaction(db as never, async () => 'result')).rejects.toBe(last)
    expect(db.$transaction).toHaveBeenCalledTimes(PAYROLL_TRANSACTION_ATTEMPTS)
  })
})
