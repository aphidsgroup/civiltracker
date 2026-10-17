'use client'

import React, { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  ArrowLeft, Wrench, Clock, Calendar, CheckCircle2,
  AlertCircle, Loader2, Search, PlusCircle, Building2, Tag
} from 'lucide-react'
import { createEquipmentRequestAction } from '@/actions/requests'

interface SiteOption {
  id: string
  name: string
}

interface CompanyAssetOption {
  id: string
  name: string
  category: string
  brand?: string | null
  status: string
  locationName?: string | null
}

const COMMON_TOOL_CATALOGUE = [
  { name: 'Concrete Needle Vibrator (Electric / Petrol)', category: 'Concrete & Masonry', unit: 'Nos' },
  { name: 'Concrete Mixer Machine (10/7 CFT)', category: 'Concrete & Masonry', unit: 'Nos' },
  { name: 'Plate Compactor / Earth Rammer', category: 'Concrete & Masonry', unit: 'Nos' },
  { name: 'Concrete Cube Testing Moulds (150mm)', category: 'Concrete & Masonry', unit: 'Sets' },
  { name: 'Slump Cone Testing Apparatus', category: 'Concrete & Masonry', unit: 'Sets' },
  { name: 'Bar Bending Machine', category: 'Steel & Fabrication', unit: 'Nos' },
  { name: 'Bar Cutting Machine', category: 'Steel & Fabrication', unit: 'Nos' },
  { name: 'Heavy Duty Welding Inverter Machine', category: 'Steel & Fabrication', unit: 'Nos' },
  { name: 'Angle Grinder 4-inch / 5-inch', category: 'Steel & Fabrication', unit: 'Nos' },
  { name: 'Total Station Survey Equipment', category: 'Survey & Testing', unit: 'Sets' },
  { name: 'Auto Level with Aluminum Tripod & Staff', category: 'Survey & Testing', unit: 'Sets' },
  { name: 'Cross Line Laser Level', category: 'Survey & Testing', unit: 'Nos' },
  { name: 'Submersible Dewatering Mud Pump (2 HP / 5 HP)', category: 'Dewatering & Power', unit: 'Nos' },
  { name: 'Diesel Generator DG Set (15 kVA / 25 kVA)', category: 'Dewatering & Power', unit: 'Nos' },
  { name: 'Demolition Breaker / Rotary Hammer Drill', category: 'Power Tools', unit: 'Nos' },
  { name: 'Adjustable Telescopic Props (Acrow Jacks 3m/4m)', category: 'Shuttering & Scaffolding', unit: 'Nos' },
  { name: 'Steel Shuttering Plates (900 x 600 mm)', category: 'Shuttering & Scaffolding', unit: 'Nos' },
  { name: 'Cuplock Scaffolding System (Pipes & Ledgers)', category: 'Shuttering & Scaffolding', unit: 'Sets' },
  { name: 'Full Body Safety Harness Belts', category: 'Safety Equipment', unit: 'Nos' },
  { name: 'Site Safety Helmets & High-Vis Vests', category: 'Safety Equipment', unit: 'Sets' },
]

const CATEGORIES = [
  'All',
  'Concrete & Masonry',
  'Steel & Fabrication',
  'Survey & Testing',
  'Dewatering & Power',
  'Power Tools',
  'Shuttering & Scaffolding',
  'Safety Equipment',
]

const QUICK_DURATIONS = ['1-3 Days', '1 Week', '2 Weeks', '1 Month', 'Until Project Completion']

