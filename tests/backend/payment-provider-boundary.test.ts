import { describe, expect, it } from 'vitest';
import {
  getPaymentProviderEvidenceIssues,
  sanitizePaymentProviderEvidence,
} from '../../server/paymentProviderBoundary.js';

describe('payment provider evidence boundary', () => {
  it('accepts approved provider references for card terminals, PayFast, QR, and BNPL rails', () => {
    expect(getPaymentProviderEvidenceIssues({
      method: 'card',
      provider: 'yoco',
      providerDeviceId: 'Yoco-Front-01',
      providerReference: 'YOCO-RECEIPT-123',
      authorizationCode: 'AUTH-123',
    })).toEqual([]);

    expect(getPaymentProviderEvidenceIssues({
      method: 'payfast',
      provider: 'payfast',
      providerReference: 'PFST-ORDER-123',
      providerToken: 'pf_session_123',
    })).toEqual([]);

    expect(getPaymentProviderEvidenceIssues({
      method: 'qr',
      provider: 'snapscan',
      providerReference: 'SS-REF-123',
      qrPayload: 'snapscan://merchant/reference',
    })).toEqual([]);

    expect(getPaymentProviderEvidenceIssues({
      method: 'bnpl',
      provider: 'payflex',
      providerReference: 'PFLEX-APPROVED-123',
    })).toEqual([]);
  });

  it('rejects provider evidence on non-provider payment methods', () => {
    expect(getPaymentProviderEvidenceIssues({
      method: 'cash',
      providerReference: 'CASH-REF-1',
    }).join(' ')).toMatch(/provider evidence can only be stored/i);
  });

  it('rejects token payloads outside approved provider rails', () => {
    expect(getPaymentProviderEvidenceIssues({
      method: 'card',
      provider: 'yoco',
      providerToken: 'terminal-token-123',
    }).join(' ')).toMatch(/provider tokens can only be accepted/i);
  });

  it('rejects PAN, CVV, and track data in persisted provider evidence', () => {
    const panIssues = getPaymentProviderEvidenceIssues({
      method: 'qr',
      provider: 'snapscan',
      providerReference: '4111 1111 1111 1111',
    });
    expect(panIssues.join(' ')).toMatch(/card PAN/i);

    const cvvIssues = getPaymentProviderEvidenceIssues({
      method: 'bnpl',
      provider: 'mobicred',
      providerNote: 'Portal note cvv 123',
    });
    expect(cvvIssues.join(' ')).toMatch(/CVV\/CVC/i);

    const trackIssues = getPaymentProviderEvidenceIssues({
      method: 'card',
      provider: 'yoco',
      providerReference: '%B4111111111111111^CARD/TEST^',
    });
    expect(trackIssues.join(' ')).toMatch(/track data/i);
  });

  it('sanitizes provider evidence down to the fields that may be persisted', () => {
    expect(sanitizePaymentProviderEvidence({
      method: 'qr',
      provider: 'snapscan',
      providerReference: 'SS-REF-123',
      providerToken: 'ignored-token',
      cvv: '123',
    })).toEqual({
      provider: 'snapscan',
      providerDeviceId: null,
      providerReference: 'SS-REF-123',
      authorizationCode: null,
      providerStatus: null,
      providerNote: null,
      qrPayload: null,
    });
  });
});
