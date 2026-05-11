import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { screen, fireEvent, waitFor } from '@testing-library/react';
import { renderWithRouter } from './test-utils.tsx';
import * as api from '../../src/api.js';
import { SetupWizard } from '../../src/components/SetupWizard.tsx';

const user = {
  uid: 'uid_123',
  email: 'admin@example.com',
  displayName: 'Admin User',
};

const config = {
  payfastMerchantId: '10000100',
  payfastMerchantKey: '46f0cd694581a',
  payfastPassphrase: 'jt7v60h69n8a1',
  payfastSandbox: true,
  business: {
    name: '',
    currency: 'R',
  },
};

describe('SetupWizard', () => {
  const originalLocation = window.location;
  let reloadMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    reloadMock = vi.fn();
    delete (window as any).location;
    Object.defineProperty(window, 'location', {
      value: { reload: reloadMock },
      writable: true,
      configurable: true,
    });
  });

  afterEach(() => {
    Object.defineProperty(window, 'location', {
      value: originalLocation,
      writable: true,
      configurable: true,
    });
    vi.restoreAllMocks();
  });

  it('submits setup data and reloads when save succeeds', async () => {
    const setupTenantMock = vi.spyOn(api, 'setupTenant').mockResolvedValue({ tenantId: 'tnt_123' });

    renderWithRouter(<SetupWizard user={user} config={config} />);

    fireEvent.change(screen.getByLabelText(/Business Name/i), { target: { value: 'My Store' } });
    fireEvent.click(screen.getByRole('button', { name: /complete setup/i }));

    await waitFor(() => {
      expect(setupTenantMock).toHaveBeenCalledWith(expect.objectContaining({
        businessName: 'My Store',
        user: expect.objectContaining({ uid: 'uid_123', email: 'admin@example.com' }),
        config: expect.objectContaining({ setupCompleted: true }),
      }));
    });

    await waitFor(() => {
      expect(reloadMock).toHaveBeenCalled();
    });
  });

  it('shows an inline error message if save fails', async () => {
    const setupTenantMock = vi.spyOn(api, 'setupTenant').mockRejectedValue(new Error('Network error'));

    renderWithRouter(<SetupWizard user={user} config={config} />);

    fireEvent.change(screen.getByLabelText(/Business Name/i), { target: { value: 'My Store' } });
    fireEvent.click(screen.getByRole('button', { name: /complete setup/i }));

    await waitFor(() => {
      expect(setupTenantMock).toHaveBeenCalled();
      expect(screen.getByRole('alert')).toHaveTextContent(/Unable to save setup/i);
      expect(reloadMock).not.toHaveBeenCalled();
    });
  });
});