export default function MobileRequestEquipmentClient({
  sites,
  companyAssets = [],
  defaultSiteId,
  defaultSiteName,
}: {
  sites: SiteOption[]
  companyAssets?: CompanyAssetOption[]
  defaultSiteId?: string
  defaultSiteName: string
}) {
  const router = useRouter()
  const initialSiteId = defaultSiteId || (sites[0]?.id ?? '')

  const [siteId, setSiteId] = useState(initialSiteId)
  const [selectedCategory, setSelectedCategory] = useState('All')
  const [searchQuery, setSearchQuery] = useState('')

  // Form State
  const [toolName, setToolName] = useState('')
  const [category, setCategory] = useState('General Equipment')
  const [brand, setBrand] = useState('')
  const [quantity, setQuantity] = useState('1')
  const [unit, setUnit] = useState('Nos')
  const [urgency, setUrgency] = useState<'Normal' | 'High' | 'Urgent'>('Normal')
  const [neededFrom, setNeededFrom] = useState(() => {
    const d = new Date()
    return d.toISOString().split('T')[0]
  })
  const [duration, setDuration] = useState('1 Week')
  const [purpose, setPurpose] = useState('')
  const [notes, setNotes] = useState('')

  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)

  // Filter catalogue and assets
  const filteredCatalogue = COMMON_TOOL_CATALOGUE.filter((item) => {
    const matchesCat = selectedCategory === 'All' || item.category === selectedCategory
    const matchesSearch = item.name.toLowerCase().includes(searchQuery.toLowerCase())
    return matchesCat && matchesSearch
  })

  const handleSelectPredefined = (item: { name: string; category: string; unit: string }) => {
    setToolName(item.name)
    setCategory(item.category)
    setUnit(item.unit)
  }

  const handleSelectAsset = (asset: CompanyAssetOption) => {
    setToolName(asset.name)
    setCategory(asset.category)
    if (asset.brand) setBrand(asset.brand)
    setUnit('Nos')
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')

    const selectedSiteId = siteId || sites[0]?.id
    if (!selectedSiteId) {
      setError('Please select a construction site.')
      return
    }

    if (!toolName.trim()) {
      setError('Please specify or select a tool/equipment name.')
      return
    }

    const numQty = Number(quantity)
    if (isNaN(numQty) || numQty <= 0) {
      setError('Please enter a valid positive quantity.')
      return
    }

    setLoading(true)
    try {
      const res = await createEquipmentRequestAction({
        siteId: selectedSiteId,
        toolName: toolName.trim(),
        category,
        brand: brand.trim() || undefined,
        quantity: numQty,
        unit: unit.trim() || 'Nos',
        urgency,
        neededFrom: neededFrom || undefined,
        neededUntil: duration || undefined,
        purpose: purpose.trim() || undefined,
        notes: notes.trim() || undefined,
      })

      if (res?.success) {
        setSuccess(true)
        setTimeout(() => {
          router.push(`/mobile/home?siteId=${selectedSiteId}`)
          router.refresh()
        }, 1200)
      }
    } catch (err: unknown) {
      setError((err as Error)?.message || 'Failed to submit tool requisition.')
      setLoading(false)
    }
  }

  if (success) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-6 text-center select-none">
        <div className="w-16 h-16 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center mb-4 animate-in zoom-in-75">
          <CheckCircle2 size={36} strokeWidth={2.5} />
        </div>
        <h2 className="text-xl font-black text-slate-900 mb-1">Equipment Requested!</h2>
        <p className="text-sm text-slate-500 max-w-xs mb-6">
          Your request for {quantity} {unit} of &ldquo;{toolName}&rdquo; has been submitted to Company Admin for approval.
        </p>
        <div className="flex items-center gap-2 text-xs font-bold text-[#fc6e20]">
          <Loader2 size={16} className="animate-spin" />
          <span>Redirecting to home...</span>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-slate-50 pb-24 select-none">
      {/* Top Header */}
      <header className="sticky top-0 z-30 bg-white/95 backdrop-blur-md border-b border-slate-100 px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link
            href="/mobile/home"
            className="w-9 h-9 rounded-full bg-slate-100 text-slate-600 flex items-center justify-center active:scale-95 no-underline transition-transform"
          >
            <ArrowLeft size={18} />
          </Link>
          <div>
            <h1 className="text-[17px] font-black text-slate-900 m-0 tracking-tight">Request Tools & Equipments</h1>
            <p className="text-[11px] font-semibold text-slate-400 m-0">Site plant & machinery requisition</p>
          </div>
        </div>
        <div className="w-9 h-9 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center">
          <Wrench size={20} />
        </div>
      </header>

      <form onSubmit={handleSubmit} className="p-4 space-y-4 max-w-[480px] mx-auto">
        {error && (
          <div className="p-3.5 bg-rose-50 border border-rose-200 rounded-2xl flex items-center gap-2.5 text-rose-700 text-xs font-bold animate-in fade-in">
            <AlertCircle size={18} className="flex-shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* Site Selector */}
        <div className="bg-white p-4 rounded-2xl border border-slate-100 shadow-xs space-y-2">
          <label className="text-[12px] font-extrabold uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
            <Building2 size={14} />
            <span>Project Site *</span>
          </label>
          {sites.length > 1 ? (
            <select
              value={siteId}
              onChange={(e) => setSiteId(e.target.value)}
              className="w-full h-11 px-3 rounded-xl border border-slate-200 text-sm font-bold text-slate-800 bg-slate-50/50 focus:bg-white focus:outline-none focus:border-[#fc6e20]"
            >
              {sites.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          ) : (
            <div className="text-sm font-extrabold text-slate-800 py-1">
              {sites[0]?.name || defaultSiteName || 'Active Site'}
            </div>
          )}
        </div>

        {/* Tool Selection Section */}
        <div className="bg-white p-4 rounded-2xl border border-slate-100 shadow-xs space-y-3">
          <div className="flex justify-between items-center">
            <label className="text-[12px] font-extrabold uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
              <Wrench size={14} />
              <span>Tool or Equipment Name *</span>
            </label>
            <span className="text-[10.5px] font-bold text-slate-400">Required</span>
          </div>

          <div className="relative">
            <input
              type="text"
              value={toolName}
              onChange={(e) => setToolName(e.target.value)}
              placeholder="e.g. Concrete Needle Vibrator, Bar Bending Machine"
              required
              className="w-full h-12 px-3.5 rounded-xl border border-slate-200 text-sm font-bold text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-[#fc6e20] focus:ring-2 focus:ring-[#fc6e20]/15"
            />
          </div>

          {/* Quick Catalogue Picker Drawer / Chips */}
          <div className="space-y-2 pt-1">
            <div className="flex items-center justify-between text-[11px] font-bold text-slate-500">
              <span>Quick select common equipment:</span>
              <span className="text-slate-400">{filteredCatalogue.length} available</span>
            </div>

            {/* Category tabs */}
            <div className="flex gap-1.5 overflow-x-auto pb-1 scrollbar-none">
              {CATEGORIES.map((cat) => (
                <button
                  type="button"
                  key={cat}
                  onClick={() => setSelectedCategory(cat)}
                  className={`px-2.5 py-1 rounded-lg text-[10.5px] font-bold whitespace-nowrap transition-all border ${
                    selectedCategory === cat
                      ? 'bg-slate-900 text-white border-slate-900'
                      : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'
                  }`}
                >
                  {cat}
                </button>
              ))}
            </div>

            {/* Quick chips list */}
            <div className="max-h-44 overflow-y-auto space-y-1.5 pr-1">
              {filteredCatalogue.slice(0, 8).map((item) => (
                <button
                  type="button"
                  key={item.name}
                  onClick={() => handleSelectPredefined(item)}
                  className={`w-full text-left p-2 rounded-xl text-xs font-semibold flex items-center justify-between transition-all border ${
                    toolName === item.name
                      ? 'bg-emerald-50 text-emerald-900 border-emerald-300 ring-1 ring-emerald-400'
                      : 'bg-slate-50/70 text-slate-700 border-slate-100 hover:bg-slate-100'
                  }`}
                >
                  <div className="min-w-0 pr-2">
                    <div className="truncate font-bold">{item.name}</div>
                    <div className="text-[10px] text-slate-400 truncate">{item.category}</div>
                  </div>
                  <span className="text-[10px] font-bold text-emerald-600 bg-emerald-100/60 px-2 py-0.5 rounded-md flex-shrink-0">
                    {item.unit}
                  </span>
                </button>
              ))}
            </div>

            {/* Company Assets if any */}
            {companyAssets.length > 0 && (
              <div className="pt-2 border-t border-slate-100 space-y-1.5">
                <div className="text-[11px] font-bold text-slate-500 flex items-center gap-1">
                  <span>From Company Yard / Inventory:</span>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {companyAssets.slice(0, 5).map((asset) => (
                    <button
                      type="button"
                      key={asset.id}
                      onClick={() => handleSelectAsset(asset)}
                      className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition-all border ${
                        toolName === asset.name
                          ? 'bg-emerald-600 text-white border-emerald-600'
                          : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                      }`}
                    >
                      {asset.name}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Quantity & Unit */}
        <div className="bg-white p-4 rounded-2xl border border-slate-100 shadow-xs space-y-3">
          <label className="text-[12px] font-extrabold uppercase tracking-wider text-slate-500">
            Quantity & Unit *
          </label>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <span className="text-[10.5px] font-bold text-slate-400 block mb-1">Required Quantity</span>
              <input
                type="number"
                min="1"
                step="1"
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
                required
                className="w-full h-12 px-3.5 rounded-xl border border-slate-200 text-lg font-black text-slate-900 focus:outline-none focus:border-[#fc6e20]"
              />
            </div>

            <div>
              <span className="text-[10.5px] font-bold text-slate-400 block mb-1">Unit of Measure</span>
              <select
                value={unit}
                onChange={(e) => setUnit(e.target.value)}
                className="w-full h-12 px-3 rounded-xl border border-slate-200 text-sm font-bold text-slate-800 bg-slate-50/50 focus:bg-white focus:outline-none focus:border-[#fc6e20]"
              >
                <option value="Nos">Nos (Numbers)</option>
                <option value="Sets">Sets</option>
                <option value="Units">Units</option>
                <option value="Pieces">Pieces</option>
                <option value="Meters">Meters</option>
                <option value="Pairs">Pairs</option>
              </select>
            </div>
          </div>
        </div>

        {/* Brand / Model / Specification (Optional) */}
        <div className="bg-white p-4 rounded-2xl border border-slate-100 shadow-xs space-y-2">
          <label className="text-[12px] font-extrabold uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
            <Tag size={14} />
            <span>Brand / Preferred Make / Capacity (Optional)</span>
          </label>
          <input
            type="text"
            value={brand}
            onChange={(e) => setBrand(e.target.value)}
            placeholder="e.g. Bosch, Kirloskar 5HP, Honda Engine, Tata"
            className="w-full h-11 px-3.5 rounded-xl border border-slate-200 text-sm font-semibold text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-[#fc6e20]"
          />
        </div>

        {/* Urgency */}
        <div className="bg-white p-4 rounded-2xl border border-slate-100 shadow-xs space-y-2">
          <label className="text-[12px] font-extrabold uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
            <Clock size={14} />
            <span>Urgency Level</span>
          </label>
          <div className="grid grid-cols-3 gap-2">
            {[
              { id: 'Normal', label: '🟢 Normal', bg: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
              { id: 'High', label: '🟡 High', bg: 'bg-amber-50 text-amber-700 border-amber-200' },
              { id: 'Urgent', label: '🔴 Urgent', bg: 'bg-rose-50 text-rose-700 border-rose-200' },
            ].map((p) => (
              <button
                type="button"
                key={p.id}
                onClick={() => setUrgency(p.id as 'Normal' | 'High' | 'Urgent')}
                className={`py-2.5 px-2 rounded-xl text-xs font-bold border transition-all text-center ${
                  urgency === p.id
                    ? `${p.bg} ring-2 ring-current font-black shadow-xs`
                    : 'bg-slate-50 text-slate-600 border-slate-200'
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>

        {/* Timeline & Expected Duration */}
        <div className="bg-white p-4 rounded-2xl border border-slate-100 shadow-xs space-y-3">
          <label className="text-[12px] font-extrabold uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
            <Calendar size={14} />
            <span>Deployment Schedule</span>
          </label>
          <div>
            <span className="text-[10.5px] font-bold text-slate-400 block mb-1">Required On Site From</span>
            <input
              type="date"
              value={neededFrom}
              onChange={(e) => setNeededFrom(e.target.value)}
              className="w-full h-11 px-3 rounded-xl border border-slate-200 text-sm font-bold text-slate-800 bg-slate-50/50 focus:bg-white focus:outline-none focus:border-[#fc6e20]"
            />
          </div>

          <div>
            <span className="text-[10.5px] font-bold text-slate-400 block mb-1">Expected Duration / Return</span>
            <div className="flex flex-wrap gap-1.5 mb-2">
              {QUICK_DURATIONS.map((d) => (
                <button
                  type="button"
                  key={d}
                  onClick={() => setDuration(d)}
                  className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition-all border ${
                    duration === d
                      ? 'bg-slate-900 text-white border-slate-900'
                      : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'
                  }`}
                >
                  {d}
                </button>
              ))}
            </div>
            <input
              type="text"
              value={duration}
              onChange={(e) => setDuration(e.target.value)}
              placeholder="e.g. 1 Week, 10 Days, Permanent"
              className="w-full h-11 px-3.5 rounded-xl border border-slate-200 text-sm font-semibold text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-[#fc6e20]"
            />
          </div>
        </div>

        {/* Purpose / Specific Work Area */}
        <div className="bg-white p-4 rounded-2xl border border-slate-100 shadow-xs space-y-2">
          <label className="text-[12px] font-extrabold uppercase tracking-wider text-slate-500">
            Work Purpose / Location
          </label>
          <input
            type="text"
            value={purpose}
            onChange={(e) => setPurpose(e.target.value)}
            placeholder="e.g. Ground floor slab casting, Stormwater pit dewatering"
            className="w-full h-11 px-3.5 rounded-xl border border-slate-200 text-sm font-semibold text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-[#fc6e20]"
          />
        </div>

        {/* Additional Notes */}
        <div className="bg-white p-4 rounded-2xl border border-slate-100 shadow-xs space-y-2">
          <label className="text-[12px] font-extrabold uppercase tracking-wider text-slate-500">
            Additional Specifications / Instructions
          </label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={2}
            placeholder="e.g. Please send with 60mm needle and 5m flexible shaft cable."
            className="w-full p-3 rounded-xl border border-slate-200 text-sm font-medium text-slate-800 placeholder:text-slate-400 focus:outline-none focus:border-[#fc6e20] focus:ring-2 focus:ring-[#fc6e20]/15 resize-none"
          />
        </div>

        {/* Submit Button */}
        <button
          type="submit"
          disabled={loading}
          className="w-full h-13 rounded-2xl bg-gradient-to-r from-emerald-600 via-teal-600 to-emerald-700 text-white font-extrabold text-[15px] shadow-lg shadow-emerald-600/30 active:scale-98 transition-all flex items-center justify-center gap-2 disabled:opacity-50 cursor-pointer border-none"
        >
          {loading ? (
            <>
              <Loader2 size={18} className="animate-spin" />
              <span>Submitting Request...</span>
            </>
          ) : (
            <>
              <Wrench size={18} />
              <span>Submit Tool Requisition</span>
            </>
          )}
        </button>
      </form>
    </div>
  )
}
