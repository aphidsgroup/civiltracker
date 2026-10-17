'use client'

import React, { useState, useTransition } from 'react'
import Link from 'next/link'
import {
  Wrench, Plus, ArrowLeft, Search, MapPin, Building2, User,
  CheckCircle2, AlertTriangle, ArrowRightLeft, X, Check,
  Sparkles, RefreshCw, Filter, Layers, Clock, ShieldAlert, Edit, Trash2
} from 'lucide-react'
import {
  EQUIPMENT_CATEGORIES,
  ASSET_STATUS_CONFIG,
  ASSET_UNITS,
  type AssetStatusKey,
} from '@/lib/equipment-catalogue'
import {
  createCompanyAssetAction,
  updateCompanyAssetAction,
  transferAssetAction,
  updateAssetStatusAction,
  deleteCompanyAssetAction,
} from '@/actions/inventory'
import type { SerializedAsset, SiteOption } from '@/components/inventory/InventoryClient'

interface MobileInventoryClientProps {
  initialAssets: SerializedAsset[]
  sites: SiteOption[]
  activeSite: { id: string; name: string } | null
  companyName: string
  companyLogo?: string | null
}

export default function MobileInventoryClient({
  initialAssets,
  sites,
  activeSite,
  companyName,
  companyLogo,
}: MobileInventoryClientProps) {
  const [assets, setAssets] = useState<SerializedAsset[]>(initialAssets)
  const [activeTab, setActiveTab] = useState<'site' | 'yard' | 'all'>('site')
  const [search, setSearch] = useState('')
  const [selectedCategory, setSelectedCategory] = useState<string>('ALL')

  // Modals
  const [showAddModal, setShowAddModal] = useState(false)
  const [transferTarget, setTransferTarget] = useState<SerializedAsset | null>(null)
  const [statusTarget, setStatusTarget] = useState<SerializedAsset | null>(null)
  const [editTarget, setEditTarget] = useState<SerializedAsset | null>(null)

  const [toastMsg, setToastMsg] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  const showToast = (msg: string) => {
    setToastMsg(msg)
    setTimeout(() => setToastMsg(null), 3500)
  }

  // Filter based on active tab
  const tabAssets = assets.filter((asset) => {
    if (activeTab === 'site') {
      if (!activeSite) return true
      return asset.siteId === activeSite.id
    }
    if (activeTab === 'yard') {
      return asset.siteId === null || asset.status === 'STANDBY'
    }
    return true
  })

  // Filter by search and category
  const filteredAssets = tabAssets.filter((asset) => {
    if (search.trim()) {
      const q = search.toLowerCase()
      const matchName = asset.name.toLowerCase().includes(q)
      const matchCode = asset.assetCode?.toLowerCase().includes(q) ?? false
      const matchBrand = asset.brand?.toLowerCase().includes(q) ?? false
      const matchCategory = asset.category.toLowerCase().includes(q)
      const matchAssigned = asset.assignedTo?.toLowerCase().includes(q) ?? false
      if (!matchName && !matchCode && !matchBrand && !matchCategory && !matchAssigned) {
        return false
      }
    }
    if (selectedCategory !== 'ALL' && asset.category !== selectedCategory) {
      return false
    }
    return true
  })

  // Counts
  const siteToolsCount = activeSite
    ? assets.filter((a) => a.siteId === activeSite.id).reduce((s, a) => s + (a.quantity || 1), 0)
    : 0
  const yardToolsCount = assets
    .filter((a) => a.siteId === null || a.status === 'STANDBY')
    .reduce((s, a) => s + (a.quantity || 1), 0)
  const totalFleetCount = assets.reduce((s, a) => s + (a.quantity || 1), 0)

  return (
    <div className="min-h-screen bg-[#f8fafc] pb-24 select-none">
      {/* Toast */}
      {toastMsg && (
        <div className="fixed top-4 left-4 right-4 z-50 bg-slate-900 text-white p-3 rounded-2xl shadow-xl flex items-center gap-2.5 text-xs font-bold animate-in fade-in duration-200 border border-slate-700">
          <CheckCircle2 size={16} className="text-emerald-400 shrink-0" />
          <span className="flex-1">{toastMsg}</span>
        </div>
      )}

      {/* Top Header */}
      <div className="sticky top-0 z-30 bg-[#f8fafc]/95 backdrop-blur-md border-b border-slate-200/80 px-4 py-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link
              href="/mobile/home"
              className="w-9 h-9 rounded-full bg-white border border-slate-200 flex items-center justify-center text-slate-700 active:scale-90 transition-transform no-underline"
            >
              <ArrowLeft size={18} />
            </Link>
            <div>
              <h1 className="text-base font-black text-slate-900 m-0 tracking-tight flex items-center gap-1.5">
                <Wrench size={17} className="text-[#fc6e20]" />
                <span>Company Tools & Equipment</span>
              </h1>
              <p className="text-[11px] font-semibold text-slate-500 m-0">
                {companyName} {activeSite ? `· ${activeSite.name}` : ''}
              </p>
            </div>
          </div>

          <button
            onClick={() => setShowAddModal(true)}
            className="w-9 h-9 rounded-full bg-[#fc6e20] text-white flex items-center justify-center shadow-md shadow-[#fc6e20]/30 active:scale-90 transition-transform border-none cursor-pointer"
            title="Add Tool"
          >
            <Plus size={20} strokeWidth={2.6} />
          </button>
        </div>

        {/* 3 Tabs */}
        <div className="grid grid-cols-3 gap-1 bg-slate-200/70 p-1 rounded-xl mt-3 text-xs font-bold">
          <button
            onClick={() => setActiveTab('site')}
            className={`py-1.5 rounded-lg border-none cursor-pointer transition-all ${
              activeTab === 'site'
                ? 'bg-white text-slate-900 shadow-xs'
                : 'bg-transparent text-slate-600'
            }`}
          >
            On Site ({siteToolsCount})
          </button>
          <button
            onClick={() => setActiveTab('yard')}
            className={`py-1.5 rounded-lg border-none cursor-pointer transition-all ${
              activeTab === 'yard'
                ? 'bg-white text-slate-900 shadow-xs'
                : 'bg-transparent text-slate-600'
            }`}
          >
            In Yard ({yardToolsCount})
          </button>
          <button
            onClick={() => setActiveTab('all')}
            className={`py-1.5 rounded-lg border-none cursor-pointer transition-all ${
              activeTab === 'all'
                ? 'bg-white text-slate-900 shadow-xs'
                : 'bg-transparent text-slate-600'
            }`}
          >
            All Tools ({totalFleetCount})
          </button>
        </div>
      </div>

      <div className="p-4 space-y-3.5">
        {/* Search & Filter */}
        <div className="relative">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search tools, equipment, brands, code..."
            className="w-full pl-10 pr-8 py-2.5 bg-white border border-slate-200 rounded-xl text-xs font-semibold text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#fc6e20]/30"
          />
          {search && (
            <button
              onClick={() => setSearch('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400"
            >
              <X size={14} />
            </button>
          )}
        </div>

        {/* Category Horizontal Filter */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none -mx-4 px-4">
          <button
            onClick={() => setSelectedCategory('ALL')}
            className={`px-3 py-1 rounded-full text-[11px] font-bold whitespace-nowrap transition-all border ${
              selectedCategory === 'ALL'
                ? 'bg-[#fc6e20] text-white border-[#fc6e20]'
                : 'bg-white text-slate-600 border-slate-200'
            }`}
          >
            All
          </button>
          {EQUIPMENT_CATEGORIES.map((cat) => (
            <button
              key={cat.id}
              onClick={() => setSelectedCategory(cat.name)}
              className={`px-3 py-1 rounded-full text-[11px] font-bold whitespace-nowrap transition-all border flex items-center gap-1 ${
                selectedCategory === cat.name
                  ? 'bg-[#fc6e20] text-white border-[#fc6e20]'
                  : 'bg-white text-slate-600 border-slate-200'
              }`}
            >
              <span>{cat.icon}</span>
              <span>{cat.name.split(' ')[0]}</span>
            </button>
          ))}
        </div>

        {/* Assets List */}
        {filteredAssets.length === 0 ? (
          <div className="bg-white rounded-2xl border border-slate-200 p-8 text-center mt-4">
            <div className="w-12 h-12 rounded-xl bg-orange-50 text-[#fc6e20] flex items-center justify-center mx-auto mb-3">
              <Wrench size={24} />
            </div>
            <div className="text-sm font-bold text-slate-800 mb-1">
              {activeTab === 'site'
                ? `No tools currently assigned to ${activeSite?.name || 'this site'}`
                : 'No equipment found'}
            </div>
            <p className="text-[11.5px] text-slate-500 mb-4 max-w-xs mx-auto">
              {activeTab === 'site'
                ? 'You can transfer tools from the central yard or register newly purchased site tools.'
                : 'Try adjusting your search query or add a new equipment item.'}
            </p>
            <div className="flex items-center justify-center gap-2">
              {activeTab === 'site' && (
                <button
                  onClick={() => setActiveTab('yard')}
                  className="px-3 py-1.5 bg-slate-100 text-slate-700 rounded-xl text-xs font-bold border-none cursor-pointer"
                >
                  Browse Yard
                </button>
              )}
              <button
                onClick={() => setShowAddModal(true)}
                className="px-3.5 py-1.5 bg-[#fc6e20] text-white rounded-xl text-xs font-bold border-none cursor-pointer flex items-center gap-1.5"
              >
                <Plus size={14} />
                <span>Add Tool</span>
              </button>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            {filteredAssets.map((asset) => {
              const statusCfg = ASSET_STATUS_CONFIG[asset.status] || ASSET_STATUS_CONFIG.OPERATIONAL
              const isOnThisSite = activeSite && asset.siteId === activeSite.id

              return (
                <div
                  key={asset.id}
                  className="bg-white rounded-2xl border border-slate-200/90 p-4 shadow-xs flex flex-col justify-between"
                >
                  <div>
                    {/* Header line */}
                    <div className="flex items-center justify-between gap-2 mb-1.5">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        {asset.assetCode && (
                          <span className="font-mono text-[10px] font-bold bg-slate-100 text-slate-700 px-1.5 py-0.5 rounded border border-slate-200">
                            {asset.assetCode}
                          </span>
                        )}
                        <span className="text-[11px] font-semibold text-slate-500">
                          {asset.category}
                        </span>
                      </div>

                      <button
                        onClick={() => setStatusTarget(asset)}
                        className={`px-2 py-0.5 rounded-full text-[10.5px] font-bold border flex items-center gap-1.5 cursor-pointer ${statusCfg.badgeClass}`}
                      >
                        <span className={`w-1.5 h-1.5 rounded-full ${statusCfg.dotClass}`} />
                        <span>{statusCfg.label}</span>
                      </button>
                    </div>

                    {/* Tool Name */}
                    <h3 className="text-[14px] font-extrabold text-slate-900 m-0 leading-tight">
                      {asset.name}
                    </h3>

                    {/* Brand / Model */}
                    {(asset.brand || asset.modelNumber) && (
                      <p className="text-[11.5px] font-medium text-slate-500 m-0 mt-0.5">
                        {asset.brand} {asset.modelNumber ? `· ${asset.modelNumber}` : ''}
                      </p>
                    )}

                    {/* Quantity & Location */}
                    <div className="mt-3 pt-2.5 border-t border-slate-100 flex items-center justify-between text-xs">
                      <div className="font-bold text-slate-900">
                        Qty: {asset.quantity} {asset.unit}
                      </div>

                      <div className="flex items-center gap-1 font-semibold text-slate-700 text-[11px]">
                        <MapPin size={12} className="text-[#fc6e20]" />
                        <span className="truncate max-w-[170px]">
                          {asset.site ? asset.site.name : asset.locationName || 'Central Yard'}
                        </span>
                      </div>
                    </div>

                    {/* Operator */}
                    {asset.assignedTo && (
                      <div className="mt-1 text-[11px] font-medium text-slate-500 flex items-center gap-1">
                        <User size={11} className="text-slate-400" />
                        <span>In-Charge: <strong className="text-slate-700">{asset.assignedTo}</strong></span>
                      </div>
                    )}

                    {/* Condition notes */}
                    {asset.conditionNotes && (
                      <div className="mt-2 bg-slate-50 p-2 rounded-lg text-[10.5px] text-slate-600">
                        <span className="font-bold text-slate-700">Condition: </span>
                        {asset.conditionNotes}
                      </div>
                    )}
                  </div>

                  {/* Actions Bar */}
                  <div className="mt-3 pt-2.5 border-t border-slate-100 flex items-center justify-between gap-2">
                    <button
                      onClick={() => setTransferTarget(asset)}
                      className="flex-1 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold flex items-center justify-center gap-1 border-none cursor-pointer"
                    >
                      <ArrowRightLeft size={13} />
                      <span>{isOnThisSite ? 'Transfer / Return' : 'Deploy to Site'}</span>
                    </button>

                    <button
                      onClick={() => setStatusTarget(asset)}
                      className="px-3 py-1.5 bg-slate-100 text-slate-700 rounded-xl text-xs font-bold border-none cursor-pointer"
                    >
                      Status
                    </button>

                    <button
                      onClick={() => setEditTarget(asset)}
                      className="p-1.5 text-slate-400 hover:text-slate-700 rounded-xl border-none cursor-pointer bg-slate-50"
                    >
                      <Edit size={14} />
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Floating Add Button for Mobile */}
      <button
        onClick={() => setShowAddModal(true)}
        className="fixed bottom-6 right-5 z-40 bg-[#fc6e20] text-white px-4 py-3 rounded-full shadow-lg shadow-[#fc6e20]/40 flex items-center gap-2 border-none cursor-pointer font-bold text-xs active:scale-95 transition-transform"
      >
        <Plus size={18} strokeWidth={2.8} />
        <span>Add Tool</span>
      </button>

      {/* ========================================================= */}
      {/* MOBILE ADD MODAL */}
      {/* ========================================================= */}
      {showAddModal && (
        <MobileAddAssetSheet
          sites={sites}
          defaultSiteId={activeSite?.id || 'YARD'}
          onClose={() => setShowAddModal(false)}
          onSuccess={(newAsset) => {
            const assetObj = newAsset as unknown as SerializedAsset
            setAssets((prev) => [assetObj, ...prev])
            setShowAddModal(false)
            showToast(`Added ${assetObj.name} to company inventory!`)
          }}
        />
      )}

      {/* ========================================================= */}
      {/* MOBILE TRANSFER MODAL */}
      {/* ========================================================= */}
      {transferTarget && (
        <MobileTransferSheet
          asset={transferTarget}
          sites={sites}
          activeSiteId={activeSite?.id}
          onClose={() => setTransferTarget(null)}
          onSuccess={(updated) => {
            setAssets((prev) =>
              prev.map((a) => (a.id === updated.id ? { ...a, ...updated } : a))
            )
            setTransferTarget(null)
            showToast(`Transferred ${transferTarget.name}`)
          }}
        />
      )}

      {/* ========================================================= */}
      {/* MOBILE STATUS MODAL */}
      {/* ========================================================= */}
      {statusTarget && (
        <MobileStatusSheet
          asset={statusTarget}
          onClose={() => setStatusTarget(null)}
          onSuccess={(status, notes) => {
            setAssets((prev) =>
              prev.map((a) =>
                a.id === statusTarget.id
                  ? { ...a, status, conditionNotes: notes ?? a.conditionNotes }
                  : a
              )
            )
            setStatusTarget(null)
            showToast(`Updated status of ${statusTarget.name}`)
          }}
        />
      )}

      {/* ========================================================= */}
      {/* MOBILE EDIT MODAL */}
      {/* ========================================================= */}
      {editTarget && (
        <MobileEditSheet
          asset={editTarget}
          sites={sites}
          onClose={() => setEditTarget(null)}
          onSuccess={(updated) => {
            setAssets((prev) =>
              prev.map((a) => (a.id === updated.id ? { ...a, ...updated } : a))
            )
            setEditTarget(null)
            showToast(`Updated ${editTarget.name}`)
          }}
        />
      )}
    </div>
  )
}

// =====================================================================
// MOBILE ADD ASSET BOTTOM SHEET
// =====================================================================
function MobileAddAssetSheet({
  sites,
  defaultSiteId,
  onClose,
  onSuccess,
}: {
  sites: SiteOption[]
  defaultSiteId: string
  onClose: () => void
  onSuccess: (asset: unknown) => void
}) {
  const [selectedCategoryObj, setSelectedCategoryObj] = useState(EQUIPMENT_CATEGORIES[0])
  const [name, setName] = useState('')
  const [category, setCategory] = useState(EQUIPMENT_CATEGORIES[0].name)
  const [assetCode, setAssetCode] = useState('')
  const [brand, setBrand] = useState('')
  const [modelNumber, setModelNumber] = useState('')
  const [quantity, setQuantity] = useState(1)
  const [unit, setUnit] = useState('Nos')
  const [siteId, setSiteId] = useState<string>(defaultSiteId)
  const [locationName, setLocationName] = useState('')
  const [status, setStatus] = useState<AssetStatusKey>('OPERATIONAL')
  const [assignedTo, setAssignedTo] = useState('')
  const [conditionNotes, setConditionNotes] = useState('Working condition')
  const [purchaseCost, setPurchaseCost] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const applyPreset = (item: {
    name: string
    defaultBrand?: string
    defaultUnit?: string
    suggestedCodePrefix?: string
  }) => {
    setName(item.name)
    if (item.defaultBrand) setBrand(item.defaultBrand)
    if (item.defaultUnit) setUnit(item.defaultUnit)
    if (item.suggestedCodePrefix && !assetCode) {
      const rnd = Math.floor(100 + Math.random() * 900)
      setAssetCode(`${item.suggestedCodePrefix}-${rnd}`)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim()) {
      setError('Please enter tool or equipment name')
      return
    }

    setLoading(true)
    setError(null)

    try {
      const res = await createCompanyAssetAction({
        name: name.trim(),
        category: category.trim(),
        assetCode: assetCode.trim() || undefined,
        brand: brand.trim() || undefined,
        modelNumber: modelNumber.trim() || undefined,
        quantity: Math.max(1, Number(quantity) || 1),
        unit: unit.trim() || 'Nos',
        siteId: siteId === 'YARD' ? null : siteId,
        locationName: locationName.trim() || undefined,
        status,
        conditionNotes: conditionNotes.trim() || undefined,
        purchaseCost: purchaseCost ? parseFloat(purchaseCost) : undefined,
        assignedTo: assignedTo.trim() || undefined,
      })

      if (res.success && res.asset) {
        onSuccess(res.asset)
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to save tool')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-xs flex flex-col justify-end">
      <div className="bg-white rounded-t-[28px] p-5 shadow-2xl max-h-[85vh] flex flex-col animate-in slide-in-from-bottom duration-200">
        {/* Handle bar */}
        <div className="w-10 h-1 bg-slate-200 rounded-full mx-auto mb-3" />

        <div className="flex items-center justify-between pb-3 border-b border-slate-100">
          <div>
            <h2 className="text-base font-extrabold text-slate-900 m-0">
              Add Tool / Equipment
            </h2>
            <p className="text-[11px] text-slate-500 m-0">
              Save equipment owned by your company
            </p>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center text-slate-500 border-none cursor-pointer"
          >
            <X size={16} />
          </button>
        </div>

        {error && (
          <div className="mt-2 p-2.5 rounded-xl bg-rose-50 text-rose-700 text-xs font-bold">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="overflow-y-auto space-y-3.5 pt-3 pr-1 flex-1">
          {/* Quick presets */}
          <div className="bg-slate-50 p-3 rounded-xl border border-slate-200/70">
            <div className="text-[10.5px] font-bold text-slate-700 uppercase tracking-wider mb-1.5 flex items-center gap-1">
              <Sparkles size={12} className="text-[#fc6e20]" />
              <span>Tap a Quick Preset</span>
            </div>
            <div className="flex items-center gap-1 overflow-x-auto pb-1 scrollbar-none">
              {EQUIPMENT_CATEGORIES.slice(0, 5).map((cat) => (
                <button
                  type="button"
                  key={cat.id}
                  onClick={() => {
                    setSelectedCategoryObj(cat)
                    setCategory(cat.name)
                  }}
                  className={`px-2 py-0.5 rounded-lg text-[10.5px] font-bold whitespace-nowrap border ${
                    selectedCategoryObj.id === cat.id
                      ? 'bg-slate-900 text-white'
                      : 'bg-white text-slate-600 border-slate-200'
                  }`}
                >
                  {cat.icon} {cat.name.split(' ')[0]}
                </button>
              ))}
            </div>

            <div className="flex flex-wrap gap-1 mt-2">
              {selectedCategoryObj.popularItems.map((item) => (
                <button
                  type="button"
                  key={item.name}
                  onClick={() => applyPreset(item)}
                  className="px-2 py-0.5 bg-white border border-slate-200 rounded text-[11px] font-medium text-slate-700 hover:text-[#fc6e20]"
                >
                  + {item.name}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-[11px] font-bold text-slate-700 mb-1">
              Equipment Name *
            </label>
            <input
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Concrete Mixer 10/7, Hammer Drill"
              className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-900 focus:outline-none"
            />
          </div>

          <div className="grid grid-cols-2 gap-2.5">
            <div>
              <label className="block text-[11px] font-bold text-slate-700 mb-1">
                Category
              </label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="w-full px-2.5 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-900 focus:outline-none"
              >
                {EQUIPMENT_CATEGORIES.map((c) => (
                  <option key={c.id} value={c.name}>
                    {c.icon} {c.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-[11px] font-bold text-slate-700 mb-1">
                Brand
              </label>
              <input
                type="text"
                value={brand}
                onChange={(e) => setBrand(e.target.value)}
                placeholder="e.g. Bosch, JCB"
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-900 focus:outline-none"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2.5">
            <div>
              <label className="block text-[11px] font-bold text-slate-700 mb-1">
                Quantity Owned
              </label>
              <input
                type="number"
                min="1"
                value={quantity}
                onChange={(e) => setQuantity(Math.max(1, parseInt(e.target.value) || 1))}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-900 focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-[11px] font-bold text-slate-700 mb-1">
                Unit
              </label>
              <select
                value={unit}
                onChange={(e) => setUnit(e.target.value)}
                className="w-full px-2.5 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-900 focus:outline-none"
              >
                {ASSET_UNITS.map((u) => (
                  <option key={u} value={u}>
                    {u}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="block text-[11px] font-bold text-slate-700 mb-1">
              Location / Site Assignment
            </label>
            <select
              value={siteId}
              onChange={(e) => setSiteId(e.target.value)}
              className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-900 focus:outline-none"
            >
              <option value="YARD">🏢 Central Yard / Warehouse / Head Office</option>
              {sites.map((s) => (
                <option key={s.id} value={s.id}>
                  🏗️ Active Site: {s.name}
                </option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-2.5">
            <div>
              <label className="block text-[11px] font-bold text-slate-700 mb-1">
                In-Charge Person
              </label>
              <input
                type="text"
                value={assignedTo}
                onChange={(e) => setAssignedTo(e.target.value)}
                placeholder="e.g. Ramesh"
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-900 focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-[11px] font-bold text-slate-700 mb-1">
                Purchase Cost (₹)
              </label>
              <input
                type="number"
                value={purchaseCost}
                onChange={(e) => setPurchaseCost(e.target.value)}
                placeholder="e.g. 25000"
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-900 focus:outline-none"
              />
            </div>
          </div>

          <div className="pt-2 flex items-center justify-end gap-2 sticky bottom-0 bg-white">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2.5 rounded-xl border border-slate-200 text-xs font-bold text-slate-600"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="px-5 py-2.5 rounded-xl bg-[#fc6e20] text-white text-xs font-bold border-none shadow-sm flex items-center gap-1.5"
            >
              {loading ? <RefreshCw size={14} className="animate-spin" /> : <Check size={14} />}
              <span>Save Equipment</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// =====================================================================
// MOBILE TRANSFER SHEET
// =====================================================================
function MobileTransferSheet({
  asset,
  sites,
  activeSiteId,
  onClose,
  onSuccess,
}: {
  asset: SerializedAsset
  sites: SiteOption[]
  activeSiteId?: string
  onClose: () => void
  onSuccess: (updated: Partial<SerializedAsset>) => void
}) {
  const [toSiteId, setToSiteId] = useState<string>(
    asset.siteId ? 'YARD' : (activeSiteId || sites[0]?.id || 'YARD')
  )
  const [assignedTo, setAssignedTo] = useState(asset.assignedTo || '')
  const [notes, setNotes] = useState('')
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    try {
      await transferAssetAction({
        assetId: asset.id,
        toSiteId: toSiteId === 'YARD' ? null : toSiteId,
        assignedTo: assignedTo || undefined,
        notes: notes || undefined,
      })

      const targetSite = sites.find((s) => s.id === toSiteId)
      onSuccess({
        siteId: toSiteId === 'YARD' ? null : toSiteId,
        site: targetSite ? { id: targetSite.id, name: targetSite.name } : null,
        locationName: toSiteId === 'YARD' ? 'Central Yard / Store' : targetSite?.name || 'Site',
        assignedTo: assignedTo || null,
        status: toSiteId === 'YARD' ? 'STANDBY' : 'IN_USE',
      })
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-xs flex flex-col justify-end">
      <div className="bg-white rounded-t-[28px] p-5 shadow-2xl animate-in slide-in-from-bottom duration-200">
        <div className="w-10 h-1 bg-slate-200 rounded-full mx-auto mb-3" />
        <div className="flex items-center justify-between pb-2 border-b border-slate-100">
          <div className="flex items-center gap-2">
            <ArrowRightLeft className="text-[#fc6e20]" size={16} />
            <h3 className="text-sm font-extrabold text-slate-900 m-0">Transfer Equipment</h3>
          </div>
          <button onClick={onClose} className="p-1 rounded-full text-slate-400 border-none bg-transparent">
            <X size={16} />
          </button>
        </div>

        <div className="mt-3 p-2.5 bg-slate-50 rounded-xl text-xs">
          <div className="font-extrabold text-slate-900">{asset.name}</div>
          <div className="text-slate-500 mt-0.5">
            Currently at: <strong className="text-[#fc6e20]">{asset.site ? asset.site.name : 'Central Yard'}</strong>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="mt-3 space-y-3">
          <div>
            <label className="block text-[11px] font-bold text-slate-700 mb-1">
              Select Destination *
            </label>
            <select
              value={toSiteId}
              onChange={(e) => setToSiteId(e.target.value)}
              className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-900 focus:outline-none"
            >
              <option value="YARD">🏢 Return to Central Yard / Warehouse</option>
              {sites.map((s) => (
                <option key={s.id} value={s.id}>
                  🏗️ Deploy at: {s.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-[11px] font-bold text-slate-700 mb-1">
              In-Charge / Operator
            </label>
            <input
              type="text"
              value={assignedTo}
              onChange={(e) => setAssignedTo(e.target.value)}
              placeholder="e.g. Ramesh"
              className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-900 focus:outline-none"
            />
          </div>

          <div className="pt-2 flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl border border-slate-200 text-xs font-bold text-slate-600"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="px-4 py-2 rounded-xl bg-[#fc6e20] text-white text-xs font-bold border-none"
            >
              {loading ? 'Transferring...' : 'Confirm Transfer'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// =====================================================================
// MOBILE STATUS SHEET
// =====================================================================
function MobileStatusSheet({
  asset,
  onClose,
  onSuccess,
}: {
  asset: SerializedAsset
  onClose: () => void
  onSuccess: (status: AssetStatusKey, notes?: string) => void
}) {
  const [status, setStatus] = useState<AssetStatusKey>(asset.status)
  const [conditionNotes, setConditionNotes] = useState(asset.conditionNotes || '')
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    try {
      await updateAssetStatusAction(asset.id, status, conditionNotes)
      onSuccess(status, conditionNotes)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-xs flex flex-col justify-end">
      <div className="bg-white rounded-t-[28px] p-5 shadow-2xl animate-in slide-in-from-bottom duration-200">
        <div className="w-10 h-1 bg-slate-200 rounded-full mx-auto mb-3" />
        <div className="flex items-center justify-between pb-2 border-b border-slate-100">
          <h3 className="text-sm font-extrabold text-slate-900 m-0">Status: {asset.name}</h3>
          <button onClick={onClose} className="p-1 rounded-full text-slate-400 border-none bg-transparent">
            <X size={16} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="mt-3 space-y-3">
          <div className="space-y-1.5">
            {(Object.keys(ASSET_STATUS_CONFIG) as AssetStatusKey[]).map((key) => {
              const cfg = ASSET_STATUS_CONFIG[key]
              const isSelected = status === key
              return (
                <button
                  type="button"
                  key={key}
                  onClick={() => setStatus(key)}
                  className={`w-full p-2.5 rounded-xl border text-left flex items-center justify-between transition-all ${
                    isSelected
                      ? 'border-[#fc6e20] bg-orange-50/50'
                      : 'border-slate-200 bg-white'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <span className={`w-2 h-2 rounded-full ${cfg.dotClass}`} />
                    <span className="text-xs font-bold text-slate-900">{cfg.label}</span>
                  </div>
                  {isSelected && <Check size={16} className="text-[#fc6e20]" />}
                </button>
              )
            })}
          </div>

          <div>
            <label className="block text-[11px] font-bold text-slate-700 mb-1">
              Condition Notes
            </label>
            <input
              type="text"
              value={conditionNotes}
              onChange={(e) => setConditionNotes(e.target.value)}
              placeholder="e.g. Tested and working"
              className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-900 focus:outline-none"
            />
          </div>

          <div className="pt-2 flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl border border-slate-200 text-xs font-bold text-slate-600"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="px-4 py-2 rounded-xl bg-[#fc6e20] text-white text-xs font-bold border-none"
            >
              {loading ? 'Saving...' : 'Update Status'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// =====================================================================
// MOBILE EDIT SHEET
// =====================================================================
function MobileEditSheet({
  asset,
  sites,
  onClose,
  onSuccess,
}: {
  asset: SerializedAsset
  sites: SiteOption[]
  onClose: () => void
  onSuccess: (updated: Partial<SerializedAsset>) => void
}) {
  const [name, setName] = useState(asset.name)
  const [brand, setBrand] = useState(asset.brand || '')
  const [quantity, setQuantity] = useState(asset.quantity)
  const [unit, setUnit] = useState(asset.unit)
  const [assignedTo, setAssignedTo] = useState(asset.assignedTo || '')
  const [conditionNotes, setConditionNotes] = useState(asset.conditionNotes || '')
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    try {
      const res = await updateCompanyAssetAction(asset.id, {
        name,
        brand: brand || undefined,
        quantity,
        unit,
        assignedTo: assignedTo || null,
        conditionNotes: conditionNotes || null,
      })
      if (res.success && res.asset) {
        onSuccess(res.asset as unknown as Partial<SerializedAsset>)
      }
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-xs flex flex-col justify-end">
      <div className="bg-white rounded-t-[28px] p-5 shadow-2xl animate-in slide-in-from-bottom duration-200">
        <div className="w-10 h-1 bg-slate-200 rounded-full mx-auto mb-3" />
        <div className="flex items-center justify-between pb-2 border-b border-slate-100">
          <h3 className="text-sm font-extrabold text-slate-900 m-0">Edit: {asset.name}</h3>
          <button onClick={onClose} className="p-1 rounded-full text-slate-400 border-none bg-transparent">
            <X size={16} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="mt-3 space-y-3">
          <div>
            <label className="block text-[11px] font-bold text-slate-700 mb-1">
              Equipment Name
            </label>
            <input
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-900"
            />
          </div>

          <div className="grid grid-cols-2 gap-2.5">
            <div>
              <label className="block text-[11px] font-bold text-slate-700 mb-1">
                Brand
              </label>
              <input
                type="text"
                value={brand}
                onChange={(e) => setBrand(e.target.value)}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold"
              />
            </div>
            <div>
              <label className="block text-[11px] font-bold text-slate-700 mb-1">
                Quantity
              </label>
              <input
                type="number"
                min="1"
                value={quantity}
                onChange={(e) => setQuantity(Math.max(1, parseInt(e.target.value) || 1))}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold"
              />
            </div>
          </div>

          <div>
            <label className="block text-[11px] font-bold text-slate-700 mb-1">
              In-Charge
            </label>
            <input
              type="text"
              value={assignedTo}
              onChange={(e) => setAssignedTo(e.target.value)}
              className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold"
            />
          </div>

          <div className="pt-2 flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl border border-slate-200 text-xs font-bold text-slate-600"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="px-4 py-2 rounded-xl bg-[#fc6e20] text-white text-xs font-bold border-none"
            >
              {loading ? 'Saving...' : 'Save Changes'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
