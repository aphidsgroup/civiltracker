'use client'

import { useState, useTransition, useEffect } from 'react'
import { updateSiteDetails } from '@/actions/site'
import { Loader2, X } from 'lucide-react'

type SiteData = {
  id: string
  name: string
  budget: number
  targetEndDate: Date | null
  status: string
}

export function EditSiteModal({ site }: { site: SiteData }) {
  const [open, setOpen] = useState(false)
  const [isPending, startTransition] = useTransition()
  
  const [name, setName] = useState(site.name)
  const [budget, setBudget] = useState(String(site.budget))
  const [targetEndDate, setTargetEndDate] = useState(site.targetEndDate ? new Date(site.targetEndDate).toISOString().split('T')[0] : '')
  const [status, setStatus] = useState(site.status)

  // Reset form if site prop changes
  useEffect(() => {
    setName(site.name)
    setBudget(String(site.budget))
    setTargetEndDate(site.targetEndDate ? new Date(site.targetEndDate).toISOString().split('T')[0] : '')
    setStatus(site.status)
  }, [site])

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault()
    startTransition(async () => {
      const fd = new FormData()
      fd.append('id', site.id)
      fd.append('name', name)
      fd.append('budget', budget)
      fd.append('targetEndDate', targetEndDate)
      fd.append('status', status)
      await updateSiteDetails(fd)
      setOpen(false)
    })
  }

  const inputCls = "w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#fc6e20]/40 focus:border-[#fc6e20] bg-white text-slate-800"
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
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 bg-slate-50/50">
              <h3 className="font-extrabold text-slate-800">Edit Site Details</h3>
              <button onClick={() => setOpen(false)} className="text-slate-400 hover:text-slate-600 transition-colors p-1 rounded-md hover:bg-slate-200">
                <X size={18} />
              </button>
            </div>
            
            <form onSubmit={handleSave} className="p-5 space-y-4">
              <div>
                <label className={labelCls}>Site Name *</label>
                <input required value={name} onChange={e => setName(e.target.value)} className={inputCls} />
              </div>
              
              <div>
                <label className={labelCls}>Budget (₹)</label>
                <input type="number" min="0" step="0.01" value={budget} onChange={e => setBudget(e.target.value)} className={inputCls} />
              </div>

              <div>
                <label className={labelCls}>Target End Date</label>
                <input type="date" value={targetEndDate} onChange={e => setTargetEndDate(e.target.value)} className={inputCls} />
              </div>

              <div>
                <label className={labelCls}>Status</label>
                <select value={status} onChange={e => setStatus(e.target.value)} className={inputCls}>
                  <option value="ACTIVE">Active</option>
                  <option value="ON_HOLD">On Hold</option>
                  <option value="COMPLETED">Completed</option>
                </select>
              </div>

              <div className="pt-4 flex gap-3">
                <button
                  type="submit"
                  disabled={isPending}
                  className="flex-1 flex items-center justify-center gap-2 bg-[#fc6e20] hover:bg-[#e85b0d] text-white rounded-xl py-2.5 text-sm font-bold transition-all shadow-sm disabled:opacity-50"
                >
                  {isPending ? <Loader2 size={16} className="animate-spin" /> : null}
                  Save Changes
                </button>
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="flex-1 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl py-2.5 text-sm font-bold transition-all"
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  )
}
