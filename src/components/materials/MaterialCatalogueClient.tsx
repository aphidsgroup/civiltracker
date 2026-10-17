'use client'

import React, { useState, useMemo, useTransition } from 'react'
import {
  Package,
  Search,
  Plus,
  Layers,
  Tag,
  Building2,
  CheckCircle2,
  AlertCircle,
  Loader2,
  ExternalLink,
  ChevronRight,
  Info,
  X,
  Sparkles,
} from 'lucide-react'
import { MATERIAL_CATALOGUE, MaterialVariant, MaterialCategory } from '@/lib/material-catalogue'
import { addCompanyCatalogueItemAction } from '@/actions/requests'
import Link from 'next/link'

interface CompanyCustomItem {
  id: string
  category: string
  materialName: string
  specification: string
  brand?: string | null
  defaultUnit: string
  allowedUnits?: string | null
  isDecimalAllowed: boolean
  packSize?: string | null
  notes?: string | null
  createdAt: Date
}

export default function MaterialCatalogueClient({
  customItems = [],
  companyName,
}: {
  customItems: CompanyCustomItem[]
  companyName: string
}) {
  const [selectedCategory, setSelectedCategory] = useState<string>('ALL')
  const [searchQuery, setSearchQuery] = useState('')
  const [showAddModal, setShowAddModal] = useState(false)
  const [isPending, startTransition] = useTransition()

  // New item modal form state
  const [formCategory, setFormCategory] = useState('1. Cement, sand, aggregates & concrete')
  const [formMaterialName, setFormMaterialName] = useState('')
  const [formSpecification, setFormSpecification] = useState('')
  const [formBrand, setFormBrand] = useState('')
  const [formUnit, setFormUnit] = useState('Bags')
  const [formPackSize, setFormPackSize] = useState('')
  const [formNotes, setFormNotes] = useState('')
  const [formError, setFormError] = useState('')
  const [formSuccess, setFormSuccess] = useState(false)

  // Filtered master materials
  const filteredMaster = useMemo(() => {
    const q = searchQuery.toLowerCase().trim()
    const results: Array<{ catName: string; catId: string; material: MaterialVariant }> = []

    for (const cat of MATERIAL_CATALOGUE) {
      if (selectedCategory !== 'ALL' && cat.id !== selectedCategory) continue

      for (const mat of cat.materials) {
        if (!q) {
          results.push({ catName: cat.name, catId: cat.id, material: mat })
          continue
        }

        const matchName = mat.name.toLowerCase().includes(q)
        const matchCat = mat.category.toLowerCase().includes(q)
        const matchAlias = mat.aliases.some((a) => a.includes(q))
        const matchSpecs = mat.specificationFields.some((f) =>
          f.options.some((o) => o.toLowerCase().includes(q))
        )
        const matchBrands = mat.approvedBrands?.some((b) => b.toLowerCase().includes(q))

        if (matchName || matchCat || matchAlias || matchSpecs || matchBrands) {
          results.push({ catName: cat.name, catId: cat.id, material: mat })
        }
      }
    }
    return results
  }, [searchQuery, selectedCategory])

  // Filtered company custom items
  const filteredCustom = useMemo(() => {
    const q = searchQuery.toLowerCase().trim()
    return customItems.filter((ci) => {
      if (selectedCategory !== 'ALL') {
        const cat = MATERIAL_CATALOGUE.find((c) => c.id === selectedCategory)
        if (cat && !ci.category.toLowerCase().includes(cat.name.toLowerCase().split('.')[1]?.trim().toLowerCase() || '')) {
          return false
        }
      }
      if (!q) return true
      return (
        ci.materialName.toLowerCase().includes(q) ||
        ci.specification.toLowerCase().includes(q) ||
        (ci.brand && ci.brand.toLowerCase().includes(q))
      )
    })
  }, [searchQuery, selectedCategory, customItems])

  const handleSaveCustomItem = (e: React.FormEvent) => {
    e.preventDefault()
    setFormError('')

    if (!formMaterialName.trim()) {
      setFormError('Material name is required.')
      return
    }
    if (!formSpecification.trim()) {
      setFormError('Specification / Grade is required.')
      return
    }

    startTransition(async () => {
      try {
        await addCompanyCatalogueItemAction({
          category: formCategory,
          materialName: formMaterialName.trim(),
          specification: formSpecification.trim(),
          brand: formBrand.trim() || undefined,
          defaultUnit: formUnit.trim(),
          allowedUnits: formUnit.trim(),
          isDecimalAllowed: !['Bags', 'Nos', 'Sheets', 'Boxes'].includes(formUnit),
          packSize: formPackSize.trim() || undefined,
          notes: formNotes.trim() || undefined,
        })
        setFormSuccess(true)
        setTimeout(() => {
          setFormSuccess(false)
          setShowAddModal(false)
          setFormMaterialName('')
          setFormSpecification('')
          setFormBrand('')
          setFormPackSize('')
          setFormNotes('')
        }, 900)
      } catch (err: unknown) {
        setFormError((err as Error)?.message || 'Failed to save catalogue item.')
      }
    })
  }

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      {/* Top Banner & Actions */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-white p-6 rounded-3xl border border-slate-200 shadow-xs">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="px-2.5 py-0.5 rounded-full bg-orange-50 text-[#fc6e20] text-[11px] font-black uppercase tracking-wider border border-orange-100">
              Standard Catalogue
            </span>
            <span className="text-xs font-bold text-slate-400">· {companyName}</span>
          </div>
          <h1 className="text-2xl font-black text-slate-900 tracking-tight">Material Specification Catalogue</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            Standard 10-domain construction catalogue with selectable variants, auto-units, and approved brands
          </p>
        </div>

        <div className="flex items-center gap-2.5 flex-wrap">
          <button
            type="button"
            onClick={() => setShowAddModal(true)}
            className="px-4 py-2.5 bg-gradient-to-r from-[#ea580c] to-[#fc6e20] hover:brightness-105 text-white font-extrabold text-xs rounded-xl shadow-md shadow-[#fc6e20]/20 flex items-center gap-2 active:scale-95 transition-all cursor-pointer border-none"
          >
            <Plus size={16} />
            <span>Add Approved Product / Size</span>
          </button>
          <Link
            href="/materials/requests"
            className="px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-extrabold text-xs rounded-xl no-underline transition-all"
          >
            Site Purchase Requests
          </Link>
        </div>
      </div>

      {/* Search & Categories Bar */}
      <div className="bg-white p-5 rounded-3xl border border-slate-200 shadow-xs space-y-4">
        {/* Search Input */}
        <div className="relative">
          <Search className="w-4 h-4 text-slate-400 absolute left-4 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search material, brand, or local keyword (e.g. Fe500D, 12mm TMT, OPC 53, blue metal, jalli, M-sand, Astral)..."
            className="w-full h-12 pl-11 pr-4 rounded-2xl border border-slate-200 text-sm font-bold text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-[#fc6e20] focus:ring-2 focus:ring-[#fc6e20]/15"
          />
        </div>

        {/* Category Filter Chips */}
        <div className="flex gap-2 overflow-x-auto pb-1 no-scrollbar">
          <button
            type="button"
            onClick={() => setSelectedCategory('ALL')}
            className={`px-3.5 py-2 rounded-xl text-xs font-black whitespace-nowrap transition-all border ${
              selectedCategory === 'ALL'
                ? 'bg-slate-900 text-white border-slate-900 shadow-xs'
                : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
            }`}
          >
            All Categories ({filteredMaster.length + filteredCustom.length})
          </button>
          {MATERIAL_CATALOGUE.map((cat) => {
            const count = cat.materials.length
            return (
              <button
                type="button"
                key={cat.id}
                onClick={() => setSelectedCategory(cat.id)}
                className={`px-3.5 py-2 rounded-xl text-xs font-bold whitespace-nowrap transition-all border ${
                  selectedCategory === cat.id
                    ? 'bg-[#fc6e20] text-white border-[#fc6e20] shadow-xs'
                    : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                }`}
              >
                <span>{cat.name.split('.')[1]?.trim() || cat.name}</span>
                <span className="ml-1.5 opacity-70 text-[11px]">({count})</span>
              </button>
            )
          })}
        </div>
      </div>

      {/* Company Custom Approved Materials Section */}
      {filteredCustom.length > 0 && (
        <div className="bg-white rounded-3xl border border-orange-200 shadow-xs p-5 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-[#fc6e20]" />
              <h2 className="text-sm font-black text-slate-900 m-0">
                Company Approved Custom Products & Sizes ({filteredCustom.length})
              </h2>
            </div>
            <span className="text-xs font-bold text-orange-600 bg-orange-50 px-2.5 py-1 rounded-lg border border-orange-100">
              Custom Catalogue
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3.5">
            {filteredCustom.map((item) => (
              <div
                key={item.id}
                className="p-4 rounded-2xl bg-orange-50/40 border border-orange-200/80 space-y-2 hover:border-[#fc6e20] transition-colors"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <span className="text-[10px] font-black uppercase tracking-wider text-orange-700">
                      {item.category}
                    </span>
                    <h3 className="text-sm font-black text-slate-900 m-0 truncate">
                      {item.materialName}
                    </h3>
                  </div>
                  <span className="px-2.5 py-0.5 rounded-md bg-white text-slate-800 text-xs font-black border border-slate-200 flex-shrink-0">
                    {item.defaultUnit}
                  </span>
                </div>

                <div className="text-xs font-semibold text-slate-700 bg-white/80 p-2 rounded-xl border border-orange-100">
                  <span className="text-slate-400 font-bold">Spec:</span> {item.specification}
                </div>

                {item.brand && (
                  <div className="flex items-center gap-1.5 text-[11px] font-bold text-sky-700">
                    <Tag size={12} />
                    <span>Brand: {item.brand}</span>
                  </div>
                )}

                {item.packSize && (
                  <div className="text-[11px] text-slate-500 font-medium">
                    Pack: {item.packSize}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Master Catalogue Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {filteredMaster.map(({ catName, material }) => (
          <div
            key={material.id}
            className="bg-white rounded-3xl border border-slate-200 p-5 shadow-xs flex flex-col justify-between hover:shadow-md hover:border-slate-300 transition-all space-y-4"
          >
            <div className="space-y-3">
              {/* Category & Name */}
              <div>
                <span className="text-[10.5px] font-black uppercase tracking-wider text-slate-400 block mb-0.5">
                  {catName}
                </span>
                <div className="flex items-start justify-between gap-2">
                  <h3 className="text-base font-black text-slate-900 m-0">{material.name}</h3>
                  <span className="px-2.5 py-0.5 rounded-lg bg-emerald-50 text-emerald-800 text-xs font-black border border-emerald-200 flex-shrink-0">
                    Unit: {material.defaultUnit}
                  </span>
                </div>
              </div>

              {/* Specifications options */}
              <div className="space-y-1.5 pt-1">
                <span className="text-[11px] font-black uppercase tracking-wider text-slate-500 block">
                  Selectable Specifications:
                </span>
                {material.specificationFields.map((field) => (
                  <div
                    key={field.key}
                    className="p-2 rounded-xl bg-slate-50 border border-slate-100 text-xs space-y-1"
                  >
                    <div className="font-extrabold text-slate-600 text-[11px]">{field.label}:</div>
                    <div className="flex flex-wrap gap-1">
                      {field.options.map((opt) => (
                        <span
                          key={opt}
                          className="px-2 py-0.5 rounded-md bg-white text-slate-800 font-bold text-[10.5px] border border-slate-200"
                        >
                          {opt}
                        </span>
                      ))}
                    </div>
                  </div>
                ))}
              </div>

              {/* Approved Brands */}
              {material.approvedBrands && material.approvedBrands.length > 0 && (
                <div className="space-y-1 pt-1">
                  <span className="text-[11px] font-black uppercase tracking-wider text-slate-500 block">
                    Approved Brands:
                  </span>
                  <div className="flex flex-wrap gap-1">
                    {material.approvedBrands.map((b) => (
                      <span
                        key={b}
                        className="px-2 py-0.5 rounded-md bg-sky-50 text-sky-800 font-bold text-[10.5px] border border-sky-100 flex items-center gap-1"
                      >
                        <Tag size={10} />
                        <span>{b}</span>
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Pack Size & Conversion notes */}
              {(material.packSize || material.conversionNote) && (
                <div className="p-2.5 rounded-xl bg-amber-50/70 border border-amber-200/60 text-[11px] font-semibold text-amber-900 flex items-start gap-1.5 leading-relaxed">
                  <Info size={14} className="flex-shrink-0 mt-0.5 text-amber-600" />
                  <div>
                    {material.packSize && (
                      <div className="font-bold">Standard: {material.packSize}</div>
                    )}
                    {material.conversionNote && <div>{material.conversionNote}</div>}
                  </div>
                </div>
              )}
            </div>

            {/* Allowed units footer */}
            <div className="pt-3 border-t border-slate-100 flex items-center justify-between text-xs">
              <span className="text-slate-400 font-semibold">Allowed units:</span>
              <span className="font-black text-slate-700">
                {material.allowedUnits.join(', ')}
              </span>
            </div>
          </div>
        ))}

        {filteredMaster.length === 0 && filteredCustom.length === 0 && (
          <div className="col-span-full py-16 text-center text-slate-400 space-y-2">
            <Package size={40} className="mx-auto text-slate-300" />
            <h3 className="text-sm font-bold text-slate-600 m-0">No catalogue materials found</h3>
            <p className="text-xs text-slate-400 m-0">Try searching for other terms or add a custom item.</p>
          </div>
        )}
      </div>

      {/* ================= MODAL: ADD APPROVED PRODUCT / SIZE ================= */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in">
          <div className="bg-white w-full max-w-lg rounded-3xl p-6 space-y-5 shadow-2xl border border-slate-100">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <h3 className="text-lg font-black text-slate-900 m-0">Add Approved Product / Size</h3>
                <p className="text-xs text-slate-400 m-0 font-medium">
                  Add custom specifications or sizes to {companyName} catalogue
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowAddModal(false)}
                className="w-9 h-9 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-500 flex items-center justify-center transition-colors cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>

            {formError && (
              <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs font-bold text-rose-700 flex items-center gap-2">
                <AlertCircle size={16} />
                <span>{formError}</span>
              </div>
            )}

            {formSuccess && (
              <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-xs font-bold text-emerald-700 flex items-center gap-2">
                <CheckCircle2 size={16} />
                <span>Product successfully added to company catalogue!</span>
              </div>
            )}

            <form onSubmit={handleSaveCustomItem} className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-xs font-extrabold uppercase tracking-wider text-slate-600">
                  Category *
                </label>
                <select
                  value={formCategory}
                  onChange={(e) => setFormCategory(e.target.value)}
                  className="w-full h-11 px-3.5 rounded-xl border border-slate-200 text-xs font-bold text-slate-800 bg-slate-50 focus:bg-white focus:outline-none focus:border-[#fc6e20]"
                >
                  <option value="1. Cement, sand, aggregates & concrete">1. Cement, sand, aggregates & concrete</option>
                  <option value="2. Reinforcement and structural steel">2. Reinforcement and structural steel</option>
                  <option value="3. Bricks and blocks">3. Bricks and blocks</option>
                  <option value="4. Shuttering and curing materials">4. Shuttering and curing materials</option>
                  <option value="5. Waterproofing and construction chemicals">5. Waterproofing and construction chemicals</option>
                  <option value="6. Plumbing and drainage">6. Plumbing and drainage</option>
                  <option value="7. Electrical materials">7. Electrical materials</option>
                  <option value="8. Flooring, finishes and painting">8. Flooring, finishes and painting</option>
                  <option value="9. Doors, windows, hardware & sanitaryware">9. Doors, windows, hardware & sanitaryware</option>
                  <option value="10. Site consumables & safety equipment">10. Site consumables & safety equipment</option>
                </select>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-extrabold uppercase tracking-wider text-slate-600">
                  Material Name *
                </label>
                <input
                  type="text"
                  value={formMaterialName}
                  onChange={(e) => setFormMaterialName(e.target.value)}
                  placeholder="e.g. UltraTech Super Cement, 20mm Corrugated Conduit"
                  required
                  className="w-full h-11 px-3.5 rounded-xl border border-slate-200 text-xs font-bold text-slate-900 focus:outline-none focus:border-[#fc6e20]"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-extrabold uppercase tracking-wider text-slate-600">
                  Approved Specification / Size / Grade *
                </label>
                <input
                  type="text"
                  value={formSpecification}
                  onChange={(e) => setFormSpecification(e.target.value)}
                  placeholder="e.g. 53 Grade / 50 kg bag, 16mm Dia Fe550D"
                  required
                  className="w-full h-11 px-3.5 rounded-xl border border-slate-200 text-xs font-bold text-slate-900 focus:outline-none focus:border-[#fc6e20]"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label className="text-xs font-extrabold uppercase tracking-wider text-slate-600">
                    Approved Brand
                  </label>
                  <input
                    type="text"
                    value={formBrand}
                    onChange={(e) => setFormBrand(e.target.value)}
                    placeholder="e.g. UltraTech, Tata, Supreme"
                    className="w-full h-11 px-3 rounded-xl border border-slate-200 text-xs font-bold text-slate-900 focus:outline-none focus:border-[#fc6e20]"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-extrabold uppercase tracking-wider text-slate-600">
                    Default Quantity Unit *
                  </label>
                  <select
                    value={formUnit}
                    onChange={(e) => setFormUnit(e.target.value)}
                    className="w-full h-11 px-3 rounded-xl border border-slate-200 text-xs font-black text-slate-900 bg-slate-50 focus:bg-white focus:outline-none focus:border-[#fc6e20]"
                  >
                    <option value="Bags">Bags</option>
                    <option value="kg">kg</option>
                    <option value="Tonne">Tonne</option>
                    <option value="cft">cft</option>
                    <option value="m³">m³</option>
                    <option value="Nos">Nos</option>
                    <option value="m">m</option>
                    <option value="m²">m²</option>
                    <option value="Sheet">Sheet</option>
                    <option value="Roll">Roll</option>
                    <option value="L">L</option>
                    <option value="Box">Box</option>
                  </select>
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-extrabold uppercase tracking-wider text-slate-600">
                  Pack Size / Conversion Reference (Optional)
                </label>
                <input
                  type="text"
                  value={formPackSize}
                  onChange={(e) => setFormPackSize(e.target.value)}
                  placeholder="e.g. 50 kg HDPE Bag; 20 bags = 1 Tonne"
                  className="w-full h-11 px-3.5 rounded-xl border border-slate-200 text-xs font-medium text-slate-900 focus:outline-none focus:border-[#fc6e20]"
                />
              </div>

              <div className="flex gap-2.5 pt-3">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="flex-1 h-11 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isPending}
                  className="flex-1 h-11 rounded-xl bg-gradient-to-r from-[#ea580c] to-[#fc6e20] hover:brightness-105 text-white text-xs font-black shadow-md shadow-[#fc6e20]/25 transition-all flex items-center justify-center gap-2 cursor-pointer border-none disabled:opacity-50"
                >
                  {isPending ? (
                    <>
                      <Loader2 size={16} className="animate-spin" />
                      <span>Saving...</span>
                    </>
                  ) : (
                    <>
                      <Plus size={16} />
                      <span>Add to Catalogue</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
