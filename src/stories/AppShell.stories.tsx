import type { Meta, StoryObj } from '@storybook/react';
import React from 'react';
import '../app/globals.css';
import DashboardSidebar from '../components/layout/DashboardSidebar';
import DashboardTopbar from '../components/layout/DashboardTopbar';
import MobileTabbar from '../components/mobile/MobileTabbar';

const meta = {
  title: 'Layout/AppShells',
  parameters: {
    layout: 'fullscreen',
  },
} satisfies Meta;

export default meta;
type Story = StoryObj;

export const CompanyAdminShell: Story = {
  render: () => (
    <div className="ct">
      <DashboardSidebar companySlug="demo" />
      <div className="main">
        <DashboardTopbar userName="John Doe" companyName="Demo Construction" />
        <div style={{ padding: '24px' }}>Dashboard Content Here</div>
      </div>
    </div>
  ),
};

export const MobilePWAShell: Story = {
  render: () => (
    <div className="mobile-shell" style={{ width: '390px', height: '844px', border: '1px solid #ddd', margin: '0 auto', position: 'relative', background: 'var(--bg)' }}>
      <div className="m-header" style={{ background: 'var(--p)', padding: '20px', color: '#fff' }}>
        <h2>Welcome, Engineer</h2>
      </div>
      <div className="m-content" style={{ padding: '20px', height: 'calc(100% - 140px)', overflowY: 'auto' }}>
        Mobile Content Here
      </div>
      <div style={{ position: 'absolute', bottom: 0, width: '100%' }}>
        <MobileTabbar />
      </div>
    </div>
  ),
};
