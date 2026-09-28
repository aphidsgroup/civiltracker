import type {
  recordLabourAdvanceAction,
  saveContractorAttendance,
  saveMobileAttendanceAction,
  updateWorkerAction,
} from '@/actions/mobile-labour'
import { MAX_AMOUNT_10_2, paise, parseAmountText, parseFinancialReason } from '@/lib/validation/financial-mutations'

/*
 * The payloads the muster-roll screens send. Marking the roll and editing a worker move
 * no money, so those payloads carry no advance at all — never the stored one echoed back.
 * An advance is sent only through the explicit payment inputs below, which carry the
 * amount as decimal text, the typed-back name and a reason; a positive amount is never
 * dropped silently: it is either sent with those or refused with a message.
 */

type MusterRow = Parameters<typeof saveMobileAttendanceAction>[0][number]
type WorkerEdit = Parameters<typeof updateWorkerAction>[0]
type ContractorLog = Parameters<typeof saveContractorAttendance>[0]
type LabourAdvance = Parameters<typeof recordLabourAdvanceAction>[0]

export type PayloadResult<T> = { ok: true; payload: T } | { ok: false; error: string }

/** One muster-roll row: status and start time only. */
export function musterRollRow(row: { labourId: string; siteId: string; status: string; startTime?: string }): MusterRow {
  return { labourId: row.labourId, siteId: row.siteId, status: row.status, startTime: row.startTime }
}

/** A worker profile edit: name, trade, wage and site only. */
export function workerEditPayload(edit: {
  id: string
  name: string
  trade: string
  customTrade?: string
  dailyWage: number
  siteId: string
}): WorkerEdit {
  return {
    id: edit.id,
    name: edit.name,
    trade: edit.trade,
    customTrade: edit.customTrade,
    dailyWage: edit.dailyWage,
    siteId: edit.siteId,
  }
}

/** Blank or a zero amount: the form asks for no money. */
function isBlankAmount(text: string) {
  const value = text.trim()
  return value === '' || /^0+(\.0{1,2})?$/.test(value)
}

/** The error text of a thrown validation error. */
function messageOf(err: unknown, fallback: string) {
  return err instanceof Error ? err.message : fallback
}

/**
 * A contractor headcount log. With no advance entered it carries no advance fields. With
 * a positive advance it carries the decimal text, the typed-back name and the reason —
 * and only for a user who may pay; for anyone else it is refused, not dropped.
 */
export function contractorLogPayload(
  log: {
    siteId: string
    contractorName: string
    contractorType: string
    labourCount: number
    startTime?: string
    advance?: { amount: string; confirmation: string; reason: string }
  },
  canManagePayments: boolean,
): PayloadResult<ContractorLog> {
  const base: ContractorLog = {
    siteId: log.siteId,
    contractorName: log.contractorName,
    contractorType: log.contractorType,
    labourCount: log.labourCount,
    startTime: log.startTime,
  }
  if (!log.advance || isBlankAmount(log.advance.amount)) return { ok: true, payload: base }
  if (!canManagePayments) {
    return { ok: false, error: 'A contractor advance is a payment and needs payment access. Save the log without it.' }
  }

  const amount = log.advance.amount.trim()
  try {
    parseAmountText(amount, 'daily advance', { max: MAX_AMOUNT_10_2, positive: true })
    const reason = parseFinancialReason(log.advance.reason, 'Advance reason')
    const confirmation = log.advance.confirmation.trim()
    if (!confirmation) return { ok: false, error: "Type the contractor's registered name to confirm the advance." }
    return { ok: true, payload: { ...base, dailyAdvance: amount, advanceConfirmation: confirmation, advanceReason: reason } }
  } catch (err) {
    return { ok: false, error: messageOf(err, 'Invalid daily advance') }
  }
}

/**
 * An advance paid to a worker today: positive decimal text, the balance the payer saw as
 * `expectedAdvance`, the worker's name typed back and a reason.
 */
export function labourAdvancePayload(input: {
  labourId: string
  siteId: string
  amount: string
  currentAdvance: number
  confirmation: string
  reason: string
}): PayloadResult<LabourAdvance> {
  const amount = input.amount.trim()
  try {
    parseAmountText(amount, 'advance amount', { max: MAX_AMOUNT_10_2, positive: true })
    const reason = parseFinancialReason(input.reason, 'Advance reason')
    const confirmation = input.confirmation.trim()
    if (!confirmation) return { ok: false, error: "Type the worker's name to confirm the advance." }
    return {
      ok: true,
      payload: {
        labourId: input.labourId,
        siteId: input.siteId,
        amount,
        expectedAdvance: (paise(input.currentAdvance) / 100).toFixed(2),
        confirmationText: confirmation,
        reason,
      },
    }
  } catch (err) {
    return { ok: false, error: messageOf(err, 'Invalid advance amount') }
  }
}
