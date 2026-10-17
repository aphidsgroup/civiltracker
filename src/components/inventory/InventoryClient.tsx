'use client'

import React, { useState, useTransition } from 'react'
import {
  Wrench, Plus, Search, Filter, ArrowRightLeft, CheckCircle2,
  AlertTriangle, Clock, MapPin, Building2, User, DollarSign,
  Calendar, Hash, Tag, X, Edit, Trash2, ChevronDown, Check,
  Layers, RefreshCw, Eye, Sparkles, ShieldAlert
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
  type CreateCompanyAssetInput,
} from '@/actions/inventory'

export interface SerializedAsset {
  id: string
  companyId: string
  siteId: string | null
  name: string
  assetCode: string | null
  category: string
  brand: string | null
  modelNumber: string | null
  serialNumber: string | null
  quantity: number
  unit: string
  status: AssetStatusKey
  conditionNotes: string | null
  purchaseDate: string | null
  purchaseCost: number | null
  currentValue: number | null
  assignedTo: string | null
  locationName: string | null
  notes: string | null
  isActive: boolean
  createdAt: string
  updatedAt: string
  site?: { id: string; name: string } | null
}

export interface SiteOption {
  id: string
  name: string
}

interface InventoryClientProps {
  initialAssets: SerializedAsset[]
  sites: SiteOption[]
  companyName?: string
}

