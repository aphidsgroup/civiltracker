'use client'

import { useState, useEffect } from 'react'
import { Send, CheckSquare } from 'lucide-react'
import { getPendingTasks } from '@/actions/checklists'
import { useRouter } from 'next/navigation'

export default function DprFormClient({ 
  sites, 
  defaultSiteId, 
  submitAction 
}: { 
  sites: { id: string, name: string }[], 
  defaultSiteId?: string, 
  submitAction: (formData: FormData) => void 
}) {
  const router = useRouter()
  const [siteId, setSiteId] = useState(defaultSiteId || '')
  const [tasks, setTasks] = useState<{ id: string, name: string, categoryName: string, stageName: string }[]>([])
  const [selectedTasks, setSelectedTasks] = useState<Set<string>>(new Set())
  const [workDone, setWorkDone] = useState('')

  useEffect(() => {
    if (!siteId) {
      const resetTimer = setTimeout(() => {
        setTasks([])
        setSelectedTasks(new Set())
      }, 0)
      return () => clearTimeout(resetTimer)
    }

    let cancelled = false
    getPendingTasks(siteId).then(data => {
      if (cancelled) return
      setTasks(data)
      setSelectedTasks(new Set())
    })

    return () => {
      cancelled = true
    }
  }, [siteId])

  const toggleTask = (taskId: string, taskName: string) => {
    const newSet = new Set(selectedTasks)
    if (newSet.has(taskId)) {
      newSet.delete(taskId)
      // Attempt to remove from workDone
      const toRemove = `- Completed: ${taskName}`
      setWorkDone(prev => prev.replace(toRemove, '').trim().replace(/^\n+|\n+$/g, ''))
    } else {
      newSet.add(taskId)
      // Append to workDone
      const toAdd = `- Completed: ${taskName}`
      setWorkDone(prev => {
        if (prev) {
          if (prev.includes(toAdd)) return prev
          return prev + '\n' + toAdd
        }
        return toAdd
      })
    }
    setSelectedTasks(newSet)
  }

  return (
    <form action={submitAction} className="bg-white p-5 rounded-2xl shadow-sm border border-gray-100 flex flex-col gap-4">
      <div>
        <label className="block text-xs font-semibold uppercase tracking-wider text-gray-600 mb-1.5">Site</label>
        <select 
          name="siteId" 
          value={siteId}
          onChange={(e) => {
            setSiteId(e.target.value)
            router.replace(`?siteId=${e.target.value}`)
          }}
          className="w-full px-3.5 py-2.5 bg-white border border-gray-200 rounded-xl text-sm font-medium text-gray-900 focus:outline-none focus:ring-2 focus:ring-amber-500 shadow-sm" 
          required
        >
          <option value="">Select a site...</option>
          {sites.map(s => (
            <option key={s.id} value={s.id}>{s.name}</option>
          ))}
        </select>
      </div>

      <div>
        <label className="block text-xs font-semibold uppercase tracking-wider text-gray-600 mb-1.5">Date</label>
        <input type="date" name="date" className="w-full px-3.5 py-2.5 bg-white border border-gray-200 rounded-xl text-sm font-medium text-gray-900 focus:outline-none focus:ring-2 focus:ring-amber-500 shadow-sm" defaultValue={new Date().toISOString().split('T')[0]} required />
      </div>

      {tasks.length > 0 && (
        <div className="bg-blue-50/50 p-3 rounded-xl border border-blue-100">
          <label className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-blue-800 mb-2">
            <CheckSquare className="w-3.5 h-3.5" /> Site Tasks
          </label>
          <div className="text-[11px] text-blue-600 mb-2">Select pending tasks to automatically add them to your work log.</div>
          <div className="flex flex-col gap-2 max-h-48 overflow-y-auto">
            {tasks.map(t => (
              <label key={t.id} className="flex items-start gap-2 p-2 bg-white rounded-lg border border-blue-100 shadow-sm cursor-pointer hover:bg-blue-50 transition-colors">
                <input 
                  type="checkbox" 
                  checked={selectedTasks.has(t.id)}
                  onChange={() => toggleTask(t.id, t.name)}
                  className="mt-0.5 rounded text-blue-600 focus:ring-blue-500"
                />
                <div className="flex flex-col flex-1 leading-snug">
                  <span className="text-sm font-bold text-slate-800">{t.name}</span>
                  <span className="text-[10px] font-semibold text-slate-400">{t.stageName} • {t.categoryName}</span>
                </div>
              </label>
            ))}
          </div>
        </div>
      )}

      <div>
        <label className="block text-xs font-semibold uppercase tracking-wider text-gray-600 mb-1.5">Work Done Today</label>
        <textarea 
          name="workDone" 
          value={workDone}
          onChange={(e) => setWorkDone(e.target.value)}
          className="w-full px-3.5 py-2.5 bg-white border border-gray-200 rounded-xl text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-amber-500 shadow-sm resize-none" 
          rows={4} 
          placeholder="Describe the activities completed today..." 
          required
        ></textarea>
      </div>

      <div>
        <label className="block text-xs font-semibold uppercase tracking-wider text-gray-600 mb-1.5">Total Labour Count</label>
        <input type="number" name="labourCount" className="w-full px-3.5 py-2.5 bg-white border border-gray-200 rounded-xl text-sm font-medium text-gray-900 focus:outline-none focus:ring-2 focus:ring-amber-500 shadow-sm" placeholder="0" min="0" required />
      </div>

      <div>
        <label className="block text-xs font-semibold uppercase tracking-wider text-gray-600 mb-1.5">Delay Reasons (if any)</label>
        <input type="text" name="delayReason" className="w-full px-3.5 py-2.5 bg-white border border-gray-200 rounded-xl text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-amber-500 shadow-sm" placeholder="e.g. Rain, Material shortage" />
      </div>

      <button type="submit" className="w-full mt-2 py-3.5 px-4 bg-amber-500 hover:bg-amber-600 active:bg-amber-700 text-white font-bold rounded-xl text-sm shadow-md transition-colors flex items-center justify-center gap-2">
        <Send className="w-4 h-4" />
        Submit DPR
      </button>
    </form>
  )
}
