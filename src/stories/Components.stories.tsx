import type { Meta, StoryObj } from '@storybook/nextjs';
import React from 'react';
import '../app/globals.css';

const meta = {
  title: 'Components/Elements',
  decorators: [
    (Story) => (
      <div style={{ padding: '24px', background: 'var(--bg)', minHeight: '100vh', display: 'flex', gap: '16px', flexWrap: 'wrap' }}>
        <Story />
      </div>
    ),
  ],
} satisfies Meta;

export default meta;
type Story = StoryObj;

export const StatusChips: Story = {
  render: () => (
    <>
      <div className="chip chip-green">
        <div className="chip-dot"></div> Active
      </div>
      <div className="chip chip-amber">
        <div className="chip-dot"></div> Pending
      </div>
      <div className="chip chip-red">
        <div className="chip-dot"></div> Rejected
      </div>
      <div className="chip chip-blue">
        <div className="chip-dot"></div> Completed
      </div>
      <div className="chip chip-mut">
        <div className="chip-dot"></div> Draft
      </div>
    </>
  ),
};

export const Buttons: Story = {
  render: () => (
    <>
      <button className="btn-primary">Primary Button</button>
      <button className="btn-ghost">Ghost Button</button>
      <button className="btn-approve">Approve</button>
      <button className="btn-reject">Reject</button>
    </>
  ),
};

export const DataTable: Story = {
  render: () => (
    <div className="ct-card" style={{ width: '100%', overflowX: 'auto' }}>
      <table className="ct-table">
        <thead>
          <tr>
            <th>Date</th>
            <th>Description</th>
            <th>Amount</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>Oct 12, 2026</td>
            <td>Cement 50 bags</td>
            <td>₹18,500</td>
            <td><span className="chip chip-green">Approved</span></td>
          </tr>
          <tr>
            <td>Oct 11, 2026</td>
            <td>JCB Rental</td>
            <td>₹5,000</td>
            <td><span className="chip chip-amber">Pending</span></td>
          </tr>
        </tbody>
      </table>
    </div>
  ),
};
