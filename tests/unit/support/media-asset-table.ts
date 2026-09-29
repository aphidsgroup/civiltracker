import { matchesWhere } from './prisma-where'
import type { Row } from './prisma-where'

/** Undo steps a transaction journals for its own writes; replayed newest first on rollback. */
export type Journal = Array<() => void>

export type MediaAssetUpdate = { where?: Row; data: Row }

/**
 * In-memory MediaAsset table for the one-time claim in `src/lib/uploads/media-claim.ts`.
 *
 * `updateMany` writes only the rows its `where` still matches, so the guarded claim
 * (`consumedAt: null`) answers `{ count: 1 }` for an unclaimed upload and `{ count: 0 }`
 * for one already consumed, and the bind (`consumedRecordId: null`) succeeds once.
 *
 * Each write is applied in one synchronous step, which is what the Postgres row lock gives
 * the real statement: a second claimer always sees the first claim. Writes are journalled
 * per transaction, so a transaction that throws undoes only its own claim — never a
 * concurrent transaction's — exactly like a real rollback.
 */
export function mediaAssetTable(seed: Row[]) {
  const rows = seed.map((row) => ({ consumedAt: null, consumedBy: null, consumedRecordId: null, ...row }))

  return {
    rows,
    findFirst: async (args: { where?: Row } = {}) => rows.find((row) => matchesWhere(row, args.where)) ?? null,
    updateMany: async ({ where, data }: MediaAssetUpdate, journal?: Journal) => {
      const matched = rows.filter((row) => matchesWhere(row, where))
      for (const row of matched) {
        const before = Object.fromEntries(Object.keys(data).map((key) => [key, row[key] ?? null]))
        Object.assign(row, data)
        journal?.push(() => Object.assign(row, before))
      }
      return { count: matched.length }
    },
  }
}

/** Where shape of the guarded claim, as opposed to the bind or a release. */
export function isClaim(args: MediaAssetUpdate) {
  return Boolean(args.where && 'consumedAt' in args.where && args.where.consumedAt === null)
}
