import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as dbModule from '../../server/db.js';
import { recordAuditEventSafe } from '../../server/audit.js';
import {
  buildHardwareCommand,
  createHardwareDevice,
  queueCashDrawerPulseForNoSale,
  queueKitchenPrintJobsForSale,
  testHardwareDevice,
  type HardwareDevice,
} from '../../server/hardwareAdapters.js';

vi.mock('../../server/db.js', () => ({
  query: vi.fn(),
}));

vi.mock('../../server/audit.js', async () => {
  const actual = await vi.importActual<any>('../../server/audit.js');
  return {
    ...actual,
    recordAuditEventSafe: vi.fn(),
  };
});

function device(overrides: Partial<HardwareDevice> = {}): HardwareDevice {
  return {
    id: 'hwd_1',
    tenantId: 'tenant_1',
    name: 'Hardware',
    deviceType: 'receipt_printer',
    connectionType: 'browser_print',
    status: 'active',
    workstationId: null,
    isDefault: false,
    connectionConfig: {},
    capabilities: [],
    ...overrides,
  };
}

function deviceRow(overrides: Record<string, any> = {}) {
  return {
    id: 'hwd_1',
    tenant_id: 'tenant_1',
    name: 'Hardware',
    device_type: 'receipt_printer',
    connection_type: 'browser_print',
    status: 'active',
    workstation_id: null,
    is_default: 0,
    connection_config: '{}',
    capabilities: '[]',
    ...overrides,
  };
}

