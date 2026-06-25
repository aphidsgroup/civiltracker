import React from 'react';

export default function ResponsiveDashboardGrid({ leftContent, rightContent }: { leftContent: React.ReactNode, rightContent: React.ReactNode }) {
  return (
    <div className="responsive-dash-grid">
      <div className="dash-colL">{leftContent}</div>
      <div className="dash-colR">{rightContent}</div>
    </div>
  );
}
