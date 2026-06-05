import { describe, expect, it, vi } from 'vitest';
import { fireEvent, screen } from '@testing-library/react';
import { renderWithRouter } from './test-utils.tsx';
import { RoleOnboardingChecklist, buildRoleChecklistItems } from '../../src/components/RoleOnboardingChecklist.tsx';
import type { Product, RestaurantTable, Sale, Staff, Workstation } from '../../src/types.ts';

const products: Product[] = [
  { id: 'prod_1', name: 'Burger', price: 95, category: 'Meals', section: 'Food', stock: 12 },
];

const staff: Staff[] = [
  { id: 'staff_1', name: 'Owner', role: 'admin', email: 'owner@example.com', status: 'active', createdAt: '2026-06-04' },
  { id: 'staff_2', name: 'Cashier', role: 'cashier', email: 'cashier@example.com', status: 'active', createdAt: '2026-06-04' },
];

const workstations: Workstation[] = [
  { id: 'ws_1', name: 'Kitchen', type: 'kitchen', status: 'active' },
];

const restaurantTables: RestaurantTable[] = [
  { id: 'T1', label: 'Table 1', sectionId: 'main', status: 'active' },
];

const sales: Sale[] = [
  {
    id: 'sale_1',
    items: [{ ...products[0], quantity: 1, status: 'pending', workstationId: 'ws_1' } as any],
    total: 95,
    paymentMethod: 'pending',
    status: 'kitchen',
    tableNumber: 'T1',
    createdAt: '2026-06-04T09:00:00.000Z',
  },
  {
    id: 'tab_1',
    items: [{ ...products[0], quantity: 1 }],
    total: 95,
    paymentMethod: 'pending',
    status: 'open',
    isTab: true,
    createdAt: '2026-06-04T09:05:00.000Z',
  },
];

const baseContext = {
  isRestaurant: true,
  hasOpenRegister: true,
  products,
  customers: [{ id: 'cust_1' }],
  staff,
  sales,
  workstations,
  restaurantTables,
  pendingWorkstationCount: 1,
  openTabsCount: 1,
};

describe('RoleOnboardingChecklist', () => {
  it('builds waiter/cashier checklist items with table and tab routing', () => {
    const items = buildRoleChecklistItems({ ...baseContext, role: 'cashier' });

    expect(items.map(item => item.label)).toEqual([
      'Open register',
      'Start table sale',
      'Tables',
      'Tabs',
      'Customer profile',
      'Receipts and fixes',
    ]);
    expect(items.find(item => item.id === 'tables')).toMatchObject({ path: '/tables', status: 'ready' });
    expect(items.find(item => item.id === 'tabs')).toMatchObject({ path: '/tabs', status: 'attention' });
  });

  it('builds missing setup actions for owner and dev users', () => {
    const ownerItems = buildRoleChecklistItems({
      ...baseContext,
      role: 'admin',
      products: [],
      staff: [staff[0]],
      customers: [],
    });
    const devItems = buildRoleChecklistItems({
      ...baseContext,
      role: 'cashier',
      isDev: true,
      products: [],
      customers: [],
    });

    expect(ownerItems.find(item => item.id === 'staff')).toMatchObject({ path: '/staff', status: 'attention' });
    expect(ownerItems.find(item => item.id === 'inventory')).toMatchObject({ path: '/inventory', status: 'attention' });
    expect(devItems[0]).toMatchObject({ label: 'Run Dev checks', path: '/dev' });
    expect(devItems.find(item => item.id === 'data-fixtures')).toMatchObject({ status: 'attention' });
  });

  it('renders cards and routes clicks through the app navigator', () => {
    const navigate = vi.fn();
    renderWithRouter(
      <RoleOnboardingChecklist
        {...baseContext}
        role="manager"
        currentView="pos"
        onNavigate={navigate}
      />
    );

    expect(screen.getByRole('region', { name: /role daily checklist/i })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Approve exceptions/i }));
    expect(navigate).toHaveBeenCalledWith('/actions');
  });
});