describe('hardware adapters', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (dbModule.query as any).mockResolvedValue([]);
  });

  it('builds ESC/POS kitchen tickets and cash drawer pulse commands', () => {
    const kitchenCommand = buildHardwareCommand(device({
      deviceType: 'kitchen_printer',
      connectionType: 'escpos_network',
      connectionConfig: { host: '10.0.0.24', port: 9100 },
    }), {
      sale: { id: 'sale_1', tableNumber: 'A1' },
      items: [{ name: 'Burger', quantity: 2 }],
      businessName: 'Jimmy POS',
    }) as any;

    expect(kitchenCommand).toMatchObject({
      commandType: 'escpos_kitchen_ticket',
      transport: 'escpos_network',
      readiness: { ok: true },
    });
    expect(kitchenCommand.payloadHex).toContain('1b40');
    expect(kitchenCommand.previewText).toContain('2 x Burger');

    const drawerCommand = buildHardwareCommand(device({
      deviceType: 'cash_drawer',
      connectionType: 'escpos_usb',
    })) as any;

    expect(drawerCommand).toMatchObject({
      commandType: 'escpos_drawer_pulse',
      payloadHex: '1b700019fa',
      pulseMs: 250,
    });
  });

  it('builds readiness commands for scale, scanner, pole display, and card terminal adapters', () => {
    const scaleCommand = buildHardwareCommand(device({
      deviceType: 'scale',
      connectionType: 'webserial',
      connectionConfig: { baudRate: 9600, protocol: 'nci', unit: 'kg' },
    })) as any;
    expect(scaleCommand).toMatchObject({ commandType: 'scale_read_weight', request: 'W\r\n', expectedUnit: 'kg' });

    const scannerCommand = buildHardwareCommand(device({
      deviceType: 'barcode_scanner',
      connectionType: 'keyboard_wedge',
    })) as any;
    expect(scannerCommand).toMatchObject({ commandType: 'barcode_scanner_readiness', inputMode: 'focused-input' });

    const poleCommand = buildHardwareCommand(device({
      deviceType: 'pole_display',
      connectionType: 'webhid',
    }), { lines: ['Welcome', 'Total R42.00'] }) as any;
    expect(poleCommand).toMatchObject({ commandType: 'pole_display_write', lines: ['Welcome', 'Total R42.00'] });
    expect(poleCommand.payloadHex).toMatch(/^0c/);

    const terminalCommand = buildHardwareCommand(device({
      deviceType: 'card_terminal',
      connectionType: 'payment_provider',
      connectionConfig: { provider: 'yoco', providerDeviceId: 'front-terminal' },
    })) as any;
    expect(terminalCommand).toMatchObject({
      commandType: 'card_terminal_pairing_check',
      provider: 'yoco',
      providerDeviceId: 'front-terminal',
      readiness: { ok: true },
    });
  });

  it('creates hardware devices with sanitized connection config and audit evidence', async () => {
    (dbModule.query as any).mockImplementation((sql: string, params: any[]) => {
      if (String(sql).includes('FROM hardware_devices')) {
        return Promise.resolve([deviceRow({
          id: params[1],
          name: 'Front receipt printer',
          device_type: 'receipt_printer',
          connection_type: 'escpos_network',
          is_default: 1,
          connection_config: JSON.stringify({ host: '10.0.0.20', port: 9100 }),
          capabilities: JSON.stringify(['escpos_print']),
        })]);
      }
      return Promise.resolve([]);
    });

    const created = await createHardwareDevice('tenant_1', {
      name: 'Front receipt printer',
      deviceType: 'receipt_printer',
      connectionType: 'escpos_network',
      isDefault: true,
      connectionConfig: {
        host: '10.0.0.20',
        port: 9100,
        apiKey: 'secret-key',
        password: 'drawer-password',
      },
    }, { staffId: 'mgr_1', staffName: 'Manager' });

    const insertCall = (dbModule.query as any).mock.calls.find(([sql]: any[]) => String(sql).includes('INSERT INTO hardware_devices'));
    expect(insertCall).toBeTruthy();
    const storedConfig = JSON.parse(insertCall[1][8]);
    expect(storedConfig).toEqual({ host: '10.0.0.20', port: 9100 });
    expect(JSON.stringify(storedConfig)).not.toContain('secret-key');
    expect(JSON.stringify(storedConfig)).not.toContain('drawer-password');
    expect(created).toMatchObject({
      tenantId: 'tenant_1',
      name: 'Front receipt printer',
      connectionConfig: { host: '10.0.0.20', port: 9100 },
    });
    expect(recordAuditEventSafe).toHaveBeenCalledWith(expect.objectContaining({
      action: 'hardware.device_created',
      entityType: 'hardware_device',
    }));
  });

  it('records failed readiness checks for incomplete network printer configuration', async () => {
    (dbModule.query as any).mockImplementation((sql: string) => {
      if (String(sql).includes('FROM hardware_devices')) {
        return Promise.resolve([deviceRow({
          id: 'printer_1',
          name: 'Kitchen printer',
          device_type: 'kitchen_printer',
          connection_type: 'escpos_network',
          is_default: 1,
          connection_config: '{}',
        })]);
      }
      return Promise.resolve([]);
    });

    const result = await testHardwareDevice('tenant_1', 'printer_1', { staffId: 'mgr_1' }, {
      sale: { id: 'sale_1' },
      items: [{ name: 'Toast', quantity: 1 }],
    });

    expect(result).toMatchObject({
      ready: false,
      message: 'Network ESC/POS devices need a host/IP address.',
    });
    const eventCall = (dbModule.query as any).mock.calls.find(([sql]: any[]) => String(sql).includes('INSERT INTO hardware_device_events'));
    expect(eventCall[1][5]).toBe('failed');
    expect(eventCall[1][8]).toBe('Network ESC/POS devices need a host/IP address.');

    const updateCall = (dbModule.query as any).mock.calls.find(([sql]: any[]) => String(sql).includes('SET last_check_status = ?'));
    expect(updateCall[1][0]).toBe('attention');
  });

  it('routes kitchen tickets to workstation printers and default fallback printers', async () => {
    (dbModule.query as any).mockImplementation((sql: string) => {
      if (String(sql).includes('FROM hardware_devices')) {
        return Promise.resolve([
          deviceRow({
            id: 'printer_default',
            name: 'Kitchen default',
            device_type: 'kitchen_printer',
            connection_type: 'escpos_network',
            is_default: 1,
            connection_config: JSON.stringify({ host: '10.0.0.10', port: 9100 }),
          }),
          deviceRow({
            id: 'printer_bar',
            name: 'Bar printer',
            device_type: 'kitchen_printer',
            connection_type: 'escpos_network',
            workstation_id: 'ws_bar',
            is_default: 0,
            connection_config: JSON.stringify({ host: '10.0.0.11', port: 9100 }),
          }),
        ]);
      }
      return Promise.resolve([]);
    });

    const jobs = await queueKitchenPrintJobsForSale('tenant_1', {
      id: 'sale_1',
      tableNumber: 'T3',
      items: [
        { name: 'Coffee', quantity: 1, workstationId: 'ws_bar' },
        { name: 'Burger', quantity: 1, workstationId: 'ws_kitchen' },
      ],
    }, { staffId: 'cashier_1' });

    expect(jobs).toHaveLength(2);
    expect(jobs.find(job => job.workstationId === 'ws_bar')?.device?.id).toBe('printer_bar');
    expect(jobs.find(job => job.workstationId === 'ws_kitchen')?.device?.id).toBe('printer_default');
    const eventCalls = (dbModule.query as any).mock.calls.filter(([sql]: any[]) => String(sql).includes('INSERT INTO hardware_device_events'));
    expect(eventCalls).toHaveLength(2);
    expect(eventCalls.map(([, params]: any[]) => params[5])).toEqual(['queued', 'queued']);
  });

  it('queues a configured cash drawer pulse for no-sale drawer opens', async () => {
    (dbModule.query as any).mockImplementation((sql: string) => {
      if (String(sql).includes('FROM hardware_devices')) {
        return Promise.resolve([deviceRow({
          id: 'drawer_1',
          name: 'Front drawer',
          device_type: 'cash_drawer',
          connection_type: 'escpos_usb',
          is_default: 1,
        })]);
      }
      return Promise.resolve([]);
    });

    const job = await queueCashDrawerPulseForNoSale('tenant_1', { staffId: 'cashier_1' }, {
      cashSessionId: 'session_1',
      movementId: 'move_1',
      reason: 'Check drawer',
    });

    expect(job).toMatchObject({
      status: 'queued',
      device: { id: 'drawer_1' },
      command: { commandType: 'escpos_drawer_pulse', payloadHex: '1b700019fa' },
    });
    const eventCall = (dbModule.query as any).mock.calls.find(([sql]: any[]) => String(sql).includes('INSERT INTO hardware_device_events'));
    expect(eventCall[1]).toEqual(expect.arrayContaining(['tenant_1', 'drawer_1', 'hardware.cash_drawer_pulse', 'escpos_drawer_pulse', 'queued']));
  });
});
