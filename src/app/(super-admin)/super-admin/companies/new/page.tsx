'use client'

import { useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Eye, EyeOff, Upload, X, Building2, Image as ImageIcon } from 'lucide-react'
import { createCompany } from '@/actions/companies'

export default function NewCompanyPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showOwnerPassword, setShowOwnerPassword] = useState(false)
  
  // Logo state
  const [logoPreview, setLogoPreview] = useState<string | null>(null)
  const [logoLoading, setLogoLoading] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Handle Logo file selection and compression
  async function handleLogoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return

    setLogoLoading(true)
    setError(null)

    try {
      // 1. Process client-side downscale to keep it super crisp & lightweight (~20KB)
      const reader = new FileReader()
      reader.onload = async (event) => {
        const img = new Image()
        img.onload = async () => {
          const canvas = document.createElement('canvas')
          const maxDim = 256
          let width = img.width
          let height = img.height

          if (width > height) {
            if (width > maxDim) {
              height = Math.round((height * maxDim) / width)
              width = maxDim
            }
          } else {
            if (height > maxDim) {
              width = Math.round((width * maxDim) / height)
              height = maxDim
            }
          }

          canvas.width = width
          canvas.height = height
          const ctx = canvas.getContext('2d')
          if (ctx) {
            ctx.drawImage(img, 0, 0, width, height)
            const compressedDataUrl = canvas.toDataURL('image/png', 0.9)
            setLogoPreview(compressedDataUrl)

            // 2. Also try uploading to /api/upload for cloud URL if available
            try {
              canvas.toBlob(async (blob) => {
                if (!blob) return
                const formData = new FormData()
                formData.append('file', blob, 'logo.png')
                formData.append('module', 'LOGO')

                const res = await fetch('/api/upload', {
                  method: 'POST',
                  body: formData,
                })
                if (res.ok) {
                  const json = await res.json()
                  if (json.url) {
                    setLogoPreview(json.url)
                  }
                }
              }, 'image/png')
            } catch {
              // Keep compressedDataUrl fallback
            }
          }
          setLogoLoading(false)
        }
        img.src = event.target?.result as string
      }
      reader.readAsDataURL(file)
    } catch {
      setLogoLoading(false)
    }
  }

  function handleRemoveLogo() {
    setLogoPreview(null)
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setLoading(true)
    setError(null)

    const fd = new FormData(e.currentTarget)
    const data = {
      name: fd.get('name') as string,
      logo: logoPreview || null,
      email: fd.get('email') as string || null,
      phone: fd.get('phone') as string || null,
      gst: fd.get('gst') as string || null,
      city: fd.get('city') as string || null,
      state: fd.get('state') as string || null,
      plan: (fd.get('plan') as string) || 'STARTER',
      status: 'ACTIVE',
      userLimit: Number(fd.get('userLimit')) || 30,
      siteLimit: Number(fd.get('siteLimit')) || 75,
      storageLimitMb: Number(fd.get('storageLimitMb')) || 5120,
      ownerName: fd.get('ownerName') as string,
      ownerEmail: fd.get('ownerEmail') as string,
      ownerPassword: fd.get('ownerPassword') as string,
    }

    try {
      await createCompany(data)
      router.push('/super-admin/companies')
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to create company')
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-gray-50/50">
      <div className="flex items-center px-6 py-4 bg-white border-b border-gray-200">
        <h1 className="text-xl font-semibold text-gray-900">Create Company</h1>
      </div>

      <div className="p-6 max-w-2xl">
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6">
          <form onSubmit={handleSubmit}>
            {error && (
              <div className="mb-4 p-3 bg-rose-50 border border-rose-200 rounded-lg text-sm text-rose-700 font-medium">
                {error}
              </div>
            )}

            {/* Logo Upload Section */}
            <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-3">Company Brand & Logo</p>
            <div className="mb-6 p-4 border border-dashed border-gray-300 rounded-xl bg-gray-50/50 flex flex-col sm:flex-row items-center gap-4">
              <div className="relative w-20 h-20 rounded-xl bg-white border border-gray-200 flex items-center justify-center overflow-hidden flex-shrink-0 shadow-sm">
                {logoPreview ? (
                  <img src={logoPreview} alt="Logo preview" className="w-full h-full object-contain p-1" />
                ) : (
                  <Building2 className="w-8 h-8 text-gray-300" />
                )}
                {logoLoading && (
                  <div className="absolute inset-0 bg-black/40 flex items-center justify-center text-white text-xs font-bold">
                    ...
                  </div>
                )}
              </div>

              <div className="flex-1 text-center sm:text-left">
                <div className="text-sm font-bold text-gray-800">Company Logo</div>
                <p className="text-xs text-gray-500 mt-0.5">
                  Appears in company admin header, site engineers&apos; mobile app, and client portal.
                </p>
                <div className="mt-2.5 flex items-center justify-center sm:justify-start gap-2">
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/png,image/jpeg,image/svg+xml,image/webp"
                    className="hidden"
                    onChange={handleLogoChange}
                  />
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white border border-gray-300 rounded-lg text-xs font-bold text-gray-700 hover:bg-gray-50 shadow-sm transition-colors cursor-pointer"
                  >
                    <Upload size={13} />
                    {logoPreview ? 'Change Logo' : 'Upload Logo'}
                  </button>
                  {logoPreview && (
                    <button
                      type="button"
                      onClick={handleRemoveLogo}
                      className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-semibold text-rose-600 hover:bg-rose-50 rounded-lg transition-colors cursor-pointer"
                    >
                      <X size={13} /> Remove
                    </button>
                  )}
                </div>
              </div>
            </div>

            {/* Company Info */}
            <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-3">Company Info</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
              <div className="sm:col-span-2">
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">Company Name *</label>
                <input name="name" required placeholder="Madras Construction Pvt Ltd"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-[#fc6e20] focus:border-transparent" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">Company Email</label>
                <input name="email" type="email" placeholder="office@company.com"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-[#fc6e20] focus:border-transparent" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">Phone</label>
                <input name="phone" type="tel" placeholder="+91 98765 43210"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-[#fc6e20] focus:border-transparent" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">GST Number</label>
                <input name="gst" placeholder="22AAAAA0000A1Z5"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-[#fc6e20] focus:border-transparent" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">City</label>
                <input name="city" placeholder="Chennai"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-[#fc6e20] focus:border-transparent" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">State</label>
                <input name="state" placeholder="Tamil Nadu"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-[#fc6e20] focus:border-transparent" />
              </div>
            </div>

            {/* Plan & Capacity Limits */}
            <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-3 pt-4 border-t border-gray-100">Plan & Scale Limits</p>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">Project / Site Limit *</label>
                <input name="siteLimit" type="number" defaultValue={75} min={1} required
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-[#fc6e20] focus:border-transparent" />
                <span className="text-[10px] text-gray-400 font-medium">Ready for 50+ projects</span>
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">Team User Limit *</label>
                <input name="userLimit" type="number" defaultValue={50} min={1} required
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-[#fc6e20] focus:border-transparent" />
                <span className="text-[10px] text-gray-400 font-medium">Engineers, PMs, Staff</span>
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">Storage Limit (MB) *</label>
                <input name="storageLimitMb" type="number" defaultValue={5120} min={100} required
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-[#fc6e20] focus:border-transparent" />
                <span className="text-[10px] text-gray-400 font-medium">5120 MB = 5 GB</span>
              </div>
            </div>

            {/* Admin Account */}
            <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-3 pt-4 border-t border-gray-100">Company Admin Account</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="sm:col-span-2">
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">Admin Name *</label>
                <input name="ownerName" required placeholder="Rajan Kumar"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-[#fc6e20] focus:border-transparent" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">Admin Email *</label>
                <input name="ownerEmail" type="email" required placeholder="admin@company.com"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-[#fc6e20] focus:border-transparent" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">Admin Password *</label>
                <div className="relative">
                  <input name="ownerPassword" type={showOwnerPassword ? 'text' : 'password'} required minLength={6} placeholder="Min 6 characters"
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 pr-10 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-[#fc6e20] focus:border-transparent" />
                  <button
                    type="button"
                    aria-label={showOwnerPassword ? 'Hide admin password' : 'Show admin password'}
                    onClick={() => setShowOwnerPassword(v => !v)}
                    className="absolute inset-y-0 right-3 flex items-center text-gray-400 hover:text-gray-600"
                  >
                    {showOwnerPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
              </div>
            </div>

            <div className="mt-6 flex items-center gap-3">
              <button type="submit" disabled={loading}
                className="px-5 py-2.5 bg-[#fc6e20] hover:bg-[#e85b0d] disabled:opacity-60 text-white text-sm font-semibold rounded-lg shadow-sm transition-colors cursor-pointer">
                {loading ? 'Creating…' : 'Create Company'}
              </button>
              <Link href="/super-admin/companies"
                className="px-5 py-2.5 bg-gray-100 hover:bg-gray-200 text-gray-700 text-sm font-medium rounded-lg transition-colors inline-block">
                Cancel
              </Link>
            </div>
          </form>
        </div>
      </div>
    </div>
  )
}
