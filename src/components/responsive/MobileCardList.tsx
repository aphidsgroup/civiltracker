import React from 'react'

export interface MobileCardItem {
  id: string | number
  title: React.ReactNode
  subtitle?: React.ReactNode
  meta?: React.ReactNode
  statusNode?: React.ReactNode
  avatar?: string | React.ReactNode
}

export default function MobileCardList({ items }: { items: MobileCardItem[] }) {
  if (!items || items.length === 0) {
    return <div style={{ padding: '20px', textAlign: 'center', color: 'var(--mut)', fontSize: '13px' }}>No items found</div>
  }
  
  return (
    <div className="card" style={{ padding: 0 }}>
      {items.map((item, idx) => (
        <div key={item.id} className="lrow" style={{ padding: '14px', borderTop: idx > 0 ? '1px solid var(--line)' : 'none' }}>
          {item.avatar && (
            <div className="lthumb">
              {item.avatar}
            </div>
          )}
          <div className="lmain" style={{ flex: 1, minWidth: 0 }}>
            <div className="lt1" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: '14px', fontWeight: 700, color: 'var(--ink)' }}>{item.title}</span>
              {item.statusNode && <div>{item.statusNode}</div>}
            </div>
            {item.subtitle && <div className="lt2" style={{ fontSize: '12px', color: 'var(--mut)', fontWeight: 600, marginTop: '4px' }}>{item.subtitle}</div>}
            {item.meta && <div style={{ marginTop: '6px' }}>{item.meta}</div>}
          </div>
        </div>
      ))}
    </div>
  )
}
