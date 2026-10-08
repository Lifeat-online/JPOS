import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

vi.mock('../../src/api', async importOriginal => {
  const actual = await importOriginal<Record<string, unknown>>();
  const stubbed: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(actual)) {
    stubbed[key] = typeof value === 'function' ? vi.fn().mockResolvedValue(null) : value;
  }
  return stubbed;
});

vi.mock('../../src/components/HardwareAdaptersPanel', () => ({ HardwareAdaptersPanel: () => <div>hardware panel</div> }));
vi.mock('../../src/components/ConnectionTargetPanel', () => ({ ConnectionTargetPanel: () => <div>connection panel</div> }));

import { SettingsView } from '../../src/components/SettingsView';

const config: any = {
  payfastMerchantId: '',
  payfastMerchantKey: '',
  payfastPassphrase: '',
  business: { name: 'Test', isRestaurantMode: false },
  categories: {},
};

function renderSettings(search = '') {
  window.history.replaceState(null, '', `/settings${search}`);
  return render(<SettingsView config={config} setConfig={vi.fn()} />);
}

const tabButton = (name: string) => screen.queryByRole('button', { name });

describe('SettingsView tab navigation', () => {
  beforeEach(() => {
    window.history.replaceState(null, '', '/');
  });

  it('activates the tab named in ?tab= on mount', () => {
    renderSettings('?tab=tax');
    expect(tabButton('Tax')?.className).toContain('border-primary');
    expect(tabButton('General')?.className).not.toContain('border-primary text-primary');
    expect(screen.getByText(/Prices Include Tax/i)).toBeInTheDocument();
  });

  it('falls back to General for an unknown tab', () => {
    renderSettings('?tab=nope');
    expect(tabButton('General')?.className).toContain('border-primary text-primary');
  });

  it('updates only the tab param in the URL on tab change', () => {
    renderSettings('?foo=1#section');
    fireEvent.click(screen.getByRole('button', { name: 'Tax' }));
    expect(window.location.pathname).toBe('/settings');
    expect(window.location.search).toContain('foo=1');
    expect(window.location.search).toContain('tab=tax');
    expect(window.location.hash).toBe('#section');
  });

  it('filters tabs by search and selects the first match on Enter', () => {
    renderSettings();
    const search = screen.getByLabelText('Search settings');
    fireEvent.change(search, { target: { value: 'vat' } });
    expect(tabButton('Tax')).toBeInTheDocument();
    expect(tabButton('General')).not.toBeInTheDocument();
    expect(tabButton('Payments')).not.toBeInTheDocument();
    fireEvent.keyDown(search, { key: 'Enter' });
    expect(tabButton('Tax')?.className).toContain('border-primary text-primary');
  });

  it('shows an empty message and restores tabs on Escape', () => {
    renderSettings();
    const search = screen.getByLabelText('Search settings');
    fireEvent.change(search, { target: { value: 'zzzz' } });
    expect(screen.getByText(/No settings match/)).toBeInTheDocument();
    fireEvent.keyDown(search, { key: 'Escape' });
    expect(tabButton('General')).toBeInTheDocument();
    expect(screen.queryByText(/No settings match/)).not.toBeInTheDocument();
  });
});
