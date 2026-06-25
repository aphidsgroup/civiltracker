'use client'

import { useState } from 'react'

type LabourItem = {
  id: string
  name: string
  trade: string
  siteName: string
  attendance: { status: string } | null
}

const STATUS_OPTS = [
  { value: 'PRESENT', label: 'P', color: 'var(--green)', bg: '#e2f3ea' },
  { value: 'HALF_DAY', label: '\u00BD', color: 'var(--amber)', bg: '#fbeacb' },
  { value: 'ABSENT', label: 'A', color: 'var(--red)', bg: '#fbe6e3' },
]

export default function AttendanceMarker({ labour }: { labour: LabourItem[] }) {
  const init: Record<string, string> = {}
  labour.forEach(l => { if (l.attendance) init[l.id] = l.attendance.status })
  const [statuses, setStatuses] = useState<Record<string, string>>(init)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  function toggle(id: string, status: string) {
    setStatuses(prev => ({ ...prev, [id]: prev[id] === status ? '' : status }))
  }

  async function handleSave() {
    setSaving(true)
    try {
      await fetch('/api/attendance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ attendance: Object.entries(statuses).map(([labourId, status]) => ({ labourId, status })) }),
      })
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    } catch {}
    setSaving(false)
  }

  const presentCount = Object.values(statuses).filter(s => s === 'PRESENT').length
  const halfCount = Object.values(statuses).filter(s => s === 'HALF_DAY').length

  return (
    <div>
      {/* Summary */}
      <div style={{ display: 'flex', gap: '10px', marginBottom: '14px' }}>
        <div style={{ flex: 1, background: '#e2f3ea', borderRadius: '12px', padding: '12px', textAlign: 'center' }}>
          <div style={{ fontSize: '20px', fontWeight: 800, color: 'var(--green)' }}>{presentCount}</div>
          <div style={{ fontSize: '10.5px', color: 'var(--green)', fontWeight: 700 }}>PRESENT</div>
        </div>
        <div style={{ flex: 1, background: '#fbeacb', borderRadius: '12px', padding: '12px', textAlign: 'center' }}>
          <div style={{ fontSize: '20px', fontWeight: 800, color: 'var(--amber)' }}>{halfCount}</div>
          <div style={{ fontSize: '10.5px', color: 'var(--amber)', fontWeight: 700 }}>HALF DAY</div>
        </div>
        <div style={{ flex: 1, background: '#fbe6e3', borderRadius: '12px', padding: '12px', textAlign: 'center' }}>
          <div style={{ fontSize: '20px', fontWeight: 800, color: 'var(--red)' }}>{labour.length - presentCount - halfCount}</div>
          <div style={{ fontSize: '10.5px', color: 'var(--red)', fontWeight: 700 }}>ABSENT</div>
        </div>
      </div>

      {/* List */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '18px' }}>
        {labour.map(l => (
          <div key={l.id} style={{ background: '#fff', borderRadius: '13px', padding: '12px 14px', border: '1px solid var(--line)', display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 700, fontSize: '13.5px' }}>{l.name}</div>
              <div style={{ fontSize: '11px', color: 'var(--mut)', fontWeight: 600 }}>{l.trade} \u00b7 {l.siteName}</div>
            </div>
            <div style={{ display: 'flex', gap: '6px' }}>
              {STATUS_OPTS.map(opt => (
                <button
                  key={opt.value}
                  onClick={() => toggle(l.id, opt.value)}
                  style={{
                    width: '36px', height: '36px', borderRadius: '50%', border: '2px solid',
                    borderColor: statuses[l.id] === opt.value ? opt.color : 'var(--line)',
                    background: statuses[l.id] === opt.value ? opt.bg : '#fff',
                    color: statuses[l.id] === opt.value ? opt.color : 'var(--mut)',
                    fontWeight: 800, fontSize: '13px', cursor: 'pointer',
                  }}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>

      <button onClick={handleSave} disabled={saving} className="mobile-btn-primary">
        {saved ? '\u2713 Saved!' : saving ? 'Saving...' : 'Save Attendance'}
      </button>
    </div>
  )
}
