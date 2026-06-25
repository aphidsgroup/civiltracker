import { test, expect } from '@playwright/test';
import { hasPermission } from '../../src/lib/permissions';

test.describe('Phase 7 Approval Capability Permissions E2E', () => {
  test('1. Capability mapping verifies granular approval rights correctly', () => {
    expect(hasPermission('SUPER_ADMIN', 'expenses.approve')).toBe(true);
    expect(hasPermission('COMPANY_ADMIN', 'bills.approve')).toBe(true);
    expect(hasPermission('ACCOUNTANT', 'salary.approve')).toBe(true);
    expect(hasPermission('PROJECT_MANAGER', 'dpr.approve')).toBe(true);
  });

  test('2. Field roles (Site Engineer, Supervisor) cannot approve POs or variations', () => {
    expect(hasPermission('SITE_ENGINEER', 'purchase.approve')).toBe(false);
    expect(hasPermission('SUPERVISOR', 'variations.approve')).toBe(false);
  });

  test('3. Client cannot approve or mutate internal bills', () => {
    expect(hasPermission('CLIENT', 'bills.approve')).toBe(false);
    expect(hasPermission('CLIENT', 'expenses.approve')).toBe(false);
  });
});
