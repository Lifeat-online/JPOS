import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { exportVendorsBatchCsv, importStaffBatch, importVendorsBatch } from '../../src/api';

function jsonResponse(body: unknown) {
  return new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } });
}

describe('vendor and staff batch API', () => {
  beforeEach(() => {
    window.localStorage.setItem('masepos_access_token', 'access-token');
  });

  afterEach(() => {
    window.localStorage.clear();
    vi.unstubAllGlobals();
  });

  it('posts vendor imports', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ created: 1 }));
    vi.stubGlobal('fetch', fetchMock);
    await importVendorsBatch('t1', { csv: 'a', dryRun: true });
    expect(String(fetchMock.mock.calls[0][0])).toMatch(/\/api\/data\/tenants\/t1\/vendors\/batch\/import$/);
    expect(fetchMock.mock.calls[0][1].method).toBe('POST');
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ csv: 'a', dryRun: true });
  });

  it('posts staff imports', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ created: 1 }));
    vi.stubGlobal('fetch', fetchMock);
    await importStaffBatch('t1', { csv: 'a' });
    expect(String(fetchMock.mock.calls[0][0])).toMatch(/\/api\/data\/tenants\/t1\/staff\/batch\/import$/);
  });

  it('gets vendor exports', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ csv: '', count: 0 }));
    vi.stubGlobal('fetch', fetchMock);
    await exportVendorsBatchCsv('t1');
    expect(String(fetchMock.mock.calls[0][0])).toMatch(/\/api\/data\/tenants\/t1\/vendors\/batch\/export$/);
  });
});
