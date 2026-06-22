import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as dbModule from '../../server/db.js';
import * as aiModule from '../../server/ai.js';
import * as adapterModule from '../../server/db-adapter.js';
import * as crudModule from '../../server/db-crud.js';
import { applyApprovedInventoryAgentSteps, generateInventoryAgentProposal } from '../../server/aiInventoryAgent.js';

vi.mock('../../server/db.js', () => ({
  query: vi.fn(),
}));

vi.mock('../../server/ai.js', () => ({
  extractInvoiceWithAi: vi.fn(),
}));

vi.mock('../../server/db-adapter.js', () => ({
  getProductsByTenant: vi.fn(),
}));

vi.mock('../../server/db-crud.js', () => ({
  createBulkItem: vi.fn(),
  createProduct: vi.fn(),
  createPurchaseOrder: vi.fn(),
  createVendor: vi.fn(),
  getBulkItems: vi.fn(),
  getVendors: vi.fn(),
  receivePurchaseOrder: vi.fn(),
}));

describe('AI inventory agent run persistence', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (dbModule.query as any).mockResolvedValue([]);
    (aiModule.extractInvoiceWithAi as any).mockResolvedValue(null);
    (adapterModule.getProductsByTenant as any).mockResolvedValue([]);
    (crudModule.getBulkItems as any).mockResolvedValue([]);
    (crudModule.getVendors as any).mockResolvedValue([]);
  });

  it('persists generated proposals as agent runs with one row per step', async () => {
    (adapterModule.getProductsByTenant as any).mockResolvedValue([
      { id: 'prod_1', name: 'Milk', stock: 1, minStock: 5, costPrice: 10, price: 15 },
    ]);
    (crudModule.getVendors as any).mockResolvedValue([{ id: 'vendor_1', name: 'Supplier', status: 'active' }]);
    (dbModule.query as any).mockImplementation((sql: string) => {
      if (sql.includes('FROM sale_items')) return Promise.resolve([]);
      return Promise.resolve([]);
    });

    const proposal = await generateInventoryAgentProposal('tenant_1', { mode: 'low_stock' }, {
      actor: { staffId: 'mgr_1', staffName: 'Manager' },
    });

    expect(proposal.runId).toBe(proposal.id);
    expect(proposal.steps).toHaveLength(1);
    expect(dbModule.query).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO ai_agent_runs'),
      expect.arrayContaining(['tenant_1', 'low_stock', 'draft', proposal.summary, 1, 'mgr_1', 'Manager'])
    );
    expect(dbModule.query).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO ai_agent_run_steps'),
      expect.arrayContaining(['tenant_1', proposal.id, proposal.steps[0].id, 'create_purchase_order'])
    );
    expect(dbModule.query).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO ai_audit_log'),
      expect.arrayContaining(['tenant_1', 'inventory.proposal_generated', 'mgr_1', 'inventory_agent', 'draft'])
    );
  });

  it('applies stored run payloads and persists per-step outcomes', async () => {
    (crudModule.createPurchaseOrder as any).mockResolvedValue({ id: 'po_1', status: 'draft' });
    (crudModule.receivePurchaseOrder as any).mockResolvedValue({ id: 'po_1', status: 'received' });
    (dbModule.query as any).mockImplementation((sql: string) => {
      if (sql.includes('FROM ai_agent_runs')) {
        return Promise.resolve([{ id: 'agent_1', status: 'draft', applyResult: '{}' }]);
      }
      if (sql.includes('FROM ai_agent_run_steps')) {
        return Promise.resolve([
          {
            id: 'step_po',
            type: 'create_purchase_order',
            label: 'Stored PO',
            confidence: 0.8,
            risk: 'medium',
            approved: 0,
            payload: JSON.stringify({
              vendorId: 'vendor_1',
              items: [{ productId: 'prod_stored', productName: 'Stored Item', quantity: 2, expectedPrice: 30 }],
            }),
            evidence: JSON.stringify(['Stored evidence']),
          },
          {
            id: 'step_receive',
            type: 'receive_invoice',
            label: 'Receive invoice',
            confidence: 0.7,
            risk: 'medium',
            approved: 0,
            payload: JSON.stringify({ invoiceNumber: 'INV-100', invoiceDate: '2026-05-01' }),
            evidence: JSON.stringify([]),
          },
          {
            id: 'step_book',
            type: 'book_stock',
            label: 'Book stock',
            confidence: 0.6,
            risk: 'high',
            approved: 0,
            payload: JSON.stringify({ source: 'stored' }),
            evidence: JSON.stringify([]),
          },
        ]);
      }
      return Promise.resolve([]);
    });

    const result = await applyApprovedInventoryAgentSteps('tenant_1', [
      {
        id: 'step_po',
        type: 'create_purchase_order',
        label: 'Tampered PO',
        confidence: 0.1,
        risk: 'high',
        approved: true,
        payload: { vendorId: 'vendor_bad', items: [{ productId: 'prod_bad', productName: 'Bad', quantity: 99, expectedPrice: 1 }] },
        evidence: [],
      },
      {
        id: 'step_receive',
        type: 'receive_invoice',
        label: 'Receive invoice',
        confidence: 0.6,
        risk: 'high',
        approved: true,
        payload: { invoiceNumber: 'TAMPERED' },
        evidence: [],
      },
      {
        id: 'step_book',
        type: 'book_stock',
        label: 'Book stock',
        confidence: 0.6,
        risk: 'high',
        approved: true,
        payload: {},
        evidence: [],
      },
    ] as any, {
      runId: 'agent_1',
      actor: { staffId: 'mgr_1', staffName: 'Manager' },
    });

    expect(crudModule.createPurchaseOrder).toHaveBeenCalledWith('tenant_1', expect.objectContaining({
      vendorId: 'vendor_1',
      items: [{ productId: 'prod_stored', productName: 'Stored Item', quantity: 2, expectedPrice: 30 }],
      totalAmount: 60,
    }));
    expect(crudModule.receivePurchaseOrder).toHaveBeenCalledTimes(1);
    expect(crudModule.receivePurchaseOrder).toHaveBeenCalledWith(
      'tenant_1',
      'po_1',
      expect.objectContaining({
        invoiceNumber: 'INV-100',
        invoiceDate: '2026-05-01',
        items: [
          expect.objectContaining({
            lineIndex: 0,
            productId: 'prod_stored',
            receivedQuantity: 2,
            receivedPrice: 30,
          }),
        ],
      }),
      expect.objectContaining({ staffId: 'mgr_1', staffName: 'Manager' })
    );
    expect(result.applied).toEqual(expect.arrayContaining([
      expect.objectContaining({ stepId: 'step_po', type: 'create_purchase_order' }),
      expect.objectContaining({ stepId: 'step_receive', type: 'receive_invoice' }),
    ]));
    expect(result.skipped).toEqual(expect.arrayContaining([
      expect.objectContaining({ stepId: 'step_book', type: 'book_stock', reason: expect.stringContaining('already received') }),
    ]));
    expect(dbModule.query).toHaveBeenCalledWith(
      expect.stringContaining('UPDATE ai_agent_run_steps SET'),
      expect.arrayContaining(['applied'])
    );
    expect(dbModule.query).toHaveBeenCalledWith(
      expect.stringContaining('UPDATE ai_agent_runs SET'),
      expect.arrayContaining(['completed'])
    );
  });

  it('keeps receive and book-stock steps out of full autopilot', async () => {
    (dbModule.query as any).mockImplementation((sql: string) => {
      if (sql.includes('FROM ai_agent_runs')) {
        return Promise.resolve([{ id: 'agent_auto', status: 'draft', applyResult: '{}' }]);
      }
      if (sql.includes('FROM ai_agent_run_steps')) {
        return Promise.resolve([
          {
            id: 'step_receive',
            type: 'receive_invoice',
            label: 'Receive invoice',
            confidence: 0.7,
            risk: 'medium',
            approved: 0,
            payload: JSON.stringify({ purchaseOrderId: 'po_1', invoiceNumber: 'INV-200' }),
            evidence: JSON.stringify([]),
          },
          {
            id: 'step_book',
            type: 'book_stock',
            label: 'Book stock',
            confidence: 0.6,
            risk: 'high',
            approved: 0,
            payload: JSON.stringify({ purchaseOrderId: 'po_1' }),
            evidence: JSON.stringify([]),
          },
        ]);
      }
      return Promise.resolve([]);
    });

    const result = await applyApprovedInventoryAgentSteps('tenant_1', [], {
      runId: 'agent_auto',
      fullAutopilot: true,
      actor: { staffId: 'dev_1', staffName: 'Dev' },
    });

    expect(crudModule.receivePurchaseOrder).not.toHaveBeenCalled();
    expect(result.skipped).toEqual(expect.arrayContaining([
      expect.objectContaining({ stepId: 'step_receive', reason: expect.stringContaining('explicit manager approval') }),
      expect.objectContaining({ stepId: 'step_book', reason: expect.stringContaining('explicit manager approval') }),
    ]));
  });

  it('returns completed run results without reapplying mutations', async () => {
    (dbModule.query as any).mockImplementation((sql: string) => {
      if (sql.includes('FROM ai_agent_runs')) {
        return Promise.resolve([{
          id: 'agent_done',
          status: 'completed',
          applyResult: JSON.stringify({ applied: [{ stepId: 'step_po', type: 'create_purchase_order', result: { id: 'po_1' } }], skipped: [] }),
        }]);
      }
      return Promise.resolve([]);
    });

    const result = await applyApprovedInventoryAgentSteps('tenant_1', [
      { id: 'step_po', type: 'create_purchase_order', label: 'PO', confidence: 1, risk: 'low', approved: true, payload: { items: [] }, evidence: [] },
    ] as any, { runId: 'agent_done' });

    expect(result.alreadyCompleted).toBe(true);
    expect(result.applied[0]).toMatchObject({ stepId: 'step_po' });
    expect(crudModule.createPurchaseOrder).not.toHaveBeenCalled();
  });
});
