'use client'

import { useState, useTransition, useEffect } from 'react'
import { updateSiteDetails } from '@/actions/site'
import { Loader2, X, Building2 } from 'lucide-react'

type SiteData = {
  id: string
  name: string
  location: string
  address: string | null
  projectType: string | null
  clientName: string | null
  clientPhone: string | null
  areaSqft: number | null
  budget: number
  startDate: Date | null
  targetEndDate: Date | null
  status: string
}

export function EditSiteModal({ site }: { site: SiteData }) {
  const [open, setOpen] = useState(false)
  const [isPending, startTransition] = useTransition()
  
  const [name, setName] = useState(site.name)
  const [location, setLocation] = useState(site.location)
  const [address, setAddress] = useState(site.address || '')
  const [projectType, setProjectType] = useState(site.projectType || '')
  
  const [clientName, setClientName] = useState(site.clientName || '')
  const [clientPhone, setClientPhone] = useState(site.clientPhone || '')
  const [areaSqft, setAreaSqft] = useState(site.areaSqft ? String(site.areaSqft) : '')
  
  const [budget, setBudget] = useState(String(site.budget))
  const [startDate, setStartDate] = useState(site.startDate ? new Date(site.startDate).toISOString().split('T')[0] : '')
  const [targetEndDate, setTargetEndDate] = useState(site.targetEndDate ? new Date(site.targetEndDate).toISOString().split('T')[0] : '')
  const [status, setStatus] = useState(site.status)

  useEffect(() => {
    setName(site.name)
    setLocation(site.location)
    setAddress(site.address || '')
    setProjectType(site.projectType || '')
    setClientName(site.clientName || '')
    setClientPhone(site.clientPhone || '')
    setAreaSqft(site.areaSqft ? String(site.areaSqft) : '')
    setBudget(String(site.budget))
    setStartDate(site.startDate ? new Date(site.startDate).toISOString().split('T')[0] : '')
    setTargetEndDate(site.targetEndDate ? new Date(site.targetEndDate).toISOString().split('T')[0] : '')
    setStatus(site.status)
  }, [site])

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault()
    startTransition(async () => {
      const fd = new FormData()
      fd.append('id', site.id)
      fd.append('name', name)
      fd.append('location', location)
      fd.append('address', address)
      fd.append('projectType', projectType)
      fd.append('clientName', clientName)
      fd.append('clientPhone', clientPhone)
      fd.append('areaSqft', areaSqft)
      fd.append('budget', budget)
      fd.append('startDate', startDate)
      fd.append('targetEndDate', targetEndDate)
      fd.append('status', status)
      await updateSiteDetails(fd)
      setOpen(false)
    })
  }

  const inputCls = "w-full border border-slate-300 rounded-lg px-3 py-2.5 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#fc6e20] focus:border-transparent bg-white transition-all"
  const labelCls = "block text-[11px] font-bold uppercase tracking-wide text-slate-500 mb-1"

  return (
    <>
      <button 
        onClick={() => setOpen(true)}
        className="px-3 py-1.5 text-xs font-semibold text-slate-700 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 cursor-pointer shadow-sm transition-colors"
      >
        Edit Site
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm sm:items-center sm:p-0">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden sm:my-8 relative">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 bg-slate-50/50 shrink-0">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 bg-orange-50 rounded-lg flex items-center justify-center">
                  <Building2 size={16} className="text-[#fc6e20]" />
                </div>
                <div>
                  <h3 className="font-extrabold text-slate-800 text-lg">Edit Site Details</h3>
                  <p className="text-xs text-slate-500">Modify information for this site</p>
                </div>
              </div>
              <button onClick={() => setOpen(false)} className="text-slate-400 hover:text-slate-600 transition-colors p-1.5 rounded-md hover:bg-slate-200">
                <X size={18} />
              </button>
            </div>
            
            <div className="overflow-y-auto p-6">
              <form id="edit-site-form" onSubmit={handleSave} className="space-y-6">
                
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                  <div className="sm:col-span-2">
                    <label className={labelCls}>Site Name *</label>
                    <input required value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Marina Towers" className={inputCls} />
                  </div>

                  <div>
                    <label className={labelCls}>Location *</label>
                    <input required value={location} onChange={e => setLocation(e.target.value)} placeholder="e.g. Chennai" className={inputCls} />
                  </div>
                  <div>
                    <label className={labelCls}>Status</label>
                    <select value={status} onChange={e => setStatus(e.target.value)} className={inputCls}>
                      <option value="ACTIVE">Active</option>
                      <option value="ON_HOLD">On Hold</option>
                      <option value="COMPLETED">Completed</option>
                    </select>
                  </div>

                  <div className="sm:col-span-2">
                    <label className={labelCls}>Full Address</label>
                    <input value={address} onChange={e => setAddress(e.target.value)} placeholder="Street address" className={inputCls} />
                  </div>

                  <div>
                    <label className={labelCls}>Client Name</label>
                    <input value={clientName} onChange={e => setClientName(e.target.value)} placeholder="Name of client" className={inputCls} />
                  </div>
                  <div>
                    <label className={labelCls}>Client Phone</label>
                    <input value={clientPhone} onChange={e => setClientPhone(e.target.value)} placeholder="Phone number" className={inputCls} />
                  </div>

                  <div>
                    <label className={labelCls}>Project Type</label>
                    <select value={projectType} onChange={e => setProjectType(e.target.value)} className={inputCls}>
                      <option value="">Select type</option>
                      <option>RESIDENTIAL</option><option>COMMERCIAL</option>
                      <option>INFRASTRUCTURE</option><option>INDUSTRIAL</option><option>RENOVATION</option>
                    </select>
                  </div>
                  <div>
                    <label className={labelCls}>Area (sqft)</label>
                    <input type="number" min="0" value={areaSqft} onChange={e => setAreaSqft(e.target.value)} placeholder="Total area" className={inputCls} />
                  </div>

                  <div>
                    <label className={labelCls}>Budget (₹)</label>
                    <input type="number" min="0" step="0.01" value={budget} onChange={e => setBudget(e.target.value)} placeholder="Total budget" className={inputCls} />
                  </div>
                  <div>
                    {/* Placeholder for alignment */}
                  </div>

                  <div>
                    <label className={labelCls}>Start Date</label>
                    <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} className={inputCls} />
                  </div>
                  <div>
                    <label className={labelCls}>Target End Date</label>
                    <input type="date" value={targetEndDate} onChange={e => setTargetEndDate(e.target.value)} className={inputCls} />
                  </div>
                </div>

              </form>
            </div>
            
            <div className="p-6 border-t border-slate-100 bg-slate-50 shrink-0 flex gap-3">
              <button
                type="submit"
                form="edit-site-form"
                disabled={isPending}
                className="flex-1 flex items-center justify-center gap-2 bg-[#fc6e20] hover:bg-[#e85b0d] text-white rounded-xl py-2.5 text-sm font-bold transition-all shadow-sm disabled:opacity-50"
              >
                {isPending ? <Loader2 size={16} className="animate-spin" /> : null}
                Save Changes
              </button>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="flex-1 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 rounded-xl py-2.5 text-sm font-bold transition-all shadow-sm"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
