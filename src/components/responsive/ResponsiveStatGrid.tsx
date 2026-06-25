import React from 'react';

export default function ResponsiveStatGrid({ children }: { children: React.ReactNode }) {
  return (
    <div className="responsive-stat-grid">
      {children}
    </div>
  );
}
