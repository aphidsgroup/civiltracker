'use client'

import React, { useState, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  ArrowLeft,
  Package,
  Clock,
  Calendar,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Search,
  Plus,
  Trash2,
  Layers,
  MapPin,
  ChevronDown,
  Sparkles,
  Info,
  Building2,
  X,
  Check,
  Tag
} from 'lucide-react'
import {
  MATERIAL_CATALOGUE,
  searchCatalogueMaterials,
  MaterialVariant,
  MaterialCategory,
} from '@/lib/material-catalogue'
import {
  createMaterialRequestAction,
  addCompanyCatalogueItemAction,
  MaterialRequestItemInput,
} from '@/actions/requests'

interface SiteOption {
  id: string
  name: string
}

export interface CustomCatalogueItemProp {
  id: string
  category: string
  materialName: string
  variantId: string
  specification: string
  brand?: string | null
  defaultUnit: string
  allowedUnits: string[]
  isDecimalAllowed: boolean
  packSize?: string
  conversionNote?: string
}

const WORK_LOCATION_SUGGESTIONS = [
  'Foundation / Footing',
  'Plinth Beam Level',
  'Ground Floor Columns',
  'Ground Floor Slab',
  'First Floor Masonry',
  'First Floor Slab',
  'Second Floor Masonry',
  'Roof Terrace Slab & Parapet',
  'External Plastering',
  'Internal Plastering',
  'Plumbing & Drainage Shaft',
  'Electrical Rough-in',
  'Flooring & Tiling Work',
  'Compound Wall',
]