export default function InventoryClient({
  initialAssets,
  sites,
  companyName = 'Company',
}: InventoryClientProps) {
  const [assets, setAssets] = useState<SerializedAsset[]>(initialAssets)
  const [search, setSearch] = useState('')
  const [selectedCategory, setSelectedCategory] = useState<string>('ALL')
  const [selectedStatus, setSelectedStatus] = useState<string>('ALL')
  const [selectedSiteFilter, setSelectedSiteFilter] = useState<string>('ALL')
  const [viewMode, setViewMode] = useState<'grid' | 'table'>('grid')

  // Modals state
  const [showAddModal, setShowAddModal] = useState(false)
  const [transferTarget, setTransferTarget] = useState<SerializedAsset | null>(null)
  const [editTarget, setEditTarget] = useState<SerializedAsset | null>(null)
  const [statusTarget, setStatusTarget] = useState<SerializedAsset | null>(null)
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null)

  const [isPending, startTransition] = useTransition()
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [successToast, setSuccessToast] = useState<string | null>(null)

  const showToast = (msg: string) => {
    setSuccessToast(msg)
    setTimeout(() => setSuccessToast(null), 3500)
  }

  // Filtered Assets
  const filteredAssets = assets.filter((asset) => {
    // Search
    if (search.trim()) {
      const q = search.toLowerCase()
      const matchName = asset.name.toLowerCase().includes(q)
      const matchCode = asset.assetCode?.toLowerCase().includes(q) ?? false
      const matchBrand = asset.brand?.toLowerCase().includes(q) ?? false
      const matchCategory = asset.category.toLowerCase().includes(q)
      const matchAssigned = asset.assignedTo?.toLowerCase().includes(q) ?? false
      const matchSerial = asset.serialNumber?.toLowerCase().includes(q) ?? false
      const matchLoc = asset.locationName?.toLowerCase().includes(q) ?? false
      if (!matchName && !matchCode && !matchBrand && !matchCategory && !matchAssigned && !matchSerial && !matchLoc) {
        return false
      }
    }

    // Category
    if (selectedCategory !== 'ALL' && asset.category !== selectedCategory) {
      return false
    }

    // Status
    if (selectedStatus !== 'ALL' && asset.status !== selectedStatus) {
      return false
    }

    // Site / Location
    if (selectedSiteFilter !== 'ALL') {
      if (selectedSiteFilter === 'YARD') {
        if (asset.siteId !== null) return false
      } else {
        if (asset.siteId !== selectedSiteFilter) return false
      }
    }

    return true
  })

  // Dynamic Statistics
  const totalItemsCount = assets.reduce((sum, a) => sum + (a.quantity || 1), 0)
  const onSiteCount = assets
    .filter((a) => a.siteId !== null && a.status === 'IN_USE')
    .reduce((sum, a) => sum + (a.quantity || 1), 0)
  const availableInYard = assets
    .filter((a) => a.siteId === null || a.status === 'OPERATIONAL' || a.status === 'STANDBY')
    .reduce((sum, a) => sum + (a.quantity || 1), 0)
  const underMaintenanceCount = assets
    .filter((a) => a.status === 'UNDER_MAINTENANCE' || a.status === 'DAMAGED')
    .reduce((sum, a) => sum + (a.quantity || 1), 0)
  const totalCapitalValue = assets.reduce((sum, a) => {
    const cost = a.purchaseCost ?? a.currentValue ?? 0
    return sum + Number(cost) * (a.quantity || 1)
  }, 0)

  // Handle Delete
  const handleDelete = (id: string) => {
    startTransition(async () => {
      try {
        await deleteCompanyAssetAction(id)
        setAssets((prev) => prev.filter((a) => a.id !== id))
        setDeleteConfirmId(null)
        showToast('Tool / equipment removed from inventory')
      } catch (err: unknown) {
        setErrorMsg(err instanceof Error ? err.message : 'Failed to delete asset')
      }
    })
  }

  return (
    <div className="flex flex-col gap-6 p-1 sm:p-2">
      {/* Toast Notification */}
      {successToast && (
        <div className="fixed top-5 right-5 z-50 bg-emerald-600 text-white px-4 py-3 rounded-xl shadow-xl flex items-center gap-2.5 text-sm font-bold animate-in fade-in duration-200">
          <CheckCircle2 size={18} />
          <span>{successToast}</span>
        </div>
      )}

      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-xl bg-[#fc6e20]/10 text-[#fc6e20] flex items-center justify-center">
              <Wrench className="w-5 h-5" strokeWidth={2.4} />
            </div>
            <div>
              <h1 className="text-2xl font-black tracking-tight text-slate-900 dark:text-slate-100 m-0">
                Company Inventory
              </h1>
              <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 mt-0.5">
                Tools, Machinery & Capital Equipment Owned by {companyName}
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2.5 flex-wrap">
          <button
            onClick={() => setShowAddModal(true)}
            className="bg-[#fc6e20] hover:bg-[#e85b0d] text-white rounded-xl px-4 py-2.5 text-xs font-black tracking-wide flex items-center gap-2 shadow-sm transition-all hover:scale-102 active:scale-98 border-none cursor-pointer"
          >
            <Plus size={16} strokeWidth={3} />
            <span>Add New Tool / Equipment</span>
          </button>
        </div>
      </div>

      {/* KPI Stats Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3.5">
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/80 dark:border-slate-800 p-4 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
              Total Owned
            </span>
            <div className="w-8 h-8 rounded-lg bg-orange-50 dark:bg-orange-950/40 text-[#fc6e20] flex items-center justify-center">
              <Wrench size={16} />
            </div>
          </div>
          <div className="text-2xl font-black text-slate-900 dark:text-slate-100 mt-2">
            {totalItemsCount}
          </div>
          <div className="text-[11px] font-semibold text-slate-400 mt-0.5">
            {assets.length} unique equipment models
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/80 dark:border-slate-800 p-4 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-sky-600 dark:text-sky-400 uppercase tracking-wider">
              Active On Site
            </span>
            <div className="w-8 h-8 rounded-lg bg-sky-50 dark:bg-sky-950/40 text-sky-600 flex items-center justify-center">
              <Building2 size={16} />
            </div>
          </div>
          <div className="text-2xl font-black text-slate-900 dark:text-slate-100 mt-2">
            {onSiteCount}
          </div>
          <div className="text-[11px] font-semibold text-slate-400 mt-0.5">
            Deployed on projects
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/80 dark:border-slate-800 p-4 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-emerald-600 dark:text-emerald-400 uppercase tracking-wider">
              In Yard / Ready
            </span>
            <div className="w-8 h-8 rounded-lg bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 flex items-center justify-center">
              <CheckCircle2 size={16} />
            </div>
          </div>
          <div className="text-2xl font-black text-slate-900 dark:text-slate-100 mt-2">
            {availableInYard}
          </div>
          <div className="text-[11px] font-semibold text-slate-400 mt-0.5">
            Available to deploy
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/80 dark:border-slate-800 p-4 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-amber-600 dark:text-amber-400 uppercase tracking-wider">
              Maintenance
            </span>
            <div className="w-8 h-8 rounded-lg bg-amber-50 dark:bg-amber-950/40 text-amber-600 flex items-center justify-center">
              <AlertTriangle size={16} />
            </div>
          </div>
          <div className="text-2xl font-black text-slate-900 dark:text-slate-100 mt-2">
            {underMaintenanceCount}
          </div>
          <div className="text-[11px] font-semibold text-slate-400 mt-0.5">
            Repair or damaged
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/80 dark:border-slate-800 p-4 shadow-xs col-span-2 lg:col-span-1">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-purple-600 dark:text-purple-400 uppercase tracking-wider">
              Capital Value
            </span>
            <div className="w-8 h-8 rounded-lg bg-purple-50 dark:bg-purple-950/40 text-purple-600 flex items-center justify-center">
              <DollarSign size={16} />
            </div>
          </div>
          <div className="text-2xl font-black text-slate-900 dark:text-slate-100 mt-2 truncate">
            ₹{totalCapitalValue >= 100000 ? `${(totalCapitalValue / 100000).toFixed(2)} L` : totalCapitalValue.toLocaleString('en-IN')}
          </div>
          <div className="text-[11px] font-semibold text-slate-400 mt-0.5">
            Total equipment worth
          </div>
        </div>
      </div>

      {/* Filters and Search Bar */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/80 dark:border-slate-800 p-4 shadow-xs flex flex-col gap-3.5">
        <div className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-center justify-between">
          {/* Search */}
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by equipment name, code, brand, serial no, operator..."
              className="w-full pl-10 pr-4 py-2 bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-semibold text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-[#fc6e20]/40"
            />
            {search && (
              <button
                onClick={() => setSearch('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
              >
                <X size={14} />
              </button>
            )}
          </div>

          {/* Location Selector */}
          <div className="flex items-center gap-2">
            <select
              value={selectedSiteFilter}
              onChange={(e) => setSelectedSiteFilter(e.target.value)}
              className="px-3 py-2 bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-bold text-slate-700 dark:text-slate-200 focus:outline-none"
            >
              <option value="ALL">📍 All Locations</option>
              <option value="YARD">🏢 Central Yard / Warehouse</option>
              {sites.map((s) => (
                <option key={s.id} value={s.id}>
                  🏗️ Site: {s.name}
                </option>
              ))}
            </select>

            {/* View Mode Toggle */}
            <div className="flex items-center bg-slate-100 dark:bg-slate-800 p-1 rounded-xl">
              <button
                onClick={() => setViewMode('grid')}
                className={`px-3 py-1 text-xs font-bold rounded-lg border-none cursor-pointer transition-all ${
                  viewMode === 'grid'
                    ? 'bg-white dark:bg-slate-700 text-[#fc6e20] shadow-xs'
                    : 'bg-transparent text-slate-500 hover:text-slate-700'
                }`}
              >
                Cards
              </button>
              <button
                onClick={() => setViewMode('table')}
                className={`px-3 py-1 text-xs font-bold rounded-lg border-none cursor-pointer transition-all ${
                  viewMode === 'table'
                    ? 'bg-white dark:bg-slate-700 text-[#fc6e20] shadow-xs'
                    : 'bg-transparent text-slate-500 hover:text-slate-700'
                }`}
              >
                Table
              </button>
            </div>
          </div>
        </div>

        {/* Category Pills */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none">
          <button
            onClick={() => setSelectedCategory('ALL')}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap transition-all border ${
              selectedCategory === 'ALL'
                ? 'bg-[#fc6e20] text-white border-[#fc6e20]'
                : 'bg-slate-50 dark:bg-slate-800/50 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:bg-slate-100'
            }`}
          >
            All Categories ({assets.length})
          </button>
          {EQUIPMENT_CATEGORIES.map((cat) => {
            const count = assets.filter((a) => a.category === cat.name).length
            return (
              <button
                key={cat.id}
                onClick={() => setSelectedCategory(cat.name)}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap transition-all border flex items-center gap-1.5 ${
                  selectedCategory === cat.name
                    ? 'bg-[#fc6e20] text-white border-[#fc6e20]'
                    : 'bg-slate-50 dark:bg-slate-800/50 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:bg-slate-100'
                }`}
              >
                <span>{cat.icon}</span>
                <span>{cat.name}</span>
                <span className="text-[10px] opacity-75">({count})</span>
              </button>
            )
          })}
        </div>

        {/* Status Pills */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none border-t border-slate-100 dark:border-slate-800 pt-2.5">
          <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mr-1">Status:</span>
          {(['ALL', 'OPERATIONAL', 'IN_USE', 'STANDBY', 'UNDER_MAINTENANCE', 'DAMAGED', 'DECOMMISSIONED'] as const).map((st) => {
            const count = st === 'ALL' ? assets.length : assets.filter((a) => a.status === st).length
            const label = st === 'ALL' ? 'All' : ASSET_STATUS_CONFIG[st as AssetStatusKey]?.label || st
            return (
              <button
                key={st}
                onClick={() => setSelectedStatus(st)}
                className={`px-2.5 py-1 rounded-lg text-[11px] font-bold whitespace-nowrap transition-all border ${
                  selectedStatus === st
                    ? 'bg-slate-900 text-white border-slate-900 dark:bg-white dark:text-slate-900'
                    : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700'
                }`}
              >
                {label} ({count})
              </button>
            )
          })}
        </div>
      </div>

      {/* Assets Content View */}
      {filteredAssets.length === 0 ? (
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/80 dark:border-slate-800 p-12 text-center shadow-xs">
          <div className="w-16 h-16 rounded-2xl bg-orange-50 text-[#fc6e20] flex items-center justify-center mx-auto mb-4">
            <Wrench size={32} />
          </div>
          <h3 className="text-lg font-bold text-slate-900 dark:text-slate-100 mb-1">
            {assets.length === 0 ? 'No tools or equipment registered yet' : 'No equipment matches the filters'}
          </h3>
          <p className="text-xs text-slate-500 max-w-md mx-auto mb-6">
            {assets.length === 0
              ? 'Add all machinery, power tools, surveying instruments, generators and shuttering gear owned by your company.'
              : 'Try clearing the search query or changing category and location filters.'}
          </p>
          <button
            onClick={() => setShowAddModal(true)}
            className="bg-[#fc6e20] text-white px-5 py-2.5 rounded-xl text-xs font-bold shadow-sm hover:bg-[#e85b0d] transition-all cursor-pointer border-none inline-flex items-center gap-2"
          >
            <Plus size={16} />
            <span>Add First Tool / Equipment</span>
          </button>
        </div>
      ) : viewMode === 'grid' ? (
        /* GRID VIEW */
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {filteredAssets.map((asset) => {
            const statusConfig = ASSET_STATUS_CONFIG[asset.status] || ASSET_STATUS_CONFIG.OPERATIONAL
            return (
              <div
                key={asset.id}
                className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/80 dark:border-slate-800 p-5 shadow-xs flex flex-col justify-between hover:shadow-md transition-all group"
              >
                <div>
                  {/* Top line: Tag + Status */}
                  <div className="flex items-center justify-between gap-2 mb-3">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      {asset.assetCode ? (
                        <span className="text-[11px] font-mono font-bold bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 px-2 py-0.5 rounded-md border border-slate-200 dark:border-slate-700">
                          {asset.assetCode}
                        </span>
                      ) : (
                        <span className="text-[11px] font-mono font-bold bg-slate-50 text-slate-400 px-2 py-0.5 rounded-md">
                          ASSET
                        </span>
                      )}
                      <span className="text-[11px] font-semibold text-slate-500 dark:text-slate-400">
                        {asset.category}
                      </span>
                    </div>

                    <button
                      onClick={() => setStatusTarget(asset)}
                      title="Click to update status"
                      className={`px-2.5 py-0.5 rounded-full text-[11px] font-bold border flex items-center gap-1.5 cursor-pointer ${statusConfig.badgeClass}`}
                    >
                      <span className={`w-1.5 h-1.5 rounded-full ${statusConfig.dotClass}`} />
                      <span>{statusConfig.label}</span>
                    </button>
                  </div>

                  {/* Asset Name */}
                  <h3 className="text-base font-extrabold text-slate-900 dark:text-slate-100 m-0 leading-snug group-hover:text-[#fc6e20] transition-colors">
                    {asset.name}
                  </h3>

                  {/* Brand & Model */}
                  {(asset.brand || asset.modelNumber) && (
                    <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 mt-1 mb-0 flex items-center gap-1.5">
                      {asset.brand && <span className="font-bold text-slate-700 dark:text-slate-200">{asset.brand}</span>}
                      {asset.brand && asset.modelNumber && <span>·</span>}
                      {asset.modelNumber && <span>{asset.modelNumber}</span>}
                      {asset.serialNumber && (
                        <>
                          <span>·</span>
                          <span className="font-mono text-[10px]">S/N: {asset.serialNumber}</span>
                        </>
                      )}
                    </p>
                  )}

                  {/* Quantity and Location */}
                  <div className="mt-4 pt-3 border-t border-slate-100 dark:border-slate-800 grid grid-cols-2 gap-3 text-xs">
                    <div>
                      <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-0.5">
                        Quantity Owned
                      </div>
                      <div className="font-extrabold text-slate-900 dark:text-slate-100">
                        {asset.quantity} {asset.unit}
                      </div>
                    </div>

                    <div>
                      <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-0.5">
                        Current Location
                      </div>
                      <div className="font-bold text-slate-800 dark:text-slate-200 flex items-center gap-1 truncate" title={asset.site ? asset.site.name : asset.locationName || 'Central Yard'}>
                        <MapPin size={12} className="text-[#fc6e20] shrink-0" />
                        <span className="truncate">{asset.site ? asset.site.name : asset.locationName || 'Central Yard'}</span>
                      </div>
                    </div>

                    {asset.assignedTo && (
                      <div className="col-span-2">
                        <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-0.5">
                          In-Charge / Operator
                        </div>
                        <div className="font-semibold text-slate-700 dark:text-slate-300 flex items-center gap-1.5 text-[11.5px]">
                          <User size={12} className="text-slate-400 shrink-0" />
                          <span>{asset.assignedTo}</span>
                        </div>
                      </div>
                    )}

                    {asset.conditionNotes && (
                      <div className="col-span-2 bg-slate-50 dark:bg-slate-800/40 p-2 rounded-lg text-[11px] text-slate-600 dark:text-slate-300">
                        <span className="font-bold text-slate-700 dark:text-slate-200">Condition: </span>
                        {asset.conditionNotes}
                      </div>
                    )}
                  </div>
                </div>

                {/* Bottom Actions */}
                <div className="mt-4 pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between gap-2">
                  <div className="text-[11px] font-bold text-slate-600 dark:text-slate-300">
                    {asset.purchaseCost ? (
                      <span>₹{asset.purchaseCost.toLocaleString('en-IN')}</span>
                    ) : (
                      <span className="text-slate-400 font-normal">No cost logged</span>
                    )}
                  </div>

                  <div className="flex items-center gap-1.5">
                    {/* Transfer Button */}
                    <button
                      onClick={() => setTransferTarget(asset)}
                      title="Transfer Location / Assign to Site"
                      className="px-2.5 py-1.5 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 rounded-lg text-[11px] font-bold flex items-center gap-1 border-none cursor-pointer transition-all"
                    >
                      <ArrowRightLeft size={13} />
                      <span>Transfer</span>
                    </button>

                    {/* Edit */}
                    <button
                      onClick={() => setEditTarget(asset)}
                      title="Edit Equipment Details"
                      className="p-1.5 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg border-none cursor-pointer transition-all"
                    >
                      <Edit size={14} />
                    </button>

                    {/* Delete */}
                    <button
                      onClick={() => setDeleteConfirmId(asset.id)}
                      title="Delete Equipment"
                      className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 rounded-lg border-none cursor-pointer transition-all"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      ) : (
        /* TABLE VIEW */
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-xs overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-slate-50 dark:bg-slate-800/60 border-b border-slate-200 dark:border-slate-800 text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                  <th className="px-4 py-3.5">Asset Code & Item</th>
                  <th className="px-4 py-3.5">Category</th>
                  <th className="px-4 py-3.5">Brand / Model</th>
                  <th className="px-4 py-3.5">Quantity</th>
                  <th className="px-4 py-3.5">Location</th>
                  <th className="px-4 py-3.5">Status</th>
                  <th className="px-4 py-3.5">In-Charge</th>
                  <th className="px-4 py-3.5 text-right">Cost</th>
                  <th className="px-4 py-3.5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {filteredAssets.map((asset) => {
                  const statusConfig = ASSET_STATUS_CONFIG[asset.status] || ASSET_STATUS_CONFIG.OPERATIONAL
                  return (
                    <tr key={asset.id} className="hover:bg-slate-50/70 dark:hover:bg-slate-800/40 transition-colors">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          {asset.assetCode && (
                            <span className="font-mono text-[10px] font-bold bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 px-1.5 py-0.5 rounded">
                              {asset.assetCode}
                            </span>
                          )}
                          <span className="font-bold text-slate-900 dark:text-slate-100">{asset.name}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-slate-600 dark:text-slate-400 font-medium">
                        {asset.category}
                      </td>
                      <td className="px-4 py-3 text-slate-600 dark:text-slate-400">
                        {asset.brand || '—'} {asset.modelNumber ? `(${asset.modelNumber})` : ''}
                      </td>
                      <td className="px-4 py-3 font-extrabold text-slate-900 dark:text-slate-100">
                        {asset.quantity} {asset.unit}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1 font-semibold text-slate-700 dark:text-slate-300">
                          <MapPin size={12} className="text-[#fc6e20]" />
                          <span>{asset.site ? asset.site.name : asset.locationName || 'Central Yard'}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <button
                          onClick={() => setStatusTarget(asset)}
                          className={`px-2 py-0.5 rounded-full text-[10.5px] font-bold border flex items-center gap-1.5 cursor-pointer ${statusConfig.badgeClass}`}
                        >
                          <span className={`w-1.5 h-1.5 rounded-full ${statusConfig.dotClass}`} />
                          <span>{statusConfig.label}</span>
                        </button>
                      </td>
                      <td className="px-4 py-3 text-slate-600 dark:text-slate-400">
                        {asset.assignedTo || '—'}
                      </td>
                      <td className="px-4 py-3 text-right font-semibold text-slate-800 dark:text-slate-200">
                        {asset.purchaseCost ? `₹${asset.purchaseCost.toLocaleString('en-IN')}` : '—'}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <button
                            onClick={() => setTransferTarget(asset)}
                            title="Transfer"
                            className="p-1 text-slate-500 hover:text-slate-900 hover:bg-slate-100 rounded"
                          >
                            <ArrowRightLeft size={14} />
                          </button>
                          <button
                            onClick={() => setEditTarget(asset)}
                            title="Edit"
                            className="p-1 text-slate-500 hover:text-slate-900 hover:bg-slate-100 rounded"
                          >
                            <Edit size={14} />
                          </button>
                          <button
                            onClick={() => setDeleteConfirmId(asset.id)}
                            title="Delete"
                            className="p-1 text-rose-500 hover:text-rose-700 hover:bg-rose-50 rounded"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ============================================================ */}
      {/* ADD NEW TOOL / EQUIPMENT MODAL */}
      {/* ============================================================ */}
      {showAddModal && (
        <AddAssetModal
          sites={sites}
          onClose={() => setShowAddModal(false)}
          onSuccess={(newAsset) => {
            const assetObj = newAsset as unknown as SerializedAsset
            setAssets((prev) => [assetObj, ...prev])
            setShowAddModal(false)
            showToast(`Added ${assetObj.name} to company inventory!`)
          }}
        />
      )}

      {/* ============================================================ */}
      {/* TRANSFER ASSET LOCATION MODAL */}
      {/* ============================================================ */}
      {transferTarget && (
        <TransferAssetModal
          asset={transferTarget}
          sites={sites}
          onClose={() => setTransferTarget(null)}
          onSuccess={(updated) => {
            setAssets((prev) =>
              prev.map((a) => (a.id === updated.id ? { ...a, ...updated } : a))
            )
            setTransferTarget(null)
            showToast(`Transferred ${transferTarget.name} successfully`)
          }}
        />
      )}

      {/* ============================================================ */}
      {/* UPDATE STATUS MODAL */}
      {/* ============================================================ */}
      {statusTarget && (
        <UpdateStatusModal
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

      {/* ============================================================ */}
      {/* EDIT ASSET MODAL */}
      {/* ============================================================ */}
      {editTarget && (
        <EditAssetModal
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

      {/* ============================================================ */}
      {/* DELETE CONFIRMATION DIALOG */}
      {/* ============================================================ */}
      {deleteConfirmId && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 rounded-2xl max-w-sm w-full p-6 shadow-2xl border border-slate-200 dark:border-slate-800 animate-in fade-in zoom-in-95 duration-150">
            <div className="w-12 h-12 rounded-full bg-rose-50 text-rose-600 flex items-center justify-center mx-auto mb-4">
              <Trash2 size={22} />
            </div>
            <h3 className="text-base font-bold text-slate-900 dark:text-slate-100 text-center m-0">
              Remove Tool / Equipment?
            </h3>
            <p className="text-xs text-slate-500 text-center mt-2 mb-6">
              This item will be removed from active company inventory.
            </p>
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => setDeleteConfirmId(null)}
                className="flex-1 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-bold text-slate-700 dark:text-slate-200 cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={isPending}
                onClick={() => handleDelete(deleteConfirmId)}
                className="flex-1 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold cursor-pointer border-none shadow-sm disabled:opacity-50"
              >
                {isPending ? 'Removing...' : 'Yes, Remove'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// =====================================================================
// ADD ASSET MODAL COMPONENT
// =====================================================================
function AddAssetModal({
  sites,
  onClose,
  onSuccess,
}: {
  sites: SiteOption[]
  onClose: () => void
  onSuccess: (asset: unknown) => void
}) {
  const [selectedCategoryObj, setSelectedCategoryObj] = useState(EQUIPMENT_CATEGORIES[0])
  const [name, setName] = useState('')
  const [category, setCategory] = useState(EQUIPMENT_CATEGORIES[0].name)
  const [assetCode, setAssetCode] = useState('')
  const [brand, setBrand] = useState('')
  const [modelNumber, setModelNumber] = useState('')
  const [serialNumber, setSerialNumber] = useState('')
  const [quantity, setQuantity] = useState(1)
  const [unit, setUnit] = useState('Nos')
  const [siteId, setSiteId] = useState<string>('YARD')
  const [locationName, setLocationName] = useState('Central Yard / Store')
  const [status, setStatus] = useState<AssetStatusKey>('OPERATIONAL')
  const [conditionNotes, setConditionNotes] = useState('Good working condition')
  const [purchaseCost, setPurchaseCost] = useState('')
  const [purchaseDate, setPurchaseDate] = useState('')
  const [assignedTo, setAssignedTo] = useState('')
  const [notes, setNotes] = useState('')

  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Handle preset click
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
      setError('Please provide the tool or equipment name')
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
        serialNumber: serialNumber.trim() || undefined,
        quantity: Math.max(1, Number(quantity) || 1),
        unit: unit.trim() || 'Nos',
        siteId: siteId === 'YARD' ? null : siteId,
        locationName: locationName.trim() || undefined,
        status,
        conditionNotes: conditionNotes.trim() || undefined,
        purchaseCost: purchaseCost ? parseFloat(purchaseCost) : undefined,
        purchaseDate: purchaseDate || undefined,
        assignedTo: assignedTo.trim() || undefined,
        notes: notes.trim() || undefined,
      })

      if (res.success && res.asset) {
        onSuccess(res.asset)
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to create asset')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
      <div className="bg-white dark:bg-slate-900 rounded-2xl max-w-2xl w-full p-5 sm:p-6 shadow-2xl border border-slate-200 dark:border-slate-800 my-8 max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between pb-4 border-b border-slate-100 dark:border-slate-800 shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-[#fc6e20]/10 text-[#fc6e20] flex items-center justify-center">
              <Plus size={20} strokeWidth={2.5} />
            </div>
            <div>
              <h2 className="text-lg font-black text-slate-900 dark:text-slate-100 m-0">
                Add Tool / Equipment
              </h2>
              <p className="text-xs text-slate-500 m-0">
                Register machinery, instruments, or power tools owned by your company
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 flex items-center justify-center text-slate-500 border-none cursor-pointer"
          >
            <X size={16} />
          </button>
        </div>

        {error && (
          <div className="mt-3 p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs font-bold flex items-center gap-2">
            <AlertTriangle size={15} />
            <span>{error}</span>
          </div>
        )}

        {/* Scrollable Form Body */}
        <form onSubmit={handleSubmit} className="overflow-y-auto pr-1 flex-1 space-y-4 pt-4">
          {/* Quick Presets Section */}
          <div className="bg-slate-50 dark:bg-slate-800/50 p-3.5 rounded-xl border border-slate-200/70 dark:border-slate-700">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[11px] font-bold text-slate-700 dark:text-slate-200 uppercase tracking-wider flex items-center gap-1.5">
                <Sparkles size={13} className="text-[#fc6e20]" />
                <span>Quick Popular Presets</span>
              </span>
              <span className="text-[10px] text-slate-400">Click to autofill</span>
            </div>

            {/* Category tabs */}
            <div className="flex items-center gap-1 overflow-x-auto pb-1.5 scrollbar-none">
              {EQUIPMENT_CATEGORIES.map((cat) => (
                <button
                  type="button"
                  key={cat.id}
                  onClick={() => {
                    setSelectedCategoryObj(cat)
                    setCategory(cat.name)
                  }}
                  className={`px-2.5 py-1 rounded-lg text-[11px] font-bold whitespace-nowrap transition-all border ${
                    selectedCategoryObj.id === cat.id
                      ? 'bg-slate-900 text-white border-slate-900 dark:bg-white dark:text-slate-900'
                      : 'bg-white dark:bg-slate-800 text-slate-600 border-slate-200 dark:border-slate-700'
                  }`}
                >
                  {cat.icon} {cat.name.split(' ')[0]}
                </button>
              ))}
            </div>

            {/* Popular items under selected category */}
            <div className="flex flex-wrap gap-1.5 mt-2">
              {selectedCategoryObj.popularItems.map((item) => (
                <button
                  type="button"
                  key={item.name}
                  onClick={() => applyPreset(item)}
                  className="px-2.5 py-1 bg-white dark:bg-slate-800 hover:bg-orange-50 hover:text-[#fc6e20] hover:border-orange-200 border border-slate-200 dark:border-slate-700 rounded-lg text-xs font-medium text-slate-700 dark:text-slate-200 transition-all text-left"
                >
                  + {item.name}
                </button>
              ))}
            </div>
          </div>

          {/* Form fields */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
            {/* Name */}
            <div className="sm:col-span-2">
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                Equipment / Tool Name <span className="text-rose-500">*</span>
              </label>
              <input
                type="text"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Concrete Mixer 10/7, Leica TS07 Total Station, Bosch Hammer"
                className="w-full px-3.5 py-2.5 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl text-xs font-semibold text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-[#fc6e20]/40"
              />
            </div>

            {/* Category */}
            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                Category
              </label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="w-full px-3.5 py-2.5 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl text-xs font-semibold text-slate-900 dark:text-slate-100 focus:outline-none"
              >
                {EQUIPMENT_CATEGORIES.map((cat) => (
                  <option key={cat.id} value={cat.name}>
                    {cat.icon} {cat.name}
                  </option>
                ))}
                <option value="General Tools">🛠️ General Tools</option>
              </select>
            </div>

            {/* Asset Code / Tag */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300">
                  Asset Code / Tag
                </label>
                <button
                  type="button"
                  onClick={() => {
                    const rnd = Math.floor(100 + Math.random() * 900)
                    setAssetCode(`EQ-${rnd}`)
                  }}
                  className="text-[10.5px] font-bold text-[#fc6e20] hover:underline bg-transparent border-none p-0 cursor-pointer"
                >
                  Generate Tag
                </button>
              </div>
              <input
                type="text"
                value={assetCode}
                onChange={(e) => setAssetCode(e.target.value)}
                placeholder="e.g. EQ-CM-001, TL-BOS-02"
                className="w-full px-3.5 py-2.5 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl text-xs font-semibold font-mono text-slate-900 dark:text-slate-100 focus:outline-none"
              />
            </div>

            {/* Brand */}
            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                Brand / Manufacturer
              </label>
              <input
                type="text"
                value={brand}
                onChange={(e) => setBrand(e.target.value)}
                placeholder="e.g. Bosch, JCB, Leica, Kirloskar"
                className="w-full px-3.5 py-2.5 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl text-xs font-semibold text-slate-900 dark:text-slate-100 focus:outline-none"
              />
            </div>

            {/* Model Number */}
            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                Model / Capacity
              </label>
              <input
                type="text"
                value={modelNumber}
                onChange={(e) => setModelNumber(e.target.value)}
                placeholder="e.g. GSH 11 E, 10/7, 15 kVA"
                className="w-full px-3.5 py-2.5 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl text-xs font-semibold text-slate-900 dark:text-slate-100 focus:outline-none"
              />
            </div>

            {/* Serial Number */}
            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                Serial Number (Optional)
              </label>
              <input
                type="text"
                value={serialNumber}
                onChange={(e) => setSerialNumber(e.target.value)}
                placeholder="e.g. SN-89427189"
                className="w-full px-3.5 py-2.5 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl text-xs font-semibold font-mono text-slate-900 dark:text-slate-100 focus:outline-none"
              />
            </div>

            {/* Quantity & Unit */}
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Quantity Owned
                </label>
                <input
                  type="number"
                  min="1"
                  value={quantity}
                  onChange={(e) => setQuantity(Math.max(1, parseInt(e.target.value) || 1))}
                  className="w-full px-3.5 py-2.5 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl text-xs font-bold text-slate-900 dark:text-slate-100 focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Unit
                </label>
                <select
                  value={unit}
                  onChange={(e) => setUnit(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl text-xs font-semibold text-slate-900 dark:text-slate-100 focus:outline-none"
                >
                  {ASSET_UNITS.map((u) => (
                    <option key={u} value={u}>
                      {u}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Location (Yard vs Site) */}
            <div className="sm:col-span-2 grid grid-cols-1 sm:grid-cols-2 gap-3.5 bg-slate-50 dark:bg-slate-800/40 p-3 rounded-xl border border-slate-200/70 dark:border-slate-700">
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Current Location / Deployment
                </label>
                <select
                  value={siteId}
                  onChange={(e) => {
                    const sid = e.target.value
                    setSiteId(sid)
                    if (sid === 'YARD') {
                      setLocationName('Central Yard / Store')
                      setStatus('OPERATIONAL')
                    } else {
                      const matched = sites.find((s) => s.id === sid)
                      setLocationName(matched ? matched.name : 'Active Site')
                      setStatus('IN_USE')
                    }
                  }}
                  className="w-full px-3.5 py-2 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl text-xs font-bold text-slate-900 dark:text-slate-100 focus:outline-none"
                >
                  <option value="YARD">🏢 Central Yard / Warehouse / Head Office</option>
                  {sites.map((s) => (
                    <option key={s.id} value={s.id}>
                      🏗️ Deploy at Site: {s.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Specific Place / Bay / Room
                </label>
                <input
                  type="text"
                  value={locationName}
                  onChange={(e) => setLocationName(e.target.value)}
                  placeholder="e.g. Shed A, Tower 2 Tool Room"
                  className="w-full px-3.5 py-2 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl text-xs font-semibold text-slate-900 dark:text-slate-100 focus:outline-none"
                />
              </div>
            </div>

            {/* Status */}
            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                Equipment Status
              </label>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value as AssetStatusKey)}
                className="w-full px-3.5 py-2.5 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl text-xs font-bold text-slate-900 dark:text-slate-100 focus:outline-none"
              >
                {(Object.keys(ASSET_STATUS_CONFIG) as AssetStatusKey[]).map((key) => (
                  <option key={key} value={key}>
                    {ASSET_STATUS_CONFIG[key].label}
                  </option>
                ))}
              </select>
            </div>

            {/* In-Charge Operator */}
            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                Assigned Operator / In-Charge
              </label>
              <input
                type="text"
                value={assignedTo}
                onChange={(e) => setAssignedTo(e.target.value)}
                placeholder="e.g. Suresh (Machinist), Ramesh (JE)"
                className="w-full px-3.5 py-2.5 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl text-xs font-semibold text-slate-900 dark:text-slate-100 focus:outline-none"
              />
            </div>

            {/* Condition Notes */}
            <div className="sm:col-span-2">
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                Condition & Maintenance Notes
              </label>
              <input
                type="text"
                value={conditionNotes}
                onChange={(e) => setConditionNotes(e.target.value)}
                placeholder="e.g. Fully operational, serviced last month, blade sharp"
                className="w-full px-3.5 py-2 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl text-xs font-semibold text-slate-900 dark:text-slate-100 focus:outline-none"
              />
            </div>

            {/* Purchase Cost & Date */}
            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                Purchase Cost (₹ Optional)
              </label>
              <input
                type="number"
                step="any"
                value={purchaseCost}
                onChange={(e) => setPurchaseCost(e.target.value)}
                placeholder="e.g. 45000"
                className="w-full px-3.5 py-2 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl text-xs font-semibold text-slate-900 dark:text-slate-100 focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                Purchase Date (Optional)
              </label>
              <input
                type="date"
                value={purchaseDate}
                onChange={(e) => setPurchaseDate(e.target.value)}
                className="w-full px-3.5 py-2 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl text-xs font-semibold text-slate-900 dark:text-slate-100 focus:outline-none"
              />
            </div>
          </div>

          {/* Modal Footer Buttons */}
          <div className="pt-4 border-t border-slate-100 dark:border-slate-800 flex items-center justify-end gap-3 sticky bottom-0 bg-white dark:bg-slate-900">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-bold text-slate-700 dark:text-slate-200 cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="px-5 py-2.5 rounded-xl bg-[#fc6e20] hover:bg-[#e85b0d] text-white text-xs font-bold cursor-pointer border-none shadow-sm disabled:opacity-50 flex items-center gap-2"
            >
              {loading ? (
                <>
                  <RefreshCw size={14} className="animate-spin" />
                  <span>Saving...</span>
                </>
              ) : (
                <span>Save to Company Inventory</span>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// =====================================================================
// TRANSFER ASSET MODAL
// =====================================================================
function TransferAssetModal({
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
  const [toSiteId, setToSiteId] = useState<string>(asset.siteId ? 'YARD' : (sites[0]?.id || 'YARD'))
  const [locationName, setLocationName] = useState('')
  const [assignedTo, setAssignedTo] = useState(asset.assignedTo || '')
  const [transferNotes, setTransferNotes] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError(null)

    try {
      await transferAssetAction({
        assetId: asset.id,
        toSiteId: toSiteId === 'YARD' ? null : toSiteId,
        locationName: locationName.trim() || undefined,
        assignedTo: assignedTo.trim() || undefined,
        notes: transferNotes.trim() || undefined,
      })

      const targetSite = sites.find((s) => s.id === toSiteId)
      onSuccess({
        siteId: toSiteId === 'YARD' ? null : toSiteId,
        site: targetSite ? { id: targetSite.id, name: targetSite.name } : null,
        locationName: locationName.trim() || (toSiteId === 'YARD' ? 'Central Yard / Store' : targetSite?.name || 'Site'),
        assignedTo: assignedTo.trim() || null,
        status: toSiteId === 'YARD' ? 'STANDBY' : 'IN_USE',
      })
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to transfer asset')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white dark:bg-slate-900 rounded-2xl max-w-md w-full p-5 sm:p-6 shadow-2xl border border-slate-200 dark:border-slate-800">
        <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
          <div className="flex items-center gap-2">
            <ArrowRightLeft className="text-[#fc6e20]" size={18} />
            <h3 className="text-base font-extrabold text-slate-900 dark:text-slate-100 m-0">
              Transfer Location
            </h3>
          </div>
          <button
            onClick={onClose}
            className="w-7 h-7 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-slate-400 border-none cursor-pointer"
          >
            <X size={15} />
          </button>
        </div>

        <div className="mt-3 p-3 bg-slate-50 dark:bg-slate-800/60 rounded-xl text-xs">
          <div className="font-extrabold text-slate-900 dark:text-slate-100">{asset.name}</div>
          <div className="text-slate-500 mt-0.5">
            Current: <span className="font-bold text-[#fc6e20]">{asset.site ? asset.site.name : asset.locationName || 'Central Yard'}</span>
          </div>
        </div>

        {error && (
          <div className="mt-3 p-2.5 rounded-lg bg-rose-50 text-rose-700 text-xs font-bold">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="mt-4 space-y-3.5">
          <div>
            <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
              Transfer Destination <span className="text-rose-500">*</span>
            </label>
            <select
              value={toSiteId}
              onChange={(e) => {
                const sid = e.target.value
                setToSiteId(sid)
                if (sid === 'YARD') {
                  setLocationName('Central Yard / Store')
                } else {
                  const s = sites.find((item) => item.id === sid)
                  if (s) setLocationName(s.name)
                }
              }}
              className="w-full px-3 py-2 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl text-xs font-bold text-slate-900 dark:text-slate-100 focus:outline-none"
            >
              <option value="YARD">🏢 Return to Central Yard / Warehouse</option>
              {sites
                .filter((s) => s.id !== asset.siteId)
                .map((s) => (
                  <option key={s.id} value={s.id}>
                    🏗️ Transfer to Site: {s.name}
                  </option>
                ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
              New In-Charge / Handover Person
            </label>
            <input
              type="text"
              value={assignedTo}
              onChange={(e) => setAssignedTo(e.target.value)}
              placeholder="e.g. Ramesh (Site Engineer)"
              className="w-full px-3 py-2 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl text-xs font-semibold text-slate-900 dark:text-slate-100 focus:outline-none"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
              Transfer Reason / Note
            </label>
            <input
              type="text"
              value={transferNotes}
              onChange={(e) => setTransferNotes(e.target.value)}
              placeholder="e.g. Required for second floor slab casting"
              className="w-full px-3 py-2 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl text-xs font-semibold text-slate-900 dark:text-slate-100 focus:outline-none"
            />
          </div>

          <div className="pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-end gap-2.5">
            <button
              type="button"
              onClick={onClose}
              className="px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-bold text-slate-600 dark:text-slate-300 cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="px-4 py-2 rounded-xl bg-[#fc6e20] hover:bg-[#e85b0d] text-white text-xs font-bold cursor-pointer border-none shadow-sm disabled:opacity-50"
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
// UPDATE STATUS MODAL
// =====================================================================
function UpdateStatusModal({
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
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white dark:bg-slate-900 rounded-2xl max-w-sm w-full p-5 shadow-2xl border border-slate-200 dark:border-slate-800">
        <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
          <h3 className="text-sm font-extrabold text-slate-900 dark:text-slate-100 m-0">
            Update Status: {asset.name}
          </h3>
          <button
            onClick={onClose}
            className="w-7 h-7 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-slate-400 border-none cursor-pointer"
          >
            <X size={14} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="mt-3 space-y-3">
          <div>
            <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
              Select New Status
            </label>
            <div className="space-y-1.5">
              {(Object.keys(ASSET_STATUS_CONFIG) as AssetStatusKey[]).map((key) => {
                const cfg = ASSET_STATUS_CONFIG[key]
                const isSelected = status === key
                return (
                  <button
                    type="button"
                    key={key}
                    onClick={() => setStatus(key)}
                    className={`w-full p-2 rounded-xl border text-left flex items-center justify-between transition-all ${
                      isSelected
                        ? 'border-[#fc6e20] bg-orange-50/50 dark:bg-orange-950/20'
                        : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <span className={`w-2 h-2 rounded-full ${cfg.dotClass}`} />
                      <div>
                        <div className="text-xs font-bold text-slate-900 dark:text-slate-100">{cfg.label}</div>
                        <div className="text-[10px] text-slate-400">{cfg.description}</div>
                      </div>
                    </div>
                    {isSelected && <Check size={16} className="text-[#fc6e20]" />}
                  </button>
                )
              })}
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
              Condition Notes
            </label>
            <input
              type="text"
              value={conditionNotes}
              onChange={(e) => setConditionNotes(e.target.value)}
              placeholder="e.g. Sent for motor rewind, expected back Friday"
              className="w-full px-3 py-2 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl text-xs font-semibold text-slate-900 dark:text-slate-100 focus:outline-none"
            />
          </div>

          <div className="pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white text-xs font-bold text-slate-600"
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
// EDIT ASSET MODAL
// =====================================================================
function EditAssetModal({
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
  const [category, setCategory] = useState(asset.category)
  const [assetCode, setAssetCode] = useState(asset.assetCode || '')
  const [brand, setBrand] = useState(asset.brand || '')
  const [modelNumber, setModelNumber] = useState(asset.modelNumber || '')
  const [serialNumber, setSerialNumber] = useState(asset.serialNumber || '')
  const [quantity, setQuantity] = useState(asset.quantity)
  const [unit, setUnit] = useState(asset.unit)
  const [assignedTo, setAssignedTo] = useState(asset.assignedTo || '')
  const [conditionNotes, setConditionNotes] = useState(asset.conditionNotes || '')
  const [purchaseCost, setPurchaseCost] = useState(asset.purchaseCost?.toString() || '')
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    try {
      const res = await updateCompanyAssetAction(asset.id, {
        name,
        category,
        assetCode: assetCode || undefined,
        brand: brand || undefined,
        modelNumber: modelNumber || undefined,
        serialNumber: serialNumber || undefined,
        quantity,
        unit,
        assignedTo: assignedTo || null,
        conditionNotes: conditionNotes || null,
        purchaseCost: purchaseCost ? parseFloat(purchaseCost) : null,
      })
      if (res.success && res.asset) {
        onSuccess(res.asset as unknown as Partial<SerializedAsset>)
      }
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white dark:bg-slate-900 rounded-2xl max-w-lg w-full p-5 sm:p-6 shadow-2xl border border-slate-200 dark:border-slate-800">
        <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
          <h3 className="text-base font-extrabold text-slate-900 dark:text-slate-100 m-0">
            Edit Equipment Details
          </h3>
          <button
            onClick={onClose}
            className="w-7 h-7 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-slate-400 border-none cursor-pointer"
          >
            <X size={15} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="mt-4 space-y-3">
          <div>
            <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
              Equipment Name
            </label>
            <input
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full px-3 py-2 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl text-xs font-semibold text-slate-900 dark:text-slate-100"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                Asset Tag
              </label>
              <input
                type="text"
                value={assetCode}
                onChange={(e) => setAssetCode(e.target.value)}
                className="w-full px-3 py-2 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl text-xs font-mono font-semibold"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                Brand
              </label>
              <input
                type="text"
                value={brand}
                onChange={(e) => setBrand(e.target.value)}
                className="w-full px-3 py-2 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl text-xs font-semibold"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                Model / Capacity
              </label>
              <input
                type="text"
                value={modelNumber}
                onChange={(e) => setModelNumber(e.target.value)}
                className="w-full px-3 py-2 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl text-xs font-semibold"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                Serial Number
              </label>
              <input
                type="text"
                value={serialNumber}
                onChange={(e) => setSerialNumber(e.target.value)}
                className="w-full px-3 py-2 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl text-xs font-mono font-semibold"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                Quantity
              </label>
              <input
                type="number"
                min="1"
                value={quantity}
                onChange={(e) => setQuantity(Math.max(1, parseInt(e.target.value) || 1))}
                className="w-full px-3 py-2 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl text-xs font-bold"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                Unit
              </label>
              <input
                type="text"
                value={unit}
                onChange={(e) => setUnit(e.target.value)}
                className="w-full px-3 py-2 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl text-xs font-semibold"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                In-Charge / Operator
              </label>
              <input
                type="text"
                value={assignedTo}
                onChange={(e) => setAssignedTo(e.target.value)}
                className="w-full px-3 py-2 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl text-xs font-semibold"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                Purchase Cost (₹)
              </label>
              <input
                type="number"
                value={purchaseCost}
                onChange={(e) => setPurchaseCost(e.target.value)}
                className="w-full px-3 py-2 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl text-xs font-semibold"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
              Condition Notes
            </label>
            <input
              type="text"
              value={conditionNotes}
              onChange={(e) => setConditionNotes(e.target.value)}
              className="w-full px-3 py-2 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl text-xs font-semibold"
            />
          </div>

          <div className="pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-3.5 py-2 rounded-xl border border-slate-200 bg-white text-xs font-bold text-slate-600"
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
