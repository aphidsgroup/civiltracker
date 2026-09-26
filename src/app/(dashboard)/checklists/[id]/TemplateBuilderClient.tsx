'use client'

import { useState, useTransition } from 'react'
import { Plus, Trash2, CheckCircle2, ChevronDown, ChevronRight, Save } from 'lucide-react'
import { addStage, addCategory, addTask, deleteStage, deleteCategory, deleteTask, updateTemplateInfo } from '@/actions/template-checklists'

type Task = { id: string, name: string }
type Category = { id: string, name: string, tasks: Task[] }
type Stage = { id: string, name: string, categories: Category[] }
type Template = { id: string, name: string, description: string | null, stages: Stage[] }

export function TemplateBuilderClient({ template }: { template: Template }) {
  const [isPending, startTransition] = useTransition()
  
  const [name, setName] = useState(template.name)
  const [description, setDescription] = useState(template.description || '')
  
  const [expandedStages, setExpandedStages] = useState<Record<string, boolean>>({
    [template.stages[0]?.id]: true
  })
  const [expandedCategories, setExpandedCategories] = useState<Record<string, boolean>>({})

  const [newStage, setNewStage] = useState('')
  const [newCat, setNewCat] = useState<Record<string, string>>({})
  const [newTask, setNewTask] = useState<Record<string, string>>({})

  const toggleStage = (id: string) => setExpandedStages(prev => ({ ...prev, [id]: !prev[id] }))
  const toggleCategory = (id: string) => setExpandedCategories(prev => ({ ...prev, [id]: !prev[id] }))

  const handleUpdateInfo = () => {
    startTransition(async () => {
      await updateTemplateInfo(template.id, name, description)
    })
  }

  const handleAddStage = (e: React.FormEvent) => {
    e.preventDefault()
    if (!newStage.trim()) return
    startTransition(async () => {
      await addStage(template.id, newStage)
      setNewStage('')
    })
  }

  const handleAddCategory = (stageId: string) => {
    const val = newCat[stageId]
    if (!val?.trim()) return
    startTransition(async () => {
      await addCategory(stageId, val, template.id)
      setNewCat(prev => ({ ...prev, [stageId]: '' }))
    })
  }

  const handleAddTask = (categoryId: string) => {
    const val = newTask[categoryId]
    if (!val?.trim()) return
    startTransition(async () => {
      await addTask(categoryId, val, template.id)
      setNewTask(prev => ({ ...prev, [categoryId]: '' }))
    })
  }

  const handleDelete = (
    kind: 'stage' | 'category' | 'task',
    target: { id: string, name: string },
    action: (id: string, templateId: string, confirmation: string) => Promise<void>,
  ) => {
    const typed = window.prompt(`Type "${target.name}" to permanently delete this ${kind}${kind === 'task' ? '' : ' and everything in it'}.`)
    if (typed === null) return
    startTransition(async () => {
      await action(target.id, template.id, typed)
    })
  }

  return (
    <div className="space-y-6">
      {/* Template Info */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6">
        <h3 className="font-bold text-slate-800 mb-4">Template Settings</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-1.5">Template Name</label>
            <input 
              value={name} onChange={e => setName(e.target.value)}
              className="w-full border border-slate-300 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#fc6e20]/40 focus:border-[#fc6e20]"
            />
          </div>
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-1.5">Description</label>
            <input 
              value={description} onChange={e => setDescription(e.target.value)}
              className="w-full border border-slate-300 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#fc6e20]/40 focus:border-[#fc6e20]"
            />
          </div>
        </div>
        <div className="mt-4 flex justify-end">
          <button 
            onClick={handleUpdateInfo} disabled={isPending}
            className="flex items-center gap-2 bg-slate-800 text-white px-5 py-2 rounded-lg text-sm font-bold shadow-sm hover:bg-slate-700 disabled:opacity-50"
          >
            <Save size={16} /> Save Settings
          </button>
        </div>
      </div>

      {/* Stages Builder */}
      <div className="space-y-4">
        {template.stages.map(stage => {
          const isExpanded = expandedStages[stage.id]
          return (
            <div key={stage.id} className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
              <div className="w-full px-4 py-3 flex items-center justify-between bg-slate-50 border-b border-slate-200">
                <button onClick={() => toggleStage(stage.id)} className="flex-1 flex items-center gap-2 text-left">
                  {isExpanded ? <ChevronDown size={18} className="text-slate-400" /> : <ChevronRight size={18} className="text-slate-400" />}
                  <span className="font-black text-slate-800 text-[15px]">{stage.name}</span>
                </button>
                <button 
                  onClick={() => handleDelete('stage', stage, deleteStage)}
                  disabled={isPending}
                  className="p-2 text-slate-400 hover:text-rose-500 transition-colors"
                >
                  <Trash2 size={16} />
                </button>
              </div>

              {isExpanded && (
                <div className="divide-y divide-slate-100">
                  {stage.categories.map(category => {
                    const isCatExpanded = expandedCategories[category.id]
                    return (
                      <div key={category.id} className="bg-white">
                        <div className="w-full px-4 py-2.5 flex items-center justify-between">
                          <button onClick={() => toggleCategory(category.id)} className="flex-1 flex items-center gap-2 text-left">
                            {isCatExpanded ? <ChevronDown size={16} className="text-slate-400" /> : <ChevronRight size={16} className="text-slate-400" />}
                            <span className="font-bold text-slate-700 text-sm">{category.name}</span>
                          </button>
                          <button 
                            onClick={() => handleDelete('category', category, deleteCategory)}
                            disabled={isPending}
                            className="p-1.5 text-slate-300 hover:text-rose-500 transition-colors"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>

                        {isCatExpanded && (
                          <div className="bg-slate-50/50 pb-3">
                            {category.tasks.map(task => (
                              <div key={task.id} className="px-6 py-2 flex items-center justify-between group">
                                <div className="flex items-center gap-3">
                                  <div className="w-1.5 h-1.5 rounded-full bg-slate-300" />
                                  <span className="text-sm font-medium text-slate-600">{task.name}</span>
                                </div>
                                <button 
                                  onClick={() => handleDelete('task', task, deleteTask)}
                                  disabled={isPending}
                                  className="opacity-0 group-hover:opacity-100 p-1 text-slate-300 hover:text-rose-500 transition-all"
                                >
                                  <Trash2 size={14} />
                                </button>
                              </div>
                            ))}
                            
                            {/* Add Task Input */}
                            <div className="px-6 pt-2 flex gap-2">
                              <input
                                value={newTask[category.id] || ''}
                                onChange={e => setNewTask(prev => ({ ...prev, [category.id]: e.target.value }))}
                                placeholder="New task name..."
                                className="flex-1 text-sm bg-transparent border-b border-slate-200 focus:border-[#fc6e20] focus:outline-none py-1 transition-colors"
                                onKeyDown={e => e.key === 'Enter' && handleAddTask(category.id)}
                              />
                              <button 
                                onClick={() => handleAddTask(category.id)} disabled={isPending}
                                className="text-xs font-bold text-[#fc6e20] hover:text-[#e85b0d]"
                              >
                                Add Task
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    )
                  })}
                  
                  {/* Add Category Input */}
                  <div className="px-4 py-3 bg-white flex gap-3">
                    <div className="w-4 flex items-center justify-center">
                      <Plus size={16} className="text-slate-300" />
                    </div>
                    <input
                      value={newCat[stage.id] || ''}
                      onChange={e => setNewCat(prev => ({ ...prev, [stage.id]: e.target.value }))}
                      placeholder="Add a new category to this stage..."
                      className="flex-1 text-sm bg-transparent border-none focus:outline-none font-medium text-slate-700 placeholder-slate-400"
                      onKeyDown={e => e.key === 'Enter' && handleAddCategory(stage.id)}
                    />
                    <button 
                      onClick={() => handleAddCategory(stage.id)} disabled={isPending}
                      className="text-xs font-bold bg-slate-100 hover:bg-slate-200 text-slate-600 px-3 py-1 rounded-md"
                    >
                      Add Category
                    </button>
                  </div>
                </div>
              )}
            </div>
          )
        })}

        {/* Add Stage */}
        <form onSubmit={handleAddStage} className="bg-white rounded-xl shadow-sm border border-slate-200 p-4 flex gap-3 items-center border-dashed">
          <div className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center text-slate-400">
            <Plus size={18} />
          </div>
          <input
            value={newStage}
            onChange={e => setNewStage(e.target.value)}
            placeholder="Name for a new stage..."
            className="flex-1 text-sm bg-transparent border-none focus:outline-none font-bold text-slate-800 placeholder-slate-400"
          />
          <button 
            type="submit" disabled={isPending}
            className="text-sm font-bold bg-[#fc6e20] hover:bg-[#e85b0d] text-white px-4 py-2 rounded-lg transition-colors shadow-sm disabled:opacity-50"
          >
            Add Stage
          </button>
        </form>
      </div>
    </div>
  )
}
