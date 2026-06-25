import React from 'react';

export default function MobilePageHeader({ title, subtitle, action }: { title: string, subtitle?: string, action?: React.ReactNode }) {
  return (
    <div className="responsive-header">
      <div>
        <h1 className="ptitle">{title}</h1>
        {subtitle && <p className="pcrumb">{subtitle}</p>}
      </div>
      {action && <div className="responsive-header-action">{action}</div>}
    </div>
  );
}
