import { describe, expect, it } from 'vitest';
import { buildNavigation, canAccessView, canLoadDataset } from '../../src/permissions';

describe('role permissions', () => {
  it('keeps cashier restaurant views hidden until a terminal is open', () => {
    const closedOptions = { isRestaurant: true, hasOpenTerminal: false };

    expect(canAccessView('cashier', 'tables', closedOptions)).toBe(false);
    expect(canAccessView('cashier', 'tabs', closedOptions)).toBe(false);
    expect(canLoadDataset('cashier', 'tables', closedOptions)).toBe(false);
    expect(buildNavigation('cashier', closedOptions).primaryNav.map(item => item.id)).not.toContain('tables');
  });

  it('allows cashiers to use tables and tabs once restaurant mode has an open terminal', () => {
    const openRestaurantOptions = { isRestaurant: true, hasOpenTerminal: true };

    expect(canAccessView('cashier', 'tables', openRestaurantOptions)).toBe(true);
    expect(canAccessView('cashier', 'tabs', openRestaurantOptions)).toBe(true);
    expect(canLoadDataset('cashier', 'tables', openRestaurantOptions)).toBe(true);
    expect(buildNavigation('cashier', openRestaurantOptions).primaryNav.map(item => item.id)).toEqual([
      'pos',
      'tables',
      'tabs',
      'history',
      'messages',
    ]);
  });

  it('does not expose cashier tables and tabs outside restaurant mode', () => {
    const retailOptions = { isRestaurant: false, hasOpenTerminal: true };

    expect(canAccessView('cashier', 'tables', retailOptions)).toBe(false);
    expect(canAccessView('cashier', 'tabs', retailOptions)).toBe(false);
    expect(canLoadDataset('cashier', 'tables', retailOptions)).toBe(false);
  });
});
