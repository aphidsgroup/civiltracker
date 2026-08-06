'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Eye, EyeOff } from 'lucide-react'
import { createCompany } from '@/actions/companies'

export default function NewCompanyPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showOwnerPassword, setShowOwnerPassword] = useState(false)

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setLoading(true)
    setError(null)

    const fd = new FormData(e.currentTarget)
    const data = {
      name: fd.get('name') as string,
      email: fd.get('email') as string || null,
      phone: fd.get('phone') as string || null,
      gst: fd.get('gst') as string || null,
      city: fd.get('city') as string || null,
      state: fd.get('state') as string || null,
      plan: 'FREE',
      status: 'ACTIVE',
      userLimit: 15,
      siteLimit: 15,
      storageLimitMb: 1024,
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

            <div className="mt-2 p-3 bg-blue-50 border border-blue-100 rounded-lg">
              <p className="text-xs text-blue-700 font-medium">
                ℹ️ Free Tier defaults: <strong>15 projects</strong> and <strong>15 users</strong>. Plan: <strong>FREE / ACTIVE</strong>.
              </p>
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
