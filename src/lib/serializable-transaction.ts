import type { Prisma, PrismaClient } from '@prisma/client'

/*
 * A SERIALIZABLE interactive transaction retried on serialization failure.
 *
 * Two writers that each read what the other writes (a check followed by a guarded write)
 * cannot both commit at SERIALIZABLE: PostgreSQL aborts one of them with a serialization
 * failure, which Prisma reports as `P2034`. The loser is re-run from the start on a fresh
 * snapshot, where it sees the winner's committed state and either refuses or proceeds on
 * it. No raw SQL is involved.
 */

export const SERIALIZABLE_TRANSACTION_OPTIONS = { isolationLevel: 'Serializable' } as const
export const SERIALIZABLE_TRANSACTION_ATTEMPTS = 3

/** Prisma's code for a serialization failure or deadlock that rolled the transaction back. */
export function isSerializationFailure(error: unknown) {
  return typeof error === 'object' && error !== null && (error as { code?: unknown }).code === 'P2034'
}

/**
 * Runs `fn` as one SERIALIZABLE interactive transaction, retrying it from the start (at
 * most `SERIALIZABLE_TRANSACTION_ATTEMPTS` runs in all) only when the database rolled it
 * back for a serialization conflict. Any other error, and the last conflict, is thrown as is.
 */
export async function serializableTransaction<T>(
  client: Pick<PrismaClient, '$transaction'>,
  fn: (tx: Prisma.TransactionClient) => Promise<T>,
): Promise<T> {
  for (let attempt = 1; ; attempt++) {
    try {
      return await client.$transaction(fn, SERIALIZABLE_TRANSACTION_OPTIONS)
    } catch (error) {
      if (attempt >= SERIALIZABLE_TRANSACTION_ATTEMPTS || !isSerializationFailure(error)) throw error
    }
  }
}
