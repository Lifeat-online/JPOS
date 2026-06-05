import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { batchCreateProducts, getTenantProducts } from '../../src/api';
import { setPreferredApiTarget } from '../../src/apiConfig';

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('hybrid API fetch behavior', () => {
  beforeEach(() => {
    vi.stubEnv('VITE_DEPLOYMENT_MODE', 'hybrid');
    vi.stubEnv('VITE_ON_PREM_API_BASE_URL', 'http://pos-box.local:8080');
    vi.stubEnv('VITE_CLOUD_API_BASE_URL', 'https://cloud.masepos.test');
    window.localStorage.setItem('masepos_access_token', 'access-token');
  });

  afterEach(() => {
    setPreferredApiTarget(null);
    window.localStorage.clear();
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it('fails safe GET requests over to the cloud target after an on-prem network error', async () => {
    const fetchMock = vi.fn()
      .mockRejectedValueOnce(new TypeError('Failed to fetch'))
      .mockResolvedValueOnce(jsonResponse([{ id: 'prod_1', name: 'Coffee' }]));
    vi.stubGlobal('fetch', fetchMock);

    const products = await getTenantProducts('tenant_1');

    expect(products).toEqual([{ id: 'prod_1', name: 'Coffee' }]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[0][0]).toBe('http://pos-box.local:8080/api/mariadb/tenants/tenant_1/products');
    expect(fetchMock.mock.calls[1][0]).toBe('https://cloud.masepos.test/api/mariadb/tenants/tenant_1/products');
  });

  it('fails safe GET requests over after a transient gateway response', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response('local gateway down', { status: 503 }))
      .mockResolvedValueOnce(jsonResponse([{ id: 'prod_2', name: 'Tea' }]));
    vi.stubGlobal('fetch', fetchMock);

    const products = await getTenantProducts('tenant_1');

    expect(products).toEqual([{ id: 'prod_2', name: 'Tea' }]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[1][0]).toBe('https://cloud.masepos.test/api/mariadb/tenants/tenant_1/products');
  });

  it('does not fail mutating requests over to another target', async () => {
    const fetchMock = vi.fn().mockRejectedValueOnce(new TypeError('Failed to fetch'));
    vi.stubGlobal('fetch', fetchMock);

    await expect(batchCreateProducts('tenant_1', { rows: [], dryRun: true })).rejects.toThrow('Failed to fetch');

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toBe('http://pos-box.local:8080/api/mariadb/tenants/tenant_1/batch/products/create');
  });
});
