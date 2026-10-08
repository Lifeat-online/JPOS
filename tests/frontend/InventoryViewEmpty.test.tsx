import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, fireEvent, waitFor } from '@testing-library/react';
import { renderWithRouter } from './test-utils.tsx';

vi.mock('../../src/api.js', () => ({
  seedProducts: vi.fn().mockResolvedValue({}),
  createIntegrationApiKey: vi.fn(),
  exportEcommerceMarketplacePack: vi.fn(),
  getIntegrationApiKeys: vi.fn().mockResolvedValue([]),
  getIntegrationWebhookEvents: vi.fn().mockResolvedValue([]),
  requestStockAdjustment: vi.fn(),
  revokeIntegrationApiKey: vi.fn(),
}));

import * as api from '../../src/api.js';
import { InventoryView } from '../../src/views/InventoryView.tsx';
import { usePosStore } from '../../src/store/usePosStore.ts';
import { SAMPLE_PRODUCTS } from '../../src/utils/sampleProducts.ts';

describe('InventoryView empty catalog', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    usePosStore.setState({ tenantId: 't1', currentUserStaff: { id: 's1', role: 'admin' } } as any);
  });

  it('offers sample products and seeds the cafe list', async () => {
    const onProductsUpdated = vi.fn();
    renderWithRouter(
      <InventoryView products={[]} config={{} as any} onEditProduct={vi.fn()} onAddProduct={vi.fn()} onProductsUpdated={onProductsUpdated} />,
    );
    expect(screen.getByText('Your catalog is empty')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Café' }));
    fireEvent.click(screen.getByRole('button', { name: /Load 8 sample products/ }));
    await waitFor(() => expect(api.seedProducts).toHaveBeenCalledWith('t1', SAMPLE_PRODUCTS.cafe));
    await waitFor(() => expect(onProductsUpdated).toHaveBeenCalled());
  });
});
