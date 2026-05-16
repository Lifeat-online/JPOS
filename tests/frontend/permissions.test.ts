import { describe, expect, it } from 'vitest';
import { buildNavigation, canAccessView, canLoadDataset } from '../../src/permissions';

describe('role permissions', () => {
  it('keeps restaurant operational views hidden until a terminal is open', () => {
    const closedOptions = { isRestaurant: true, hasOpenTerminal: false };

    for (const role of ['admin', 'manager', 'dev', 'cashier', 'chef'] as const) {
      expect(canAccessView(role, 'tables', closedOptions)).toBe(false);
      expect(canAccessView(role, 'tabs', closedOptions)).toBe(false);
      expect(canAccessView(role, 'workstation', closedOptions)).toBe(false);
      expect(buildNavigation(role, closedOptions).primaryNav.map(item => item.id)).not.toContain('tables');
      expect(buildNavigation(role, closedOptions).primaryNav.map(item => item.id)).not.toContain('tabs');
      expect(buildNavigation(role, closedOptions).primaryNav.map(item => item.id)).not.toContain('workstation');
    }

    expect(canLoadDataset('admin', 'tables', closedOptions)).toBe(false);
    expect(canLoadDataset('admin', 'workstations', closedOptions)).toBe(false);
  });

  it('allows restaurant operational views once restaurant mode has an open terminal', () => {
    const openRestaurantOptions = { isRestaurant: true, hasOpenTerminal: true };

    expect(canAccessView('cashier', 'tables', openRestaurantOptions)).toBe(true);
    expect(canAccessView('cashier', 'tabs', openRestaurantOptions)).toBe(true);
    expect(canAccessView('admin', 'workstation', openRestaurantOptions)).toBe(true);
    expect(canAccessView('chef', 'workstation', openRestaurantOptions)).toBe(true);
    expect(canLoadDataset('cashier', 'tables', openRestaurantOptions)).toBe(true);
    expect(canLoadDataset('chef', 'workstations', openRestaurantOptions)).toBe(true);
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
    expect(canAccessView('admin', 'workstation', retailOptions)).toBe(false);
    expect(canAccessView('chef', 'workstation', retailOptions)).toBe(false);
    expect(canLoadDataset('cashier', 'tables', retailOptions)).toBe(false);
    expect(canLoadDataset('chef', 'workstations', retailOptions)).toBe(false);
  });
});
