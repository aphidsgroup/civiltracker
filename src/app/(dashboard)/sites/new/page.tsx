import { createSite } from '@/actions/sites'
import { requirePermission } from '@/lib/auth/require-permission'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { Building2, MapPin, Receipt, Calendar, Users, ArrowRight, Wallet, HardHat } from 'lucide-react'

export default async function NewSitePage() {
  await requirePermission('sites.create')

  async function submitAction(formData: FormData) {
    'use server'
    const data = Object.fromEntries(formData.entries())
    const res = await createSite(data)
    if (res?.success) {
      redirect(`/sites`)
    }
  }

  return (
    <div className="min-h-[calc(100vh-4rem)] bg-gradient-to-br from-slate-50 via-indigo-50/30 to-slate-50 p-6 md:p-8 relative overflow-hidden rounded-tl-3xl border-t border-l border-white/50">
      {/* Background Decorative Elements */}
      <div className="absolute top-0 left-0 w-full h-full overflow-hidden pointer-events-none -z-10">
        <div className="absolute top-[-10%] left-[-10%] w-96 h-96 rounded-full bg-indigo-500/10 blur-[100px]" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[30rem] h-[30rem] rounded-full bg-teal-500/10 blur-[100px]" />
      </div>

      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="mb-8 animate-in fade-in slide-in-from-bottom-4 duration-700">
          <Link href="/sites" className="inline-flex items-center text-sm font-medium text-slate-500 hover:text-indigo-600 transition-colors mb-2">
            <ArrowRight className="w-4 h-4 mr-1 rotate-180" />
            Back to Sites
          </Link>
          <h1 className="text-3xl md:text-4xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-indigo-700 to-teal-600">
            Create New Project
          </h1>
          <p className="text-slate-500 mt-2">Enter the details of your new construction site to get started.</p>
        </div>

        {/* Form Container */}
        <form action={submitAction} className="space-y-8 animate-in fade-in slide-in-from-bottom-8 duration-700 delay-150 fill-mode-both">
          {/* Glassmorphic Panel */}
          <div className="bg-white/60 backdrop-blur-xl border border-white/80 shadow-[0_8px_30px_rgb(0,0,0,0.04)] rounded-3xl p-6 md:p-8">
            
            {/* Section 1: Project Details */}
            <div className="mb-10">
              <div className="flex items-center gap-2 mb-6 border-b border-slate-200/50 pb-3">
                <div className="p-2.5 bg-indigo-100/50 rounded-xl text-indigo-600 shadow-sm border border-indigo-100">
                  <Building2 className="w-5 h-5" />
                </div>
                <h2 className="text-xl font-semibold text-slate-800">Project Details</h2>
              </div>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-2 col-span-1 md:col-span-2">
                  <label className="text-sm font-medium text-slate-700">Project Name *</label>
                  <input name="name" required placeholder="e.g. Skyline Towers" className="w-full bg-white/50 border border-slate-200 rounded-xl px-4 py-3 text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500 focus:bg-white shadow-sm transition-all duration-300 hover:border-slate-300" />
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium text-slate-700">Location *</label>
                  <div className="relative group">
                    <MapPin className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 group-focus-within:text-indigo-500 transition-colors" />
                    <input name="location" required placeholder="City, Region" className="w-full bg-white/50 border border-slate-200 rounded-xl pl-10 pr-4 py-3 text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500 focus:bg-white shadow-sm transition-all duration-300 hover:border-slate-300" />
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium text-slate-700">Detailed Address</label>
                  <div className="relative group">
                    <MapPin className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 group-focus-within:text-indigo-500 transition-colors" />
                    <input name="address" placeholder="Full street address" className="w-full bg-white/50 border border-slate-200 rounded-xl pl-10 pr-4 py-3 text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500 focus:bg-white shadow-sm transition-all duration-300 hover:border-slate-300" />
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium text-slate-700">Project Type</label>
                  <div className="relative group">
                    <HardHat className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 group-focus-within:text-indigo-500 transition-colors" />
                    <select name="projectType" className="w-full bg-white/50 border border-slate-200 rounded-xl pl-10 pr-4 py-3 text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500 focus:bg-white shadow-sm transition-all duration-300 hover:border-slate-300 appearance-none">
                      <option value="">Select type...</option>
                      <option value="RESIDENTIAL">Residential</option>
                      <option value="COMMERCIAL">Commercial</option>
                      <option value="INDUSTRIAL">Industrial</option>
                      <option value="INFRASTRUCTURE">Infrastructure</option>
                    </select>
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium text-slate-700">Contract Type</label>
                  <div className="relative group">
                    <Receipt className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 group-focus-within:text-indigo-500 transition-colors" />
                    <select name="contractType" className="w-full bg-white/50 border border-slate-200 rounded-xl pl-10 pr-4 py-3 text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500 focus:bg-white shadow-sm transition-all duration-300 hover:border-slate-300 appearance-none">
                      <option value="">Select type...</option>
                      <option value="LUMPSUM">Lumpsum</option>
                      <option value="ITEM_RATE">Item Rate</option>
                      <option value="TURNKEY">Turnkey</option>
                    </select>
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium text-slate-700">Total Area (Sqft)</label>
                  <input name="areaSqft" type="number" placeholder="e.g. 15000" className="w-full bg-white/50 border border-slate-200 rounded-xl px-4 py-3 text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500 focus:bg-white shadow-sm transition-all duration-300 hover:border-slate-300" />
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium text-slate-700">Number of Floors</label>
                  <input name="floors" type="number" placeholder="e.g. 5" className="w-full bg-white/50 border border-slate-200 rounded-xl px-4 py-3 text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500 focus:bg-white shadow-sm transition-all duration-300 hover:border-slate-300" />
                </div>
              </div>
            </div>

            {/* Section 2: Financials & Dates */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-10 mb-10">
              {/* Financials */}
              <div className="bg-slate-50/50 rounded-2xl p-6 border border-slate-100 shadow-sm">
                <div className="flex items-center gap-2 mb-6 border-b border-slate-200/50 pb-3">
                  <div className="p-2.5 bg-emerald-100/50 rounded-xl text-emerald-600 shadow-sm border border-emerald-100">
                    <Wallet className="w-5 h-5" />
                  </div>
                  <h2 className="text-xl font-semibold text-slate-800">Financials</h2>
                </div>
                <div className="space-y-5">
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-slate-700">Budget (₹) *</label>
                    <input name="budget" required type="number" placeholder="e.g. 50000000" className="w-full bg-white/70 border border-slate-200 rounded-xl px-4 py-3 text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/50 focus:border-emerald-500 focus:bg-white shadow-sm transition-all duration-300 hover:border-slate-300" />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-slate-700">Contract Value (₹)</label>
                    <input name="contractValue" type="number" placeholder="e.g. 55000000" className="w-full bg-white/70 border border-slate-200 rounded-xl px-4 py-3 text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/50 focus:border-emerald-500 focus:bg-white shadow-sm transition-all duration-300 hover:border-slate-300" />
                  </div>
                </div>
              </div>

              {/* Dates */}
              <div className="bg-slate-50/50 rounded-2xl p-6 border border-slate-100 shadow-sm">
                <div className="flex items-center gap-2 mb-6 border-b border-slate-200/50 pb-3">
                  <div className="p-2.5 bg-amber-100/50 rounded-xl text-amber-600 shadow-sm border border-amber-100">
                    <Calendar className="w-5 h-5" />
                  </div>
                  <h2 className="text-xl font-semibold text-slate-800">Timeline</h2>
                </div>
                <div className="space-y-5">
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-slate-700">Start Date</label>
                    <input name="startDate" type="date" className="w-full bg-white/70 border border-slate-200 rounded-xl px-4 py-3 text-slate-800 focus:outline-none focus:ring-2 focus:ring-amber-500/50 focus:border-amber-500 focus:bg-white shadow-sm transition-all duration-300 hover:border-slate-300" />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-slate-700">Target End Date</label>
                    <input name="targetEndDate" type="date" className="w-full bg-white/70 border border-slate-200 rounded-xl px-4 py-3 text-slate-800 focus:outline-none focus:ring-2 focus:ring-amber-500/50 focus:border-amber-500 focus:bg-white shadow-sm transition-all duration-300 hover:border-slate-300" />
                  </div>
                </div>
              </div>
            </div>

            {/* Section 3: Client Details */}
            <div>
              <div className="flex items-center gap-2 mb-6 border-b border-slate-200/50 pb-3">
                <div className="p-2.5 bg-blue-100/50 rounded-xl text-blue-600 shadow-sm border border-blue-100">
                  <Users className="w-5 h-5" />
                </div>
                <h2 className="text-xl font-semibold text-slate-800">Client Details</h2>
              </div>
              
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="space-y-2">
                  <label className="text-sm font-medium text-slate-700">Client Name</label>
                  <input name="clientName" placeholder="John Doe" className="w-full bg-white/50 border border-slate-200 rounded-xl px-4 py-3 text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500 focus:bg-white shadow-sm transition-all duration-300 hover:border-slate-300" />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium text-slate-700">Client Phone</label>
                  <input name="clientPhone" placeholder="+91 9876543210" className="w-full bg-white/50 border border-slate-200 rounded-xl px-4 py-3 text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500 focus:bg-white shadow-sm transition-all duration-300 hover:border-slate-300" />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium text-slate-700">Client Email</label>
                  <input name="clientEmail" type="email" placeholder="john@example.com" className="w-full bg-white/50 border border-slate-200 rounded-xl px-4 py-3 text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500 focus:bg-white shadow-sm transition-all duration-300 hover:border-slate-300" />
                </div>
              </div>
            </div>

          </div>

          {/* Form Actions */}
          <div className="flex items-center justify-end gap-4 mt-8 pb-10">
            <Link 
              href="/sites" 
              className="px-6 py-3 rounded-xl text-slate-600 font-medium hover:bg-slate-200/50 transition-colors duration-300 hover:text-slate-900"
            >
              Cancel
            </Link>
            <button 
              type="submit" 
              className="group relative px-8 py-3 rounded-xl font-semibold text-white bg-gradient-to-r from-indigo-600 to-teal-500 hover:from-indigo-500 hover:to-teal-400 shadow-[0_8px_20px_rgb(79,70,229,0.3)] hover:shadow-[0_8px_25px_rgb(79,70,229,0.4)] hover:-translate-y-0.5 active:translate-y-0 active:scale-95 transition-all duration-300 overflow-hidden"
            >
              <div className="absolute inset-0 w-full h-full bg-gradient-to-r from-transparent via-white/20 to-transparent -translate-x-full group-hover:animate-[shimmer_1.5s_infinite]" />
              <span className="relative flex items-center gap-2">
                Create Project
                <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
              </span>
            </button>
          </div>
        </form>
      </div>

      <style dangerouslySetInnerHTML={{ __html: `
        @keyframes shimmer {
          100% { transform: translateX(100%); }
        }
      `}} />
    </div>
  )
}
