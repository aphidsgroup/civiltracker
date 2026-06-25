import type { Meta, StoryObj } from '@storybook/nextjs';
import React from 'react';
import '../app/globals.css';

const meta = {
  title: 'Components/Cards',
  decorators: [
    (Story) => (
      <div style={{ padding: '24px', background: 'var(--bg)', minHeight: '100vh' }}>
        <Story />
      </div>
    ),
  ],
} satisfies Meta;

export default meta;
type Story = StoryObj;

export const StatCard: Story = {
  render: () => (
    <div className="ct-card" style={{ padding: '20px', width: '300px' }}>
      <div style={{ fontSize: '12px', color: 'var(--mut)', fontWeight: 600, textTransform: 'uppercase' }}>
        Total Expense
      </div>
      <div style={{ fontSize: '28px', fontWeight: 800, marginTop: '8px', color: 'var(--ink)' }}>
        ₹ 45.2 L
      </div>
      <div style={{ fontSize: '12px', color: 'var(--green)', fontWeight: 600, marginTop: '8px', display: 'flex', alignItems: 'center', gap: '4px' }}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="22 7 13.5 15.5 8.5 10.5 2 17"/><polyline points="16 7 22 7 22 13"/></svg>
        12% vs last month
      </div>
    </div>
  ),
};

export const SiteCard: Story = {
  render: () => (
    <div className="ct-card" style={{ padding: '20px', width: '350px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 700 }}>Orchid Towers</h3>
          <p style={{ margin: '4px 0 0', fontSize: '12px', color: 'var(--mut)' }}>HSR Layout, Bangalore</p>
        </div>
        <div className="chip chip-green">Active</div>
      </div>
      <div style={{ marginTop: '20px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', fontWeight: 600, marginBottom: '6px' }}>
          <span color="var(--mut)">Progress</span>
          <span>45%</span>
        </div>
        <div className="ct-progress">
          <div className="ct-progress-fill" style={{ width: '45%' }}></div>
        </div>
      </div>
    </div>
  ),
};
