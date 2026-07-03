'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { ChevronRight, ChevronDown, CheckSquare, Square, Building2, Loader2 } from 'lucide-react'

type Task = { id: string; name: string; order: number }
type Category = { id: string; name: string; tasks: Task[] }
type Stage = { id: string; name: string; categories: Category[] }
type Template = { id: string; name: string; stages: Stage[] } | null

type Props = {
  template: Template
  createSiteAction: (formData: FormData) => Promise<void>
}

export function NewSiteClient({ template, createSiteAction }: Props) {
  const router = useRouter()
  const [step, setStep] = useState(1)
  const [pending, startTransition] = useTransition()

  // Step 1 fields
  const [name, setName] = useState('')
  const [location, setLocation] = useState('')
  const [address, setAddress] = useState('')
  const [projectType, setProjectType] = useState('')
  const [budget, setBudget] = useState('')
  const [startDate, setStartDate] = useState('')
  const [targetEndDate, setTargetEndDate] = useState('')

  // Step 2: track selected task IDs (all checked by default)
  const allTaskIds = template?.stages.flatMap(s =>
    s.categories.flatMap(c => c.tasks.map(t => t.id))
  ) ?? []
  const [selectedTasks, setSelectedTasks] = useState<Set<string>>(new Set(allTaskIds))
  const [expandedStages, setExpandedStages] = useState<Record<string, boolean>>(
    Object.fromEntries(template?.stages.map(s => [s.id, true]) ?? [])
  )

  const toggleTask = (taskId: string) => {
    setSelectedTasks(prev => {
      const next = new Set(prev)
      next.has(taskId) ? next.delete(taskId) : next.add(taskId)
      return next
    })
  }

  const toggleCategory = (cat: Category, checked: boolean) => {
    setSelectedTasks(prev => {
      const next = new Set(prev)
      cat.tasks.forEach(t => checked ? next.add(t.id) : next.delete(t.id))
      return next
    })
  }

  const toggleStage = (stage: Stage, checked: boolean) => {
    setSelectedTasks(prev => {
      const next = new Set(prev)
      stage.categories.forEach(c => c.tasks.forEach(t => checked ? next.add(t.id) : next.delete(t.id)))
      return next
    })
  }

  const isCategoryChecked = (cat: Category) => cat.tasks.every(t => selectedTasks.has(t.id))
  const isCategoryIndeterminate = (cat: Category) => !isCategoryChecked(cat) && cat.tasks.some(t => selectedTasks.has(t.id))
  const isStageChecked = (stage: Stage) => stage.categories.every(c => isCategoryChecked(c))
  const isStageIndeterminate = (stage: Stage) => !isStageChecked(stage) && stage.categories.some(c => isCategoryChecked(c) || isCategoryIndeterminate(c))

  const handleSubmit = () => {
    startTransition(async () => {
      const fd = new FormData()
      fd.append('name', name)
      fd.append('location', location)
      fd.append('address', address)
      fd.append('projectType', projectType)
      fd.append('budget', budget)
      fd.append('startDate', startDate)
      fd.append('targetEndDate', targetEndDate)
      fd.append('selectedTaskIds', JSON.stringify(Array.from(selectedTasks)))
      fd.append('templateId', template?.id ?? '')
      await createSiteAction(fd)
    })
  }

  const inputCls = "w-full border border-slate-300 rounded-lg px-3 py-2.5 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#fc6e20] focus:border-transparent bg-white transition-all"
  const labelCls = "block text-xs font-bold text-slate-500 uppercase tracking-wide mb-1.5"

  return (
    <div className="max-w-3xl mx-auto">
      {/* Step indicator */}
      <div className="flex items-center gap-3 mb-8">
        {[{ n: 1, label: 'Site Details' }, { n: 2, label: 'Checklist Setup' }].map((s, i) => (
          <div key={s.n} className="flex items-center gap-3">
            <div className={`flex items-center gap-2 px-4 py-2 rounded-full text-sm font-bold transition-all ${
              step === s.n ? 'bg-[#fc6e20] text-white shadow-md' :
              step > s.n ? 'bg-emerald-500 text-white' :
              'bg-slate-100 text-slate-400'
            }`}>
              <span>{step > s.n ? '✓' : s.n}</span>
              <span>{s.label}</span>
            </div>
            {i === 0 && <ChevronRight size={16} className="text-slate-300" />}
          </div>
        ))}
      </div>

      {/* Step 1: Site Details */}
      {step === 1 && (
        <div className="bg-white border border-slate-200 rounded-2xl p-7 shadow-sm">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-10 h-10 bg-orange-50 rounded-xl flex items-center justify-center">
              <Building2 size={20} className="text-[#fc6e20]" />
            </div>
            <div>
              <h2 className="font-bold text-slate-800">Site Details</h2>
              <p className="text-xs text-slate-500">Fill in the basic information for this site</p>
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <div className="md:col-span-2">
              <label className={labelCls}>Site Name *</label>
              <input value={name} onChange={e => setName(e.target.value)} required placeholder="e.g. Marina Towers Block A" className={inputCls} />
            </div>
            <div className="md:col-span-2">
              <label className={labelCls}>Location *</label>
              <input value={location} onChange={e => setLocation(e.target.value)} required placeholder="e.g. Chennai, Tamil Nadu" className={inputCls} />
            </div>
            <div className="md:col-span-2">
              <label className={labelCls}>Full Address</label>
              <input value={address} onChange={e => setAddress(e.target.value)} placeholder="Street address" className={inputCls} />
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
              <label className={labelCls}>Budget (₹)</label>
              <input value={budget} onChange={e => setBudget(e.target.value)} type="number" min="0" placeholder="5000000" className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>Start Date</label>
              <input value={startDate} onChange={e => setStartDate(e.target.value)} type="date" className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>Target End Date</label>
              <input value={targetEndDate} onChange={e => setTargetEndDate(e.target.value)} type="date" className={inputCls} />
            </div>
          </div>
          <div className="mt-7 flex items-center gap-3">
            <button
              onClick={() => { if (name && location) setStep(2) }}
              className="bg-[#fc6e20] text-white rounded-lg px-7 py-2.5 text-sm font-bold hover:bg-[#e85b0d] transition-colors shadow-sm disabled:opacity-50"
              disabled={!name || !location}
            >
              Next: Setup Checklist →
            </button>
            <Link href="/sites" className="bg-slate-100 text-slate-700 rounded-lg px-5 py-2.5 text-sm font-semibold hover:bg-slate-200 transition-colors">
              Cancel
            </Link>
          </div>
        </div>
      )}

      {/* Step 2: Checklist Customisation */}
      {step === 2 && (
        <div className="space-y-4">
          <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm">
            <div className="flex items-center justify-between mb-2">
              <div>
                <h2 className="font-bold text-slate-800 text-lg">Checklist Setup</h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  {template
                    ? `Customise the default checklist for "${name}". Uncheck categories or tasks that don't apply to this site.`
                    : 'No checklist template found. Create one from the Checklists page.'}
                </p>
              </div>
              <div className="text-right">
                <div className="text-xs font-bold text-slate-400 uppercase tracking-wide">Selected</div>
                <div className="text-xl font-black text-[#fc6e20]">{selectedTasks.size} <span className="text-sm font-semibold text-slate-400">/ {allTaskIds.length} tasks</span></div>
              </div>
            </div>

            {!template && (
              <div className="mt-4 p-4 bg-amber-50 rounded-xl border border-amber-200 text-sm text-amber-700 font-medium">
                No checklist template found. You can still create the site — go to the Checklists page to set up a template.
              </div>
            )}
          </div>

          {template?.stages.map(stage => {
            const stageChecked = isStageChecked(stage)
            const stageIndet = isStageIndeterminate(stage)
            const isOpen = expandedStages[stage.id]
            const stageTaskCount = stage.categories.flatMap(c => c.tasks).length
            const stageSelected = stage.categories.flatMap(c => c.tasks).filter(t => selectedTasks.has(t.id)).length

            return (
              <div key={stage.id} className={`bg-white rounded-2xl border shadow-sm overflow-hidden transition-all ${stageChecked ? 'border-slate-200' : stageIndet ? 'border-orange-200' : 'border-slate-100 opacity-70'}`}>
                {/* Stage header */}
                <div className="flex items-center gap-3 px-5 py-4 bg-slate-50 border-b border-slate-100">
                  <button
                    onClick={() => toggleStage(stage, !stageChecked)}
                    className="flex-shrink-0"
                    title={stageChecked ? 'Uncheck entire stage' : 'Check entire stage'}
                  >
                    {stageChecked
                      ? <CheckSquare size={20} className="text-[#fc6e20]" />
                      : stageIndet
                      ? <CheckSquare size={20} className="text-orange-300" />
                      : <Square size={20} className="text-slate-300" />}
                  </button>
                  <button
                    onClick={() => setExpandedStages(prev => ({ ...prev, [stage.id]: !prev[stage.id] }))}
                    className="flex-1 flex items-center gap-2 text-left"
                  >
                    <span className="font-black text-slate-800 text-sm">{stage.name}</span>
                    <span className="ml-auto text-xs font-semibold text-slate-400 mr-2">{stageSelected}/{stageTaskCount} tasks</span>
                    {isOpen ? <ChevronDown size={16} className="text-slate-400 flex-shrink-0" /> : <ChevronRight size={16} className="text-slate-400 flex-shrink-0" />}
                  </button>
                </div>

                {isOpen && (
                  <div className="divide-y divide-slate-50">
                    {stage.categories.map(cat => {
                      const catChecked = isCategoryChecked(cat)
                      const catIndet = isCategoryIndeterminate(cat)
                      return (
                        <div key={cat.id} className="px-5 py-3">
                          {/* Category row */}
                          <div className="flex items-center gap-3 mb-2">
                            <button onClick={() => toggleCategory(cat, !catChecked)} className="flex-shrink-0">
                              {catChecked
                                ? <CheckSquare size={17} className="text-emerald-500" />
                                : catIndet
                                ? <CheckSquare size={17} className="text-orange-300" />
                                : <Square size={17} className="text-slate-300" />}
                            </button>
                            <span className="text-sm font-bold text-slate-700">{cat.name}</span>
                            <span className="ml-auto text-xs text-slate-400">{cat.tasks.filter(t => selectedTasks.has(t.id)).length}/{cat.tasks.length}</span>
                          </div>
                          {/* Tasks */}
                          <div className="ml-7 space-y-1.5">
                            {cat.tasks.map(task => (
                              <label key={task.id} className="flex items-center gap-2.5 cursor-pointer group">
                                <input
                                  type="checkbox"
                                  checked={selectedTasks.has(task.id)}
                                  onChange={() => toggleTask(task.id)}
                                  className="w-3.5 h-3.5 rounded accent-[#fc6e20] cursor-pointer"
                                />
                                <span className={`text-xs transition-colors ${selectedTasks.has(task.id) ? 'text-slate-600' : 'text-slate-300 line-through'}`}>
                                  {task.name}
                                </span>
                              </label>
                            ))}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            )
          })}

          <div className="flex items-center gap-3 pt-2 pb-6">
            <button
              onClick={() => setStep(1)}
              className="bg-slate-100 text-slate-700 rounded-lg px-5 py-2.5 text-sm font-semibold hover:bg-slate-200 transition-colors"
            >
              ← Back
            </button>
            <button
              onClick={handleSubmit}
              disabled={pending}
              className="flex items-center gap-2 bg-[#fc6e20] text-white rounded-lg px-7 py-2.5 text-sm font-bold hover:bg-[#e85b0d] transition-colors shadow-sm disabled:opacity-50"
            >
              {pending && <Loader2 size={15} className="animate-spin" />}
              {pending ? 'Creating Site...' : 'Create Site'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
