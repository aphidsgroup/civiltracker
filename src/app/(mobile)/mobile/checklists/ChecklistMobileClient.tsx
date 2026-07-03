'use client'

import { useState, useTransition } from 'react'
import { CheckCircle2, Circle, ChevronDown, ChevronRight } from 'lucide-react'
import { toggleTaskStatus } from '@/actions/checklists'

type Task = {
  id: string
  name: string
  status: string
}

type Category = {
  id: string
  name: string
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

export function ChecklistMobileClient({ siteId, checklist }: { siteId: string, checklist: Checklist }) {
  const [isPending, startTransition] = useTransition()
  const [expandedStages, setExpandedStages] = useState<Record<string, boolean>>({
    [checklist.stages[0]?.id]: true
  })
  const [expandedCategories, setExpandedCategories] = useState<Record<string, boolean>>({})

  const toggleStage = (id: string) => {
    setExpandedStages(prev => ({ ...prev, [id]: !prev[id] }))
  }

  const toggleCategory = (id: string) => {
    setExpandedCategories(prev => ({ ...prev, [id]: !prev[id] }))
  }

  const handleToggleTask = (taskId: string, currentStatus: string) => {
    startTransition(async () => {
      const next = currentStatus === 'COMPLETED' ? 'PENDING' : 'COMPLETED'
      await toggleTaskStatus(siteId, taskId, next, false, false)
    })
  }

  return (
    <div className="space-y-4">
      {checklist.stages.map(stage => {
        const hasCategories = stage.categories.length > 0
        const isExpanded = expandedStages[stage.id]
        
        let sTotal = 0, sDone = 0
        stage.categories.forEach(c => {
          c.tasks.forEach(t => {
            sTotal++
            if (t.status === 'COMPLETED') sDone++
          })
        })
        const prog = sTotal > 0 ? Math.round((sDone/sTotal)*100) : 0

        return (
          <div key={stage.id} className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
            <button 
              onClick={() => toggleStage(stage.id)}
              className="w-full px-4 py-3 flex items-center justify-between bg-slate-50"
            >
              <div className="flex-1 text-left pr-4">
                <div className="font-bold text-slate-800 text-[15px]">{stage.name}</div>
                <div className="text-xs font-bold text-slate-500 mt-1">
                  {prog}% Complete ({sDone}/{sTotal})
                </div>
              </div>
              <div className="text-slate-400">
                {isExpanded ? <ChevronDown size={20} /> : <ChevronRight size={20} />}
              </div>
            </button>

            {isExpanded && hasCategories && (
              <div className="divide-y divide-slate-100">
                {stage.categories.map(category => {
                  const isCatExpanded = expandedCategories[category.id]
                  const hasTasks = category.tasks.length > 0
                  
                  return (
                    <div key={category.id} className="bg-white">
                      <button 
                        onClick={() => toggleCategory(category.id)}
                        className="w-full px-4 py-2.5 flex items-center justify-between"
                      >
                        <span className="font-bold text-slate-700 text-sm">{category.name}</span>
                        <div className="text-slate-400">
                          {isCatExpanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                        </div>
                      </button>

                      {isCatExpanded && hasTasks && (
                        <div className="bg-slate-50/50 pb-2">
                          {category.tasks.map(task => (
                            <button
                              key={task.id}
                              onClick={() => handleToggleTask(task.id, task.status)}
                              disabled={isPending}
                              className="w-full px-4 py-3 flex items-start gap-3 active:bg-slate-100 transition-colors"
                            >
                              <div className="mt-0.5 flex-shrink-0">
                                {task.status === 'COMPLETED' ? (
                                  <CheckCircle2 size={22} className="text-emerald-500" />
                                ) : (
                                  <Circle size={22} className="text-slate-300" />
                                )}
                              </div>
                              <div className={`text-left text-sm font-medium ${task.status === 'COMPLETED' ? 'text-slate-400 line-through' : 'text-slate-700'}`}>
                                {task.name}
                              </div>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