export default function MobileRequestMaterialClient({
  sites,
  customCatalogueItems = [],
  defaultSiteId,
  defaultSiteName,
}: {
  sites: SiteOption[]
  customCatalogueItems?: CustomCatalogueItemProp[]
  defaultSiteId?: string
  defaultSiteName: string
}) {
  const router = useRouter()
  const initialSiteId = defaultSiteId || (sites[0]?.id ?? '')

  // Context & Metadata
  const [siteId, setSiteId] = useState(initialSiteId)
  const [workLocation, setWorkLocation] = useState('')
  const [urgency, setUrgency] = useState<'Normal' | 'High' | 'Urgent'>('Normal')
  const [neededBy, setNeededBy] = useState('')
  const [generalNotes, setGeneralNotes] = useState('')

  // Search & Filter
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedCategory, setSelectedCategory] = useState<string>('ALL')

  // Selected Material for Configuration
  const [selectedMaterial, setSelectedMaterial] = useState<MaterialVariant | null>(null)
  const [selectedSpecs, setSelectedSpecs] = useState<Record<string, string>>({})
  const [selectedBrand, setSelectedBrand] = useState<string>('')
  const [customBrand, setCustomBrand] = useState<string>('')
  const [quantity, setQuantity] = useState<string>('')
  const [selectedUnit, setSelectedUnit] = useState<string>('')
  const [itemNotes, setItemNotes] = useState<string>('')

  // Multi-Item Indent Cart
  const [cartItems, setCartItems] = useState<MaterialRequestItemInput[]>([])

  // Modal: Add Custom / Unlisted Material
  const [showCustomModal, setShowCustomModal] = useState(false)
  const [customMatName, setCustomMatName] = useState('')
  const [customMatCategory, setCustomMatCategory] = useState('Cement, sand, aggregates & concrete')
  const [customMatSpec, setCustomMatSpec] = useState('')
  const [customMatBrand, setCustomMatBrand] = useState('')
  const [customMatQty, setCustomMatQty] = useState('')
  const [customMatUnit, setCustomMatUnit] = useState('Nos')
  const [saveToCompanyCatalogue, setSaveToCompanyCatalogue] = useState(true)

  // Status
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)

  // Merge custom catalogue items with master search results
  const filteredMaterials = useMemo(() => {
    const masterResults = searchCatalogueMaterials(searchQuery, selectedCategory)

    // Convert custom items to MaterialVariant format
    const customVariants: MaterialVariant[] = (customCatalogueItems || [])
      .filter((ci) => {
        if (!ci) return false
        if (selectedCategory !== 'ALL') {
          const cat = MATERIAL_CATALOGUE.find((c) => c.id === selectedCategory)
          const catNamePart = cat?.name?.split('.')[1]?.trim()?.toLowerCase() || ''
          const itemCat = (ci.category || '').toLowerCase()
          if (catNamePart && !itemCat.includes(catNamePart) && !catNamePart.includes(itemCat)) {
            return false
          }
        }
        if (!searchQuery.trim()) return true
        const q = searchQuery.toLowerCase()
        return (
          (ci.materialName || '').toLowerCase().includes(q) ||
          (ci.specification || '').toLowerCase().includes(q) ||
          (ci.brand && ci.brand.toLowerCase().includes(q))
        )
      })
      .map((ci) => ({
        id: ci.variantId || ci.id,
        name: ci.materialName || 'Custom Material',
        category: ci.category || 'General',
        categoryId: 'CUSTOM',
        aliases: ['custom', (ci.materialName || '').toLowerCase()],
        specificationFields: [
          { key: 'specification', label: 'Specification', options: [ci.specification || 'Standard'] },
        ],
        defaultUnit: ci.defaultUnit || 'Nos',
        allowedUnits: ci.allowedUnits && ci.allowedUnits.length > 0 ? ci.allowedUnits : [ci.defaultUnit || 'Nos'],
        isDecimalAllowed: Boolean(ci.isDecimalAllowed),
        packSize: ci.packSize,
        conversionNote: ci.conversionNote,
        approvedBrands: ci.brand ? [ci.brand] : undefined,
      }))

    return [...customVariants, ...masterResults]
  }, [searchQuery, selectedCategory, customCatalogueItems])

  // When a material is picked from the catalogue
  const handleSelectMaterial = (mat: MaterialVariant) => {
    setSelectedMaterial(mat)
    // Initialize default specs with first available option
    const initSpecs: Record<string, string> = {}
    mat.specificationFields.forEach((field) => {
      initSpecs[field.key] = field.options[0] || ''
    })
    setSelectedSpecs(initSpecs)
    // Auto-select unit
    setSelectedUnit(mat.defaultUnit)
    // Reset brand
    setSelectedBrand(mat.approvedBrands && mat.approvedBrands.length > 0 ? mat.approvedBrands[0] : 'Any Approved Brand')
    setCustomBrand('')
    setQuantity('')
    setItemNotes('')
    setError('')
  }

  // Add configured item to Indent Cart
  const handleAddToCart = () => {
    if (!selectedMaterial) return

    const numQty = Number(quantity)
    if (!quantity || isNaN(numQty) || numQty <= 0) {
      setError('Please enter a valid positive quantity.')
      return
    }

    if (!selectedMaterial.isDecimalAllowed && !Number.isInteger(numQty)) {
      setError(`Quantity for ${selectedMaterial.name} must be a whole number in ${selectedUnit} (e.g. 5, 50, 100).`)
      return
    }

    // Build specification string summary (e.g. "Fe500D • 12 mm")
    const specSummary = Object.entries(selectedSpecs)
      .map(([key, val]) => val)
      .filter(Boolean)
      .join(' • ')

    const finalBrand = selectedBrand === 'Other / Custom Brand' ? customBrand.trim() : selectedBrand

    const newItem: MaterialRequestItemInput = {
      materialName: selectedMaterial.name,
      variantId: `${selectedMaterial.id}--${Object.values(selectedSpecs).join('-').toLowerCase().replace(/[^a-z0-9]/g, '-')}`,
      specification: specSummary || undefined,
      brand: finalBrand && finalBrand !== 'Any Approved Brand' ? finalBrand : undefined,
      quantity: numQty,
      unit: selectedUnit,
      notes: itemNotes.trim() || undefined,
    }

    setCartItems((prev) => [...prev, newItem])
    // Clear current selection to allow adding another material
    setSelectedMaterial(null)
    setQuantity('')
    setError('')
  }

  // Remove item from cart
  const handleRemoveFromCart = (index: number) => {
    setCartItems((prev) => prev.filter((_, i) => i !== index))
  }

  // Add custom unlisted item
  const handleAddCustomMaterial = async () => {
    if (!customMatName.trim()) {
      setError('Custom material name is required.')
      return
    }
    const numQty = Number(customMatQty)
    if (!customMatQty || isNaN(numQty) || numQty <= 0) {
      setError('Please specify a valid quantity for custom item.')
      return
    }

    const newItem: MaterialRequestItemInput = {
      materialName: customMatName.trim(),
      specification: customMatSpec.trim() || undefined,
      brand: customMatBrand.trim() || undefined,
      quantity: numQty,
      unit: customMatUnit.trim() || 'Nos',
    }

    setCartItems((prev) => [...prev, newItem])

    // Optionally persist in CompanyCatalogueItem
    if (saveToCompanyCatalogue) {
      try {
        await addCompanyCatalogueItemAction({
          category: customMatCategory,
          materialName: customMatName.trim(),
          specification: customMatSpec.trim() || 'Standard Site Requirement',
          brand: customMatBrand.trim() || undefined,
          defaultUnit: customMatUnit.trim() || 'Nos',
          allowedUnits: customMatUnit.trim() || 'Nos',
          isDecimalAllowed: true,
        })
      } catch (e) {
        console.error('Failed to save to company catalogue:', e)
      }
    }

    setShowCustomModal(false)
    setCustomMatName('')
    setCustomMatSpec('')
    setCustomMatBrand('')
    setCustomMatQty('')
    setError('')
  }

  // Submit full requisition indent
  const handleSubmitRequisition = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')

    const selectedSiteId = siteId || sites[0]?.id
    if (!selectedSiteId) {
      setError('Please select a project site.')
      return
    }

    // Determine items to submit
    let itemsToSubmit = [...cartItems]

    // If user has configured an item in the form but didn't click "Add to List", include it
    if (selectedMaterial && quantity && Number(quantity) > 0) {
      const numQty = Number(quantity)
      if (!selectedMaterial.isDecimalAllowed && !Number.isInteger(numQty)) {
        setError(`Quantity for ${selectedMaterial.name} must be a whole number.`)
        return
      }

      const specSummary = Object.entries(selectedSpecs)
        .map(([_, val]) => val)
        .filter(Boolean)
        .join(' • ')

      const finalBrand = selectedBrand === 'Other / Custom Brand' ? customBrand.trim() : selectedBrand

      itemsToSubmit.push({
        materialName: selectedMaterial.name,
        variantId: `${selectedMaterial.id}--${Object.values(selectedSpecs).join('-').toLowerCase().replace(/[^a-z0-9]/g, '-')}`,
        specification: specSummary || undefined,
        brand: finalBrand && finalBrand !== 'Any Approved Brand' ? finalBrand : undefined,
        quantity: numQty,
        unit: selectedUnit,
        notes: itemNotes.trim() || undefined,
      })
    }

    if (itemsToSubmit.length === 0) {
      setError('Please select at least one material and quantity before submitting.')
      return
    }

    setLoading(true)
    try {
      const res = await createMaterialRequestAction({
        siteId: selectedSiteId,
        workLocation: workLocation.trim() || undefined,
        urgency,
        neededBy: neededBy || undefined,
        notes: generalNotes.trim() || undefined,
        items: itemsToSubmit,
      })

      if (res?.success) {
        setSuccess(true)
        setTimeout(() => {
          router.push(`/mobile/home?siteId=${selectedSiteId}`)
          router.refresh()
        }, 1200)
      }
    } catch (err: unknown) {
      setError((err as Error)?.message || 'Failed to submit material request.')
      setLoading(false)
    }
  }

  if (success) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-6 text-center">
        <div className="w-16 h-16 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center mb-4 animate-in zoom-in-75">
          <CheckCircle2 size={36} strokeWidth={2.5} />
        </div>
        <h2 className="text-xl font-black text-slate-900 mb-1">Material Indent Submitted!</h2>
        <p className="text-sm text-slate-500 max-w-xs mb-6">
          Your specification-approved requisition has been forwarded to Company Admin for review.
        </p>
        <div className="flex items-center gap-2 text-xs font-bold text-[#fc6e20]">
          <Loader2 size={16} className="animate-spin" />
          <span>Redirecting to site overview...</span>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-slate-50 pb-28 select-none">
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
            <h1 className="text-[17px] font-black text-slate-900 m-0 tracking-tight">Request Materials</h1>
            <p className="text-[11px] font-semibold text-slate-400 m-0">Standard Material Catalogue</p>
          </div>
        </div>

        {/* Cart Item Counter Badge */}
        <div className="flex items-center gap-2">
          {cartItems.length > 0 && (
            <span className="px-2.5 py-1 rounded-full bg-[#fc6e20] text-white text-[11px] font-extrabold flex items-center gap-1 shadow-sm animate-in zoom-in">
              <Package size={13} />
              <span>{cartItems.length} in indent</span>
            </span>
          )}
        </div>
      </header>

      <form onSubmit={handleSubmitRequisition} className="p-4 space-y-4 max-w-[500px] mx-auto">
        {error && (
          <div className="p-3.5 bg-rose-50 border border-rose-200 rounded-2xl flex items-center gap-2.5 text-rose-700 text-xs font-bold animate-in fade-in">
            <AlertCircle size={18} className="flex-shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* ================= STEP 1: SITE & WORK LOCATION ================= */}
        <div className="bg-white p-4 rounded-2xl border border-slate-100 shadow-xs space-y-3">
          <div className="flex items-center justify-between">
            <label className="text-[11.5px] font-extrabold uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
              <Building2 size={14} className="text-[#fc6e20]" />
              <span>Project Site</span>
            </label>
          </div>

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

          {/* Work Location on Site */}
          <div className="space-y-1.5 pt-1">
            <div className="flex justify-between items-center">
              <label className="text-[11.5px] font-extrabold uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
                <MapPin size={14} className="text-amber-500" />
                <span>Work Location on Site *</span>
              </label>
              <span className="text-[10px] font-bold text-slate-400">e.g. First floor masonry</span>
            </div>

            <input
              type="text"
              value={workLocation}
              onChange={(e) => setWorkLocation(e.target.value)}
              placeholder="e.g. Ground Floor Slab, Block A Basement"
              required
              className="w-full h-11 px-3.5 rounded-xl border border-slate-200 text-sm font-bold text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-[#fc6e20] focus:ring-2 focus:ring-[#fc6e20]/15"
            />

            {/* Quick Suggestion Chips */}
            <div className="flex flex-wrap gap-1.5 pt-1">
              {WORK_LOCATION_SUGGESTIONS.slice(0, 6).map((loc) => (
                <button
                  type="button"
                  key={loc}
                  onClick={() => setWorkLocation(loc)}
                  className={`px-2.5 py-1 rounded-lg text-[10.5px] font-bold transition-all border ${
                    workLocation === loc
                      ? 'bg-[#fc6e20] text-white border-[#fc6e20]'
                      : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'
                  }`}
                >
                  {loc}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* ================= STEP 2: MATERIAL CATALOGUE EXPLORER ================= */}
        <div className="bg-white p-4 rounded-2xl border border-slate-100 shadow-xs space-y-3">
          <div className="flex items-center justify-between">
            <label className="text-[11.5px] font-extrabold uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
              <Layers size={14} className="text-sky-500" />
              <span>Material Catalogue Search</span>
            </label>
            <button
              type="button"
              onClick={() => setShowCustomModal(true)}
              className="text-[11px] font-extrabold text-[#fc6e20] hover:text-[#e85b0d] flex items-center gap-1 cursor-pointer bg-orange-50 px-2 py-1 rounded-lg border border-orange-100"
            >
              <Plus size={13} />
              <span>Request Unlisted Item</span>
            </button>
          </div>

          {/* Search bar */}
          <div className="relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search material, brand, or local name (jalli, kambi, blue metal, msand)..."
              className="w-full h-11 pl-9 pr-3 rounded-xl border border-slate-200 text-xs font-bold text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-[#fc6e20] focus:ring-2 focus:ring-[#fc6e20]/15"
            />
          </div>

          {/* Category Filter Chips */}
          <div className="flex gap-1.5 overflow-x-auto pb-1 no-scrollbar text-xs">
            <button
              type="button"
              onClick={() => setSelectedCategory('ALL')}
              className={`px-3 py-1.5 rounded-xl text-[11px] font-extrabold whitespace-nowrap transition-all border ${
                selectedCategory === 'ALL'
                  ? 'bg-slate-900 text-white border-slate-900 shadow-xs'
                  : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'
              }`}
            >
              All Categories
            </button>
            {MATERIAL_CATALOGUE.map((cat) => (
              <button
                type="button"
                key={cat.id}
                onClick={() => setSelectedCategory(cat.id)}
                className={`px-3 py-1.5 rounded-xl text-[11px] font-extrabold whitespace-nowrap transition-all border ${
                  selectedCategory === cat.id
                    ? 'bg-[#fc6e20] text-white border-[#fc6e20] shadow-xs'
                    : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'
                }`}
              >
                {cat.name.split('.')[1]?.trim() || cat.name}
              </button>
            ))}
          </div>

          {/* Materials List Carousel / Grid */}
          <div className="max-h-[260px] overflow-y-auto space-y-1.5 pr-1 divide-y divide-slate-100">
            {filteredMaterials.slice(0, 25).map((mat) => {
              const isSelected = selectedMaterial?.id === mat.id
              return (
                <div
                  key={mat.id}
                  onClick={() => handleSelectMaterial(mat)}
                  className={`p-2.5 rounded-xl cursor-pointer transition-all flex items-center justify-between gap-3 ${
                    isSelected
                      ? 'bg-orange-50 border border-[#fc6e20]/40 text-[#ea580c]'
                      : 'hover:bg-slate-50 border border-transparent text-slate-800'
                  }`}
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-[13px] font-black truncate">{mat.name}</span>
                      {isSelected && (
                        <span className="w-4 h-4 rounded-full bg-[#fc6e20] text-white flex items-center justify-center">
                          <Check size={10} strokeWidth={3} />
                        </span>
                      )}
                    </div>
                    <div className="text-[11px] text-slate-400 font-medium flex items-center gap-1.5 mt-0.5 truncate">
                      <span>{mat.category}</span>
                      {mat.aliases.length > 0 && (
                        <>
                          <span>•</span>
                          <span className="italic">{mat.aliases.slice(0, 2).join(', ')}</span>
                        </>
                      )}
                    </div>
                  </div>

                  <div className="text-right flex-shrink-0">
                    <span className="px-2 py-0.5 rounded-md bg-slate-100 text-slate-700 text-[10.5px] font-extrabold">
                      Unit: {mat.defaultUnit}
                    </span>
                  </div>
                </div>
              )
            })}

            {filteredMaterials.length === 0 && (
              <div className="text-center py-6 text-slate-400 space-y-2">
                <p className="text-xs font-bold">No catalogue items matching &ldquo;{searchQuery}&rdquo;</p>
                <button
                  type="button"
                  onClick={() => {
                    setCustomMatName(searchQuery)
                    setShowCustomModal(true)
                  }}
                  className="px-3 py-1.5 rounded-xl bg-orange-50 text-[#fc6e20] text-xs font-bold border border-orange-200"
                >
                  + Add &ldquo;{searchQuery}&rdquo; as Custom Material
                </button>
              </div>
            )}
          </div>
        </div>

        {/* ================= STEP 3: CONFIGURE SELECTED MATERIAL ================= */}
        {selectedMaterial && (
          <div className="bg-white p-4 rounded-2xl border-2 border-[#fc6e20]/30 shadow-md space-y-4 animate-in fade-in-50">
            <div className="flex items-start justify-between">
              <div>
                <span className="text-[10px] font-black uppercase tracking-wider text-[#fc6e20] bg-orange-50 px-2 py-0.5 rounded-full border border-orange-200">
                  Configuring Specification
                </span>
                <h3 className="text-base font-black text-slate-900 mt-1 m-0">
                  {selectedMaterial.name}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setSelectedMaterial(null)}
                className="text-slate-400 hover:text-slate-600 p-1"
              >
                <X size={18} />
              </button>
            </div>

            {/* Dynamic Specification Dropdowns */}
            {selectedMaterial.specificationFields.map((field) => (
              <div key={field.key} className="space-y-1.5">
                <label className="text-[11.5px] font-extrabold uppercase tracking-wider text-slate-600">
                  {field.label} *
                </label>
                <select
                  value={selectedSpecs[field.key] || ''}
                  onChange={(e) =>
                    setSelectedSpecs((prev) => ({
                      ...prev,
                      [field.key]: e.target.value,
                    }))
                  }
                  className="w-full h-11 px-3 rounded-xl border border-slate-200 text-xs font-extrabold text-slate-900 bg-slate-50 focus:bg-white focus:outline-none focus:border-[#fc6e20]"
                >
                  {field.options.map((opt) => (
                    <option key={opt} value={opt}>
                      {opt}
                    </option>
                  ))}
                </select>
              </div>
            ))}

            {/* Approved Brand Selection */}
            {selectedMaterial.approvedBrands && selectedMaterial.approvedBrands.length > 0 && (
              <div className="space-y-1.5">
                <label className="text-[11.5px] font-extrabold uppercase tracking-wider text-slate-600">
                  Approved Brand / Product
                </label>
                <select
                  value={selectedBrand}
                  onChange={(e) => setSelectedBrand(e.target.value)}
                  className="w-full h-11 px-3 rounded-xl border border-slate-200 text-xs font-bold text-slate-900 bg-slate-50 focus:bg-white focus:outline-none focus:border-[#fc6e20]"
                >
                  <option value="Any Approved Brand">Any Standard Approved Brand</option>
                  {selectedMaterial.approvedBrands.map((b) => (
                    <option key={b} value={b}>
                      {b}
                    </option>
                  ))}
                  <option value="Other / Custom Brand">Other / Custom Brand</option>
                </select>

                {selectedBrand === 'Other / Custom Brand' && (
                  <input
                    type="text"
                    value={customBrand}
                    onChange={(e) => setCustomBrand(e.target.value)}
                    placeholder="Type custom manufacturer brand..."
                    className="w-full h-10 px-3 rounded-xl border border-slate-200 text-xs font-bold text-slate-900 mt-1 focus:outline-none focus:border-[#fc6e20]"
                  />
                )}
              </div>
            )}

            {/* Predefined Quantity Unit & Input */}
            <div className="grid grid-cols-2 gap-3 pt-1">
              <div className="space-y-1.5">
                <div className="flex justify-between items-center">
                  <label className="text-[11.5px] font-extrabold uppercase tracking-wider text-slate-600">
                    Quantity *
                  </label>
                  <span className="text-[10px] font-bold text-slate-400">
                    {selectedMaterial.isDecimalAllowed ? 'Decimals ok' : 'Whole number'}
                  </span>
                </div>
                <input
                  type="number"
                  min={selectedMaterial.isDecimalAllowed ? '0.01' : '1'}
                  step={selectedMaterial.isDecimalAllowed ? '0.01' : '1'}
                  value={quantity}
                  onChange={(e) => setQuantity(e.target.value)}
                  placeholder={selectedMaterial.isDecimalAllowed ? 'e.g. 10.5' : 'e.g. 50'}
                  className="w-full h-12 px-3.5 rounded-xl border-2 border-slate-200 text-sm font-black text-slate-900 focus:outline-none focus:border-[#fc6e20] focus:ring-2 focus:ring-[#fc6e20]/15"
                />
              </div>

              {/* Automatic Predefined Unit Display */}
              <div className="space-y-1.5">
                <label className="text-[11.5px] font-extrabold uppercase tracking-wider text-slate-600">
                  Predefined Unit
                </label>
                {selectedMaterial.allowedUnits.length > 1 ? (
                  <select
                    value={selectedUnit}
                    onChange={(e) => setSelectedUnit(e.target.value)}
                    className="w-full h-12 px-3 rounded-xl border-2 border-slate-200 text-xs font-black text-slate-900 bg-slate-50 focus:bg-white focus:outline-none focus:border-[#fc6e20]"
                  >
                    {selectedMaterial.allowedUnits.map((u) => (
                      <option key={u} value={u}>
                        {u}
                      </option>
                    ))}
                  </select>
                ) : (
                  <div className="w-full h-12 px-3 rounded-xl border-2 border-slate-200 bg-slate-50 flex items-center justify-between text-xs font-black text-slate-900">
                    <span>{selectedUnit || selectedMaterial.defaultUnit}</span>
                    <span className="text-[10px] font-bold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-md border border-emerald-200">
                      Auto-locked
                    </span>
                  </div>
                )}
              </div>
            </div>

            {/* Pack Size & Standard Conversion Note */}
            {(selectedMaterial.packSize || selectedMaterial.conversionNote) && (
              <div className="p-2.5 rounded-xl bg-amber-50/70 border border-amber-200/60 flex items-start gap-2 text-amber-900 text-[11px] font-semibold leading-relaxed">
                <Info size={15} className="flex-shrink-0 text-amber-600 mt-0.5" />
                <div>
                  {selectedMaterial.packSize && (
                    <div className="font-bold">Standard Pack: {selectedMaterial.packSize}</div>
                  )}
                  {selectedMaterial.conversionNote && <div>{selectedMaterial.conversionNote}</div>}
                </div>
              </div>
            )}

            {/* Item Specific Note */}
            <div className="space-y-1">
              <label className="text-[11px] font-bold text-slate-500">
                Item Note / Delivery Instruction (Optional)
              </label>
              <input
                type="text"
                value={itemNotes}
                onChange={(e) => setItemNotes(e.target.value)}
                placeholder="e.g. Cut to 6m lengths; Deliver to yard"
                className="w-full h-9 px-3 rounded-xl border border-slate-200 text-xs font-medium text-slate-800 focus:outline-none focus:border-[#fc6e20]"
              />
            </div>

            {/* Add to Indent Button */}
            <button
              type="button"
              onClick={handleAddToCart}
              className="w-full h-11 rounded-xl bg-slate-900 hover:bg-black text-white text-xs font-black flex items-center justify-center gap-2 active:scale-98 transition-all cursor-pointer"
            >
              <Plus size={16} />
              <span>Add to Indent List</span>
            </button>
          </div>
        )}

        {/* ================= STEP 4: MULTI-ITEM INDENT CART ================= */}
        {cartItems.length > 0 && (
          <div className="bg-white p-4 rounded-2xl border border-slate-100 shadow-xs space-y-3">
            <div className="flex items-center justify-between">
              <label className="text-[12px] font-black uppercase tracking-wider text-slate-800 flex items-center gap-1.5">
                <Package size={15} className="text-[#fc6e20]" />
                <span>Materials in This Indent ({cartItems.length})</span>
              </label>
              <span className="text-[11px] font-bold text-slate-400">Requisition Items</span>
            </div>

            <div className="divide-y divide-slate-100">
              {cartItems.map((item, index) => (
                <div key={index} className="py-2.5 flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-[13px] font-black text-slate-900 truncate">
                      {item.materialName}
                    </div>
                    {item.specification && (
                      <div className="text-[11px] font-bold text-slate-500 mt-0.5 truncate">
                        {item.specification}
                      </div>
                    )}
                    {item.brand && (
                      <div className="text-[10.5px] font-semibold text-sky-600 flex items-center gap-1 mt-0.5">
                        <Tag size={10} />
                        <span>Brand: {item.brand}</span>
                      </div>
                    )}
                  </div>

                  <div className="flex items-center gap-3 flex-shrink-0">
                    <div className="text-right">
                      <div className="text-[13.5px] font-black text-[#ea580c]">
                        {item.quantity} {item.unit}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleRemoveFromCart(index)}
                      className="w-8 h-8 rounded-lg bg-rose-50 text-rose-600 hover:bg-rose-100 flex items-center justify-center cursor-pointer transition-colors"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ================= STEP 5: URGENCY, NEEDED BY & GENERAL NOTES ================= */}
        <div className="bg-white p-4 rounded-2xl border border-slate-100 shadow-xs space-y-3">
          {/* Urgency */}
          <div className="space-y-1.5">
            <label className="text-[11.5px] font-extrabold uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
              <Clock size={14} />
              <span>Requisition Urgency</span>
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
                  className={`py-2 px-1.5 rounded-xl text-xs font-bold border transition-all text-center ${
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

          {/* Needed By Date */}
          <div className="space-y-1.5 pt-1">
            <label className="text-[11.5px] font-extrabold uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
              <Calendar size={14} />
              <span>Required by Date (Optional)</span>
            </label>
            <input
              type="date"
              value={neededBy}
              onChange={(e) => setNeededBy(e.target.value)}
              className="w-full h-11 px-3 rounded-xl border border-slate-200 text-xs font-bold text-slate-800 bg-slate-50 focus:bg-white focus:outline-none focus:border-[#fc6e20]"
            />
          </div>

          {/* Additional Notes */}
          <div className="space-y-1.5 pt-1">
            <label className="text-[11.5px] font-extrabold uppercase tracking-wider text-slate-500">
              General Indent Remarks / Delivery Contact
            </label>
            <textarea
              value={generalNotes}
              onChange={(e) => setGeneralNotes(e.target.value)}
              rows={2}
              placeholder="e.g. Call site engineer before dispatch. Gate 2 access only."
              className="w-full p-3 rounded-xl border border-slate-200 text-xs font-medium text-slate-800 placeholder:text-slate-400 focus:outline-none focus:border-[#fc6e20] focus:ring-2 focus:ring-[#fc6e20]/15 resize-none"
            />
          </div>
        </div>

        {/* Submit Button */}
        <button
          type="submit"
          disabled={loading || (cartItems.length === 0 && (!selectedMaterial || !quantity))}
          className="w-full h-13 rounded-2xl bg-gradient-to-r from-[#ea580c] to-[#fc6e20] text-white font-extrabold text-[15px] shadow-lg shadow-[#fc6e20]/30 active:scale-98 transition-all flex items-center justify-center gap-2 disabled:opacity-50 cursor-pointer border-none"
        >
          {loading ? (
            <>
              <Loader2 size={18} className="animate-spin" />
              <span>Submitting Material Indent...</span>
            </>
          ) : (
            <>
              <Package size={18} />
              <span>
                {cartItems.length > 0
                  ? `Submit Indent (${cartItems.length + (selectedMaterial && quantity ? 1 : 0)} items)`
                  : 'Submit Material Request'}
              </span>
            </>
          )}
        </button>
      </form>

      {/* ================= MODAL: REQUEST UNLISTED / CUSTOM MATERIAL ================= */}
      {showCustomModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-4 animate-in fade-in">
          <div className="bg-white w-full sm:max-w-md rounded-t-3xl sm:rounded-2xl p-5 space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <h3 className="text-base font-black text-slate-900 m-0">Request Custom Material</h3>
                <p className="text-[11px] text-slate-400 m-0 font-medium">Add unlisted product or size</p>
              </div>
              <button
                type="button"
                onClick={() => setShowCustomModal(false)}
                className="w-8 h-8 rounded-full bg-slate-100 text-slate-500 flex items-center justify-center"
              >
                <X size={16} />
              </button>
            </div>

            <div className="space-y-3">
              <div>
                <label className="text-[11.5px] font-extrabold uppercase tracking-wider text-slate-600">
                  Material Name *
                </label>
                <input
                  type="text"
                  value={customMatName}
                  onChange={(e) => setCustomMatName(e.target.value)}
                  placeholder="e.g. Corrugated Bitumen Sheet, 20mm Expansion Joint Board"
                  className="w-full h-11 px-3.5 rounded-xl border border-slate-200 text-xs font-bold text-slate-900 focus:outline-none focus:border-[#fc6e20]"
                />
              </div>

              <div>
                <label className="text-[11.5px] font-extrabold uppercase tracking-wider text-slate-600">
                  Category
                </label>
                <select
                  value={customMatCategory}
                  onChange={(e) => setCustomMatCategory(e.target.value)}
                  className="w-full h-11 px-3 rounded-xl border border-slate-200 text-xs font-bold text-slate-800 bg-slate-50 focus:outline-none focus:border-[#fc6e20]"
                >
                  <option value="Cement, sand, aggregates & concrete">1. Cement, sand, aggregates & concrete</option>
                  <option value="Reinforcement and structural steel">2. Reinforcement and structural steel</option>
                  <option value="Bricks and blocks">3. Bricks and blocks</option>
                  <option value="Shuttering and curing materials">4. Shuttering and curing materials</option>
                  <option value="Waterproofing and construction chemicals">5. Waterproofing and construction chemicals</option>
                  <option value="Plumbing and drainage">6. Plumbing and drainage</option>
                  <option value="Electrical materials">7. Electrical materials</option>
                  <option value="Flooring, finishes and painting">8. Flooring, finishes and painting</option>
                  <option value="Doors, windows, hardware and sanitaryware">9. Doors, windows, hardware & sanitaryware</option>
                  <option value="Site consumables & safety equipment">10. Site consumables & safety equipment</option>
                </select>
              </div>

              <div>
                <label className="text-[11.5px] font-extrabold uppercase tracking-wider text-slate-600">
                  Specification / Size / Grade
                </label>
                <input
                  type="text"
                  value={customMatSpec}
                  onChange={(e) => setCustomMatSpec(e.target.value)}
                  placeholder="e.g. 2.4m x 1.2m x 12mm thickness"
                  className="w-full h-11 px-3.5 rounded-xl border border-slate-200 text-xs font-bold text-slate-900 focus:outline-none focus:border-[#fc6e20]"
                />
              </div>

              <div>
                <label className="text-[11.5px] font-extrabold uppercase tracking-wider text-slate-600">
                  Preferred Brand (Optional)
                </label>
                <input
                  type="text"
                  value={customMatBrand}
                  onChange={(e) => setCustomMatBrand(e.target.value)}
                  placeholder="e.g. Pidilite, Supreme, Tata"
                  className="w-full h-11 px-3.5 rounded-xl border border-slate-200 text-xs font-bold text-slate-900 focus:outline-none focus:border-[#fc6e20]"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[11.5px] font-extrabold uppercase tracking-wider text-slate-600">
                    Quantity *
                  </label>
                  <input
                    type="number"
                    min="0.1"
                    step="any"
                    value={customMatQty}
                    onChange={(e) => setCustomMatQty(e.target.value)}
                    placeholder="e.g. 20"
                    className="w-full h-11 px-3.5 rounded-xl border border-slate-200 text-xs font-bold text-slate-900 focus:outline-none focus:border-[#fc6e20]"
                  />
                </div>
                <div>
                  <label className="text-[11.5px] font-extrabold uppercase tracking-wider text-slate-600">
                    Unit *
                  </label>
                  <select
                    value={customMatUnit}
                    onChange={(e) => setCustomMatUnit(e.target.value)}
                    className="w-full h-11 px-3 rounded-xl border border-slate-200 text-xs font-bold text-slate-800 bg-slate-50 focus:outline-none focus:border-[#fc6e20]"
                  >
                    <option value="Nos">Nos</option>
                    <option value="Bags">Bags</option>
                    <option value="kg">kg</option>
                    <option value="Tonne">Tonne</option>
                    <option value="cft">cft</option>
                    <option value="m³">m³</option>
                    <option value="m²">m²</option>
                    <option value="m">m</option>
                    <option value="Roll">Roll</option>
                    <option value="Sheet">Sheet</option>
                    <option value="L">L</option>
                    <option value="Box">Box</option>
                  </select>
                </div>
              </div>

              {/* Checkbox: Save to Company Catalogue */}
              <label className="flex items-center gap-2.5 p-3 rounded-xl bg-slate-50 border border-slate-200 cursor-pointer">
                <input
                  type="checkbox"
                  checked={saveToCompanyCatalogue}
                  onChange={(e) => setSaveToCompanyCatalogue(e.target.checked)}
                  className="rounded text-[#fc6e20] focus:ring-[#fc6e20]"
                />
                <div className="text-[11.5px] font-bold text-slate-700">
                  Add this material to company catalogue for future site indents
                </div>
              </label>
            </div>

            <div className="flex gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowCustomModal(false)}
                className="flex-1 h-11 rounded-xl bg-slate-100 text-slate-700 text-xs font-bold"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleAddCustomMaterial}
                className="flex-1 h-11 rounded-xl bg-[#fc6e20] text-white text-xs font-black shadow-md shadow-[#fc6e20]/25"
              >
                Add to Indent
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
