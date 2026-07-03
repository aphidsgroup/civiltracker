'use client'

import { useState, useTransition } from 'react'
import { toggleTaskStatus, toggleCategoryNeglect, addCustomTask } from '@/actions/checklists'

type Task = {
  id: string
  name: string
  isNeglected: boolean
  isClientDone: boolean
  status: string
}

type Category = {
  id: string
  name: string
  isNeglected: boolean
  tasks: Task[]
}

type Stage = {
  id: string
  name: string
  categories: Category[]
}

type Checklist = {
  id: string
  stages: Stage[]
}

export function ChecklistClient({ checklist }: { checklist: Checklist }) {
  const [isPending, startTransition] = useTransition()
  const [activeStage, setActiveStage] = useState(checklist.stages[0]?.id)
  
  const [newTaskName, setNewTaskName] = useState('')
  const [addingToCategory, setAddingToCategory] = useState<string | null>(null)

  const handleToggleTask = (taskId: string, currentStatus: string, field: 'status' | 'clientDone' | 'neglected', currentValue: any) => {
    startTransition(async () => {
      if (field === 'status') {
        const next = currentStatus === 'COMPLETED' ? 'PENDING' : 'COMPLETED'
        await toggleTaskStatus(taskId, next, false, false)
      } else if (field === 'clientDone') {
        await toggleTaskStatus(taskId, 'PENDING', !currentValue, false)
      } else if (field === 'neglected') {
        await toggleTaskStatus(taskId, 'PENDING', false, !currentValue)
      }
    })
  }

  const handleToggleCategory = (categoryId: string, currentNeglected: boolean) => {
    startTransition(async () => {
      await toggleCategoryNeglect(categoryId, !currentNeglected)
    })
  }

  const handleAddTask = async (categoryId: string) => {
    if (!newTaskName.trim()) return
    startTransition(async () => {
      await addCustomTask(categoryId, newTaskName)
      setNewTaskName('')
      setAddingToCategory(null)
    })
  }

  const currentStage = checklist.stages.find(s => s.id === activeStage)

  return (
    <div className="flex flex-col md:flex-row gap-6">
      {/* Sidebar Stages */}
      <div className="w-full md:w-64 shrink-0 space-y-2">
        {checklist.stages.map(stage => {
          const isActive = stage.id === activeStage
          // Progress calculation for stage
          let tTotal = 0, tDone = 0
          stage.categories.forEach(c => {
            if(!c.isNeglected) {
              c.tasks.forEach(t => {
                if(!t.isNeglected && !t.isClientDone) {
                  tTotal++
                  if(t.status === 'COMPLETED') tDone++
                }
              })
            }
          })
          const prog = tTotal > 0 ? Math.round((tDone/tTotal)*100) : 0

          return (
            <button
              key={stage.id}
              onClick={() => setActiveStage(stage.id)}
              className={`w-full text-left p-3 rounded-xl transition-all ${isActive ? 'bg-[#fc6e20] text-white shadow-md' : 'bg-white border border-slate-200 text-slate-700 hover:border-[#fc6e20]'}`}
            >
              <div className="font-bold text-sm">{stage.name}</div>
              <div className={`text-xs mt-1 ${isActive ? 'text-white/80' : 'text-slate-500'}`}>
                {prog}% • {tDone}/{tTotal} Tasks
              </div>
            </button>
          )
        })}
      </div>

      {/* Main Content */}
      <div className="flex-1 space-y-6">
        {currentStage?.categories.map(category => (
          <div key={category.id} className={`bg-white rounded-2xl border ${category.isNeglected ? 'border-slate-200 opacity-60' : 'border-slate-200 shadow-sm'} overflow-hidden transition-all`}>
            {/* Category Header */}
            <div className="bg-slate-50 px-5 py-4 border-b border-slate-200 flex items-center justify-between">
              <h3 className="font-bold text-slate-800">{category.name}</h3>
              <label className="flex items-center gap-2 cursor-pointer text-sm font-medium text-slate-600">
                <input 
                  type="checkbox" 
                  checked={!category.isNeglected}
                  onChange={() => handleToggleCategory(category.id, category.isNeglected)}
                  disabled={isPending}
                  className="rounded text-[#fc6e20] focus:ring-[#fc6e20]"
                />
                Applicable
              </label>
            </div>

            {/* Tasks List */}
            {!category.isNeglected && (
              <div className="divide-y divide-slate-100">
                {category.tasks.map(task => (
                  <div key={task.id} className={`p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4 ${task.isNeglected ? 'opacity-50' : ''}`}>
                    <div className="flex items-start gap-3 flex-1">
                      <input 
                        type="checkbox"
                        checked={task.status === 'COMPLETED'}
                        onChange={() => handleToggleTask(task.id, task.status, 'status', task.status)}
                        disabled={task.isNeglected || task.isClientDone || isPending}
                        className="mt-1 w-5 h-5 rounded border-slate-300 text-green-500 focus:ring-green-500"
                      />
                      <div>
                        <p className={`text-sm font-medium ${task.status === 'COMPLETED' ? 'text-slate-400 line-through' : 'text-slate-700'}`}>
                          {task.name}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-4 text-xs font-medium pl-8 sm:pl-0">
                      <label className="flex items-center gap-1.5 cursor-pointer text-slate-500 hover:text-slate-800">
                        <input type="checkbox" checked={task.isClientDone} onChange={() => handleToggleTask(task.id, task.status, 'clientDone', task.isClientDone)} disabled={isPending} className="rounded text-blue-500 focus:ring-blue-500" />
                        Client Done
                      </label>
                      <label className="flex items-center gap-1.5 cursor-pointer text-slate-500 hover:text-slate-800">
                        <input type="checkbox" checked={task.isNeglected} onChange={() => handleToggleTask(task.id, task.status, 'neglected', task.isNeglected)} disabled={isPending} className="rounded text-red-500 focus:ring-red-500" />
                        Not Req
                      </label>
                    </div>
                  </div>
                ))}
                
                {/* Add Custom Task */}
                <div className="p-4 bg-slate-50/50">
                  {addingToCategory === category.id ? (
                    <div className="flex items-center gap-2">
                      <input 
                        type="text"
                        autoFocus
                        value={newTaskName}
                        onChange={e => setNewTaskName(e.target.value)}
                        placeholder="Task description..."
                        className="flex-1 text-sm border-slate-300 rounded-lg focus:ring-[#fc6e20] focus:border-[#fc6e20]"
                        onKeyDown={e => e.key === 'Enter' && handleAddTask(category.id)}
                      />
                      <button 
                        onClick={() => handleAddTask(category.id)}
                        disabled={!newTaskName.trim() || isPending}
                        className="px-3 py-2 bg-[#fc6e20] text-white text-sm font-bold rounded-lg hover:bg-[#e55a10]"
                      >
                        Add
                      </button>
                      <button onClick={() => { setAddingToCategory(null); setNewTaskName('') }} className="px-3 py-2 text-slate-500 text-sm font-bold hover:bg-slate-200 rounded-lg">
                        Cancel
                      </button>
                    </div>
                  ) : (
                    <button onClick={() => setAddingToCategory(category.id)} className="text-sm font-bold text-[#fc6e20] hover:text-[#e55a10] flex items-center gap-1">
                      + Add Custom Task
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
