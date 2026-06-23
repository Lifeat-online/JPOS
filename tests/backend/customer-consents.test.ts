import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as dbModule from '../../server/db.js';
import { recordAuditEventSafe } from '../../server/audit.js';
import { listTenantCustomerConsents, upsertCustomerConsents } from '../../server/customerConsents.js';

vi.mock('../../server/db.js', () => ({
  query: vi.fn(),
}));

vi.mock('../../server/audit.js', () => ({
  recordAuditEventSafe: vi.fn(),
}));

describe('customer consent tracking', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('groups tenant consent rows and fills unknown defaults for missing categories', async () => {
    (dbModule.query as any).mockResolvedValueOnce([
      {
        customerId: 'cust_1',
        consentType: 'marketing',
        status: 'granted',
        source: 'customer_profile',
        capturedBy: 'staff_1',
        capturedByName: 'Manager',
      },
    ]);

    const consents = await listTenantCustomerConsents('tenant_1');

    expect(dbModule.query).toHaveBeenCalledWith(expect.stringContaining('FROM customer_consents'), ['tenant_1']);
    expect(consents.get('cust_1')?.marketing.status).toBe('granted');
    expect(consents.get('cust_1')?.loyalty.status).toBe('unknown');
    expect(consents.get('cust_1')?.stored_contact_details.status).toBe('unknown');
  });

  it('upserts current consent records, appends history events, and records an audit event', async () => {
    (dbModule.query as any)
      .mockResolvedValueOnce([{ status: 'unknown' }])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ status: 'denied' }])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        { consentType: 'marketing', status: 'granted', source: 'customer_profile' },
        { consentType: 'stored_contact_details', status: 'granted', source: 'customer_profile' },
      ]);

    const consents = await upsertCustomerConsents('tenant_1', 'cust_1', {
      marketing: { status: 'granted', source: 'customer_profile', note: 'Verbal consent' },
      stored_contact_details: { status: 'granted', source: 'customer_profile' },
      invalid_key: { status: 'granted' },
    }, {
      staffId: 'staff_1',
      staffName: 'Manager',
    });

    const sqlCalls = (dbModule.query as any).mock.calls.map((call: any[]) => String(call[0]));
    expect(sqlCalls.filter((sql: string) => sql.includes('INSERT INTO customer_consents'))).toHaveLength(2);
    expect(sqlCalls.filter((sql: string) => sql.includes('INSERT INTO customer_consent_events'))).toHaveLength(2);
    expect(consents.marketing.status).toBe('granted');
    expect(consents.stored_contact_details.status).toBe('granted');
    expect(recordAuditEventSafe).toHaveBeenCalledWith(expect.objectContaining({
      tenantId: 'tenant_1',
      action: 'customer.consent_updated',
      entityType: 'customer',
      entityId: 'cust_1',
      customerId: 'cust_1',
      staffId: 'staff_1',
      source: 'customer_admin',
      details: expect.objectContaining({
        changes: expect.arrayContaining([
          expect.objectContaining({ consentType: 'marketing', previousStatus: 'unknown', status: 'granted' }),
          expect.objectContaining({ consentType: 'stored_contact_details', previousStatus: 'denied', status: 'granted' }),
        ]),
      }),
    }));
  });
});
