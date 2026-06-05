import { describe, expect, it, vi } from 'vitest';
import { fireEvent, screen, within } from '@testing-library/react';
import { renderWithRouter } from './test-utils.tsx';
import { HandheldView } from '../../src/views/HandheldView.tsx';
import type { Customer, RestaurantTable, Sale, TableSection } from '../../src/types.ts';

const customers: Customer[] = [
  { id: 'cust_1', name: 'Regular Customer', email: 'regular@example.com' },
];

const tableSections: TableSection[] = [
  { id: 'main', name: 'Main', order: 0, color: 'blue' },
];

const restaurantTables: RestaurantTable[] = [
  { id: 'T1', label: 'Table 1', sectionId: 'main', status: 'active', capacity: 4 },
  { id: 'T2', label: 'Table 2', sectionId: 'main', status: 'active', capacity: 2 },
];

const sales: Sale[] = [
  {
    id: 'sale_table_1',
    items: [
      { id: 'prod_1', name: 'Burger', price: 95, quantity: 1, status: 'ready' } as any,
      { id: 'prod_2', name: 'Chips', price: 35, quantity: 2, status: 'pending' } as any,
    ],
    total: 165,
    paymentMethod: 'pending',
    status: 'kitchen',
    tableNumber: 'T1',
    createdAt: '2026-06-05T12:00:00.000Z',
  },
  {
    id: 'sale_tab_1',
    items: [{ id: 'prod_3', name: 'Coffee', price: 28, quantity: 1 } as any],
    total: 28,
    paymentMethod: 'pending',
    status: 'open',
    isTab: true,
    tabName: 'Regular Customer',
    customerId: 'cust_1',
    createdAt: '2026-06-05T12:10:00.000Z',
  },
];

function renderHandheld() {
  const onOpenTable = vi.fn();
  const onResumeTab = vi.fn();
  renderWithRouter(
    <HandheldView
      sales={sales}
      customers={customers}
      restaurantTables={restaurantTables}
      tableSections={tableSections}
      onOpenTable={onOpenTable}
      onResumeTab={onResumeTab}
    />,
    { route: '/handheld' }
  );
  return { onOpenTable, onResumeTab };
}

describe('HandheldView', () => {
  it('shows table and tab status for a tableside handheld workflow', () => {
    renderHandheld();

    expect(screen.getByText('Tableside ordering')).toBeInTheDocument();
    expect(screen.getByText('Open tables')).toBeInTheDocument();
    expect(screen.getByText('Ready items')).toBeInTheDocument();

    const tableActions = within(screen.getByRole('region', { name: /handheld table actions/i }));
    expect(tableActions.getByText('Table 1')).toBeInTheDocument();
    expect(tableActions.getByText('1 ready')).toBeInTheDocument();
    expect(tableActions.getByText('R165.00')).toBeInTheDocument();
    expect(tableActions.getByText('Table 2')).toBeInTheDocument();
    expect(tableActions.getByText('Ready for a new tableside order.')).toBeInTheDocument();

    const tabActions = within(screen.getByRole('region', { name: /handheld open tab actions/i }));
    expect(tabActions.getByText('Regular Customer')).toBeInTheDocument();
    expect(tabActions.getByText('1 items - R28.00')).toBeInTheDocument();
  });

  it('routes start, add, and checkout actions with the correct intent', () => {
    const { onOpenTable, onResumeTab } = renderHandheld();

    fireEvent.click(screen.getByRole('button', { name: /Start order for Table 2/i }));
    expect(onOpenTable).toHaveBeenCalledWith('T2', undefined, 'order');

    fireEvent.click(screen.getByRole('button', { name: /Add items to Table 1/i }));
    expect(onOpenTable).toHaveBeenCalledWith('T1', sales[0], 'order');

    fireEvent.click(screen.getByRole('button', { name: /Checkout Table 1/i }));
    expect(onOpenTable).toHaveBeenCalledWith('T1', sales[0], 'checkout');

    fireEvent.click(screen.getByRole('button', { name: /Checkout tab Regular Customer/i }));
    expect(onResumeTab).toHaveBeenCalledWith(sales[1], 'checkout');
  });
});
