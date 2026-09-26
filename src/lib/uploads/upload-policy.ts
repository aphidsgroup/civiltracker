import type { Permission } from '@/lib/permissions'

/** Hard ceiling for one uploaded file. */
export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024

const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'] as const
const DOCUMENT_TYPES = [...IMAGE_TYPES, 'application/pdf'] as const

export type UploadMime = (typeof DOCUMENT_TYPES)[number]

/**
 * What an upload module needs: the live role must hold one of `permissions`, the company
 * must have `module` enabled, and the file content must be one of `accepts`.
 */
export type UploadPolicy = {
  permissions: readonly Permission[]
  module: string
  accepts: readonly UploadMime[]
}

const PHOTO_EVIDENCE: UploadPolicy = { permissions: ['sitePhotos.upload', 'dpr.create'], module: 'DPR', accepts: IMAGE_TYPES }

export const UPLOAD_POLICIES = {
  BILL: { permissions: ['bills.upload'], module: 'BILLS', accepts: DOCUMENT_TYPES },
  // Same grants as a checklist completion photo: field staff, and managers of tasks.
  SITE_PHOTO: { permissions: ['sitePhotos.upload', 'tasks.manage'], module: 'TASKS', accepts: IMAGE_TYPES },
  QUALITY_PHOTO: PHOTO_EVIDENCE,
  SAFETY_PHOTO: PHOTO_EVIDENCE,
  DOCUMENT: { permissions: ['documents.upload'], module: 'DOCUMENTS', accepts: DOCUMENT_TYPES },
  SALARY_PROOF: { permissions: ['salary.markPaid'], module: 'LABOUR', accepts: DOCUMENT_TYPES },
  DELIVERY_CHALLAN: { permissions: ['materials.create'], module: 'MATERIALS', accepts: DOCUMENT_TYPES },
  PAYMENT_PROOF: { permissions: ['payments.manage'], module: 'CLIENTS', accepts: DOCUMENT_TYPES },
} as const satisfies Record<string, UploadPolicy>

export type UploadModule = keyof typeof UPLOAD_POLICIES

export function uploadPolicyFor(moduleName: string): { name: UploadModule; policy: UploadPolicy } | null {
  const name = moduleName.trim().toUpperCase()
  if (!Object.prototype.hasOwnProperty.call(UPLOAD_POLICIES, name)) return null
  return { name: name as UploadModule, policy: UPLOAD_POLICIES[name as UploadModule] }
}

/** The storage format Cloudinary is restricted to for each accepted content type. */
export const UPLOAD_FORMATS: Record<UploadMime, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/heic': 'heic',
  'image/heif': 'heif',
  'application/pdf': 'pdf',
}

const HEIF_BRANDS: Record<string, UploadMime> = {
  heic: 'image/heic', heix: 'image/heic', hevc: 'image/heic', hevx: 'image/heic', heim: 'image/heic', heis: 'image/heic',
  mif1: 'image/heif', msf1: 'image/heif',
}

function ascii(bytes: Uint8Array, start: number, end: number) {
  return String.fromCharCode(...bytes.subarray(start, end))
}

/**
 * The content type from the file's leading bytes, or null for anything that is not an
 * accepted image or PDF. The client-declared type and file name are never trusted.
 */
export function sniffUploadMime(bytes: Uint8Array): UploadMime | null {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'image/jpeg'
  if (bytes.length >= 8 && [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a].every((byte, i) => bytes[i] === byte)) return 'image/png'
  if (bytes.length >= 12 && ascii(bytes, 0, 4) === 'RIFF' && ascii(bytes, 8, 12) === 'WEBP') return 'image/webp'
  if (bytes.length >= 5 && ascii(bytes, 0, 5) === '%PDF-') return 'application/pdf'
  if (bytes.length >= 12 && ascii(bytes, 4, 8) === 'ftyp') return HEIF_BRANDS[ascii(bytes, 8, 12)] ?? null
  return null
}

const HEIF_FAMILY: ReadonlySet<string> = new Set(['image/heic', 'image/heif'])

/**
 * Whether a client-declared type agrees with the sniffed one. An empty or generic
 * declaration is allowed (some mobile pickers omit it, and multipart then reports
 * `application/octet-stream`); `image/jpg` is read as `image/jpeg`.
 */
export function declaredTypeMatches(declared: string, sniffed: UploadMime): boolean {
  const type = declared.trim().toLowerCase().split(';')[0]
  if (!type || type === 'application/octet-stream') return true
  const normalized = type === 'image/jpg' ? 'image/jpeg' : type
  if (normalized === sniffed) return true
  return HEIF_FAMILY.has(normalized) && HEIF_FAMILY.has(sniffed)
}
