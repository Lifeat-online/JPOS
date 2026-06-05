import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as dbModule from '../../server/db.js';
import * as auditModule from '../../server/audit.js';
import { createEventBooking, deleteEventBooking, listEventBookings, updateEventBooking } from '../../server/eventBookings.js';

vi.mock('../../server/db.js', () => ({
  query: vi.fn(),
}));

vi.mock('../../server/audit.js', () => ({
  recordAuditEvent: vi.fn(),
}));

describe('event bookings', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (auditModule.recordAuditEvent as any).mockResolvedValue('audit_1');
  });

  it('lists bookings with calendar filters and parsed table labels', async () => {
    (dbModule.query as any).mockResolvedValue([
      {
        id: 'event_1',
        tenantId: 'tenant_1',
        title: 'Birthday',
        eventType: 'private',
        status: 'confirmed',
        startAt: '2026-06-10T12:00:00.000Z',
        guestCount: '24',
        tableNumbers: '["Patio","A1"]',
        tableIds: '["table_patio","table_a1"]',
        depositAmount: '500',
        depositStatus: 'paid',
        depositDueAt: '2026-06-08T12:00:00.000Z',
        depositPaidAt: '2026-06-07T12:00:00.000Z',
        depositReference: 'DEP-1',
        reminderAt: '2026-06-09T10:00:00.000Z',
        reminderStatus: 'pending',
      },
    ]);

    const rows = await listEventBookings('tenant_1', {
      from: '2026-06-01',
      to: '2026-06-30',
      status: 'confirmed',
    });

    expect(dbModule.query).toHaveBeenCalledWith(
      expect.stringContaining('FROM event_bookings'),
      ['tenant_1', '2026-06-01', '2026-06-30', 'confirmed']
    );
    expect(rows[0]).toMatchObject({
      id: 'event_1',
      tableNumbers: ['Patio', 'A1'],
      tableIds: ['table_patio', 'table_a1'],
      guestCount: 24,
      depositAmount: 500,
      depositReference: 'DEP-1',
      reminderStatus: 'pending',
    });
  });

  it('creates audited event bookings', async () => {
    (dbModule.query as any).mockImplementation((sql: string) => {
      if (sql.includes('INSERT INTO event_bookings')) return Promise.resolve({});
      if (sql.includes('FROM event_bookings')) {
        return Promise.resolve([{ id: 'event_1', tenant_id: 'tenant_1', title: 'Birthday', event_type: 'private', status: 'confirmed', start_at: '2026-06-10 12:00:00', table_numbers: '["Patio"]' }]);
      }
      return Promise.resolve([]);
    });

    const booking = await createEventBooking('tenant_1', {
      title: 'Birthday',
      status: 'confirmed',
      startAt: '2026-06-10T12:00',
      guestCount: 24,
      tableNumbers: ['Patio'],
      depositAmount: 500,
      depositStatus: 'paid',
      staffId: 'mgr_1',
      staffName: 'Manager',
    });

    expect(dbModule.query).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO event_bookings'),
      expect.arrayContaining(['tenant_1', 'Birthday', 'private', 'confirmed', '2026-06-10T12:00', 24, '["Patio"]', 500, 'paid'])
    );
    expect(auditModule.recordAuditEvent).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
      action: 'event_booking.created',
      staffId: 'mgr_1',
    }));
    expect(booking).toMatchObject({ id: 'event_1', title: 'Birthday' });
  });

  it('creates restaurant reservations with customer, table, deposit, and reminder links', async () => {
    (dbModule.query as any).mockImplementation((sql: string) => {
      if (sql.includes('FROM customers')) {
        return Promise.resolve([{ id: 'cust_1', name: 'Jane Diner', phone: '0821234567', email: 'jane@example.com' }]);
      }
      if (sql.includes('FROM restaurant_tables')) {
        return Promise.resolve([{ id: 'table_1', label: 'Table 1' }]);
      }
      if (sql.includes("status IN ('confirmed','in_progress')")) {
        return Promise.resolve([]);
      }
      if (sql.includes('INSERT INTO event_bookings')) return Promise.resolve({});
      if (sql.includes('FROM event_bookings')) {
        return Promise.resolve([{
          id: 'event_1',
          tenant_id: 'tenant_1',
          customer_id: 'cust_1',
          customer_name: 'Jane Diner',
          contact_phone: '0821234567',
          contact_email: 'jane@example.com',
          title: 'Dinner reservation',
          event_type: 'restaurant',
          status: 'confirmed',
          start_at: '2026-06-10T18:00:00.000Z',
          end_at: '2026-06-10T20:00:00.000Z',
          guest_count: 4,
          table_numbers: '["Table 1"]',
          table_ids: '["table_1"]',
          deposit_amount: '200',
          deposit_status: 'unpaid',
          deposit_due_at: '2026-06-09T12:00:00.000Z',
          deposit_reference: 'DEP-100',
          reminder_at: '2026-06-09T10:00:00.000Z',
          reminder_status: 'pending',
        }]);
      }
      return Promise.resolve([]);
    });

    const booking = await createEventBooking('tenant_1', {
      title: 'Dinner reservation',
      eventType: 'restaurant',
      status: 'confirmed',
      customerId: 'cust_1',
      startAt: '2026-06-10T18:00:00.000Z',
      endAt: '2026-06-10T20:00:00.000Z',
      guestCount: 4,
      tableIds: ['table_1'],
      depositAmount: 200,
      depositDueAt: '2026-06-09T12:00:00.000Z',
      depositReference: 'DEP-100',
      reminderAt: '2026-06-09T10:00:00.000Z',
      staffId: 'mgr_1',
    });

    expect(dbModule.query).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO event_bookings'),
      expect.arrayContaining([
        'tenant_1',
        'cust_1',
        'Jane Diner',
        '0821234567',
        'jane@example.com',
        'Dinner reservation',
        'restaurant',
        'confirmed',
        '["Table 1"]',
        '["table_1"]',
        200,
        'unpaid',
        '2026-06-09T12:00:00.000Z',
        'DEP-100',
        '2026-06-09T10:00:00.000Z',
        'pending',
      ])
    );
    expect(auditModule.recordAuditEvent).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
      action: 'event_booking.created',
      customerId: 'cust_1',
      details: expect.objectContaining({
        tableIds: ['table_1'],
        tableNumbers: ['Table 1'],
        depositStatus: 'unpaid',
        reminderStatus: 'pending',
      }),
    }));
    expect(booking).toMatchObject({
      customerName: 'Jane Diner',
      tableIds: ['table_1'],
      tableNumbers: ['Table 1'],
      depositStatus: 'unpaid',
      reminderStatus: 'pending',
    });
  });

  it('rejects confirmed table reservations that overlap an existing confirmed booking', async () => {
    (dbModule.query as any).mockImplementation((sql: string) => {
      if (sql.includes('FROM restaurant_tables')) {
        return Promise.resolve([{ id: 'table_1', label: 'Table 1' }]);
      }
      if (sql.includes("status IN ('confirmed','in_progress')")) {
        return Promise.resolve([{
          id: 'event_existing',
          title: 'Earlier dinner',
          startAt: '2026-06-10T18:00:00.000Z',
          endAt: '2026-06-10T20:00:00.000Z',
          tableIds: '["table_1"]',
          tableNumbers: '["Table 1"]',
        }]);
      }
      return Promise.resolve([]);
    });

    await expect(createEventBooking('tenant_1', {
      title: 'Overlapping dinner',
      eventType: 'restaurant',
      status: 'confirmed',
      startAt: '2026-06-10T19:00:00.000Z',
      endAt: '2026-06-10T21:00:00.000Z',
      tableIds: ['table_1'],
    })).rejects.toThrow(/Reservation conflict/i);

    expect(dbModule.query).not.toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO event_bookings'),
      expect.anything()
    );
  });

  it('updates and deletes bookings with audit records', async () => {
    (dbModule.query as any).mockImplementation((sql: string) => {
      if (sql.includes('FROM event_bookings')) {
        return Promise.resolve([{ id: 'event_1', tenant_id: 'tenant_1', title: 'Birthday', event_type: 'private', status: 'inquiry', start_at: '2026-06-10 12:00:00', table_numbers: '[]' }]);
      }
      return Promise.resolve({});
    });

    await updateEventBooking('tenant_1', 'event_1', {
      status: 'confirmed',
      guestCount: 30,
      staffId: 'mgr_1',
    });
    await deleteEventBooking('tenant_1', 'event_1', { staffId: 'mgr_1' });

    expect(dbModule.query).toHaveBeenCalledWith(
      expect.stringContaining('UPDATE event_bookings'),
      expect.arrayContaining(['confirmed', 30, 'tenant_1', 'event_1'])
    );
    expect(dbModule.query).toHaveBeenCalledWith(
      expect.stringContaining('DELETE FROM event_bookings'),
      ['tenant_1', 'event_1']
    );
    expect(auditModule.recordAuditEvent).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ action: 'event_booking.updated' }));
    expect(auditModule.recordAuditEvent).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ action: 'event_booking.deleted' }));
  });
});
