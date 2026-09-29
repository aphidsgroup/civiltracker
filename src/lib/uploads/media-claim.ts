import type { Prisma } from '@prisma/client'

/*
 * One-time claim of an uploaded MediaAsset by the evidence record it backs.
 *
 * An upload may back exactly one bill attachment or site/checklist photo. Checking for an
 * existing evidence row and then creating one is not enough under READ COMMITTED: two
 * concurrent requests both see "no row yet" and both attach. The claim is instead a
 * guarded `updateMany` on the MediaAsset row itself (`consumedAt: null` in the `where`),
 * which Postgres serialises on the row lock: the second writer blocks until the first
 * transaction ends, re-evaluates the predicate against the committed row and matches
 * nothing. The claim is written on the caller's transaction client, so if anything later
 * in that transaction fails the claim rolls back with it and the upload is claimable again;
 * there is no separate release step.
 *
 * Rows that predate the claim columns (or were attached before the backfill ran) have
 * `consumedAt` null, so each flow also keeps its evidence-table check. That check now runs
 * while this transaction holds the asset row lock, so no concurrent claimer can interleave.
 *
 * `consumedBy` records the purpose, `consumedRecordId` the record that owns the claim, so a
 * deletion can tell whether the asset still backs something else.
 */

export type MediaClaimPurpose = 'EXPENSE_BILL' | 'SITE_PHOTO' | 'CHECKLIST_PHOTO'

/** Purpose stamped on an asset whose owning record is being deleted: never claimable again. */
export const MEDIA_RETIRED = 'RETIRED'

/** Purpose the migration backfill stamps on an asset already in use; its owner is unknown. */
export const MEDIA_LEGACY = 'LEGACY'

/** A refusal raised while claiming an upload; it rolls the caller's transaction back. */
export class MediaClaimRefusal extends Error {}

type MediaClaimClient = Pick<Prisma.TransactionClient, 'mediaAsset'>

/** Exactly which upload a flow may consume: tenant, site, upload module and uploader. */
export type MediaClaimPolicy = {
  id: string
  companyId: string
  siteId: string
  module: string
  uploadedById: string
}

/**
 * Claims the asset matching `policy` for `purpose`. Throws `MediaClaimRefusal(conflict)`
 * when the upload is already consumed (or was removed) by a concurrent or earlier request.
 * Call it on the transaction client that also writes the evidence record.
 */
export async function claimMediaAsset(
  tx: MediaClaimClient,
  policy: MediaClaimPolicy,
  purpose: MediaClaimPurpose,
  conflict: string,
) {
  const claimed = await tx.mediaAsset.updateMany({
    where: { ...policy, consumedAt: null },
    data: { consumedAt: new Date(), consumedBy: purpose },
  })
  if (claimed.count !== 1) throw new MediaClaimRefusal(conflict)
}

/**
 * Records which evidence record owns the claim. Must follow `claimMediaAsset` on the same
 * transaction; a mismatch means the claim was not ours and the transaction is aborted.
 */
export async function bindMediaClaim(
  tx: MediaClaimClient,
  assetId: string,
  purpose: MediaClaimPurpose,
  recordId: string,
  conflict: string,
) {
  const bound = await tx.mediaAsset.updateMany({
    where: { id: assetId, consumedBy: purpose, consumedRecordId: null },
    data: { consumedRecordId: recordId },
  })
  if (bound.count !== 1) throw new MediaClaimRefusal(conflict)
}

/**
 * Takes the storage backing a deleted record out of circulation, on the deleting
 * transaction, before deciding whether the stored file may be destroyed.
 *
 * The asset row is retired only if it is unclaimed, retired, backfilled as LEGACY, or
 * claimed by `recordId`; the update
 * takes the row lock, so a concurrent attach either finished first (the asset is now
 * claimed by the new record, nothing is retired) or blocks and then finds the asset
 * retired or gone. `stillReferenced` must be re-read *after* this call so it sees any
 * record a concurrent attach committed while we waited on the lock.
 *
 * Returns true only when the stored file backs nothing any more: no evidence row still
 * references the public id, and no MediaAsset row for it survives (one this record did not
 * own belongs to a live claim or another tenant, and its storage is kept).
 */
export async function releaseMediaForDeletedRecord(
  tx: MediaClaimClient,
  target: { cloudinaryPublicId: string; companyId: string; recordId: string },
  stillReferenced: () => Promise<boolean>,
) {
  const { cloudinaryPublicId, companyId, recordId } = target
  // Retired and backfilled assets are never claimable and have no live owner, so the last
  // of several records sharing one file may take it over and release it.
  await tx.mediaAsset.updateMany({
    where: {
      cloudinaryPublicId,
      companyId,
      OR: [
        { consumedRecordId: recordId },
        { consumedAt: null },
        { consumedBy: { in: [MEDIA_RETIRED, MEDIA_LEGACY] } },
      ],
    },
    data: { consumedAt: new Date(), consumedBy: MEDIA_RETIRED, consumedRecordId: recordId },
  })

  // Another record still shows this file: keep the (now unclaimable) asset and its storage.
  if (await stillReferenced()) return false

  await tx.mediaAsset.deleteMany({
    where: { cloudinaryPublicId, companyId, consumedBy: MEDIA_RETIRED, consumedRecordId: recordId },
  })
  return (await tx.mediaAsset.count({ where: { cloudinaryPublicId } })) === 0
}
