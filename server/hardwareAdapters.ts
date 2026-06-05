import { query } from "./db.js";
import { recordAuditEventSafe } from "./audit.js";

export const HARDWARE_DEVICE_TYPES = [
  "receipt_printer",
  "kitchen_printer",
  "cash_drawer",
  "scale",
  "barcode_scanner",
  "pole_display",
  "card_terminal",
] as const;

export const HARDWARE_CONNECTION_TYPES = [
  "browser_print",
  "escpos_network",
  "escpos_usb",
  "serial",
  "webserial",
  "webhid",
  "keyboard_wedge",
  "local_bridge",
  "payment_provider",
] as const;

export type HardwareDeviceType = typeof HARDWARE_DEVICE_TYPES[number];
export type HardwareConnectionType = typeof HARDWARE_CONNECTION_TYPES[number];
export type HardwareDeviceStatus = "active" | "inactive";
export type HardwareEventStatus = "queued" | "sent" | "failed" | "skipped";

export type HardwareActor = {
  staffId?: string | null;
  staffName?: string | null;
};

export type HardwareDevice = {
  id: string;
  tenantId: string;
  name: string;
  deviceType: HardwareDeviceType;
  connectionType: HardwareConnectionType;
  status: HardwareDeviceStatus;
  workstationId?: string | null;
  isDefault: boolean;
  connectionConfig: Record<string, any>;
  capabilities: string[];
  lastCheckStatus?: string | null;
  lastCheckMessage?: string | null;
  lastCheckedAt?: any;
  createdBy?: string | null;
  createdByName?: string | null;
  createdAt?: any;
  updatedAt?: any;
};

export type HardwareDeviceEvent = {
  id: string;
  tenantId: string;
  deviceId?: string | null;
  eventType: string;
  commandType: string;
  status: HardwareEventStatus;
  requestPayload: any;
  responsePayload: any;
  errorMessage?: string | null;
  createdBy?: string | null;
  createdByName?: string | null;
  createdAt?: any;
};

const DEVICE_TYPE_SET = new Set<string>(HARDWARE_DEVICE_TYPES);
const CONNECTION_TYPE_SET = new Set<string>(HARDWARE_CONNECTION_TYPES);

function id(prefix: string) {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function clean(value: unknown, max = 255) {
  const text = String(value ?? "").trim();
  return text ? text.slice(0, max) : "";
}

function parseJson(value: unknown, fallback: any) {
  if (value === null || value === undefined || value === "") return fallback;
  if (typeof value !== "string") return value;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function json(value: unknown, fallback: unknown = {}) {
  if (value === undefined || value === null) return JSON.stringify(fallback);
  if (typeof value === "string") return value;
  return JSON.stringify(value);
}

function bool(value: unknown) {
  return value === true || value === 1 || value === "1";
}

function normalizeDeviceType(value: unknown): HardwareDeviceType {
  const text = clean(value, 80).toLowerCase().replace(/[\s-]+/g, "_");
  if (DEVICE_TYPE_SET.has(text)) return text as HardwareDeviceType;
  if (text === "printer" || text === "receipt") return "receipt_printer";
  if (text === "kitchen" || text === "kitchen_ticket") return "kitchen_printer";
  if (text === "drawer") return "cash_drawer";
  if (text === "scanner") return "barcode_scanner";
  if (text === "display" || text === "customer_display") return "pole_display";
  if (text === "terminal" || text === "payment_terminal") return "card_terminal";
  throw new Error("Unsupported hardware device type");
}

function normalizeConnectionType(value: unknown, deviceType: HardwareDeviceType): HardwareConnectionType {
  const text = clean(value, 80).toLowerCase().replace(/[\s-]+/g, "_");
  if (CONNECTION_TYPE_SET.has(text)) return text as HardwareConnectionType;
  if (!text) {
    if (deviceType === "receipt_printer") return "browser_print";
    if (deviceType === "barcode_scanner") return "keyboard_wedge";
    if (deviceType === "card_terminal") return "payment_provider";
    return "local_bridge";
  }
  if (text === "network" || text === "tcp" || text === "lan") return "escpos_network";
  if (text === "usb") return "escpos_usb";
  throw new Error("Unsupported hardware connection type");
}

function defaultCapabilities(deviceType: HardwareDeviceType) {
  switch (deviceType) {
    case "receipt_printer":
      return ["escpos_print", "receipt_reprint", "cash_drawer_passthrough"];
    case "kitchen_printer":
      return ["escpos_print", "workstation_ticket", "buzzer"];
    case "cash_drawer":
      return ["drawer_pulse", "no_sale_open"];
    case "scale":
      return ["read_weight", "tare"];
    case "barcode_scanner":
      return ["barcode_scan", "price_lookup"];
    case "pole_display":
      return ["cart_total", "line_item", "thank_you"];
    case "card_terminal":
      return ["pairing_check", "payment_reference", "settlement_status"];
    default:
      return [];
  }
}

function sanitizeConnectionConfig(input: unknown) {
  const raw = parseJson(input, {});
  const source = raw && typeof raw === "object" && !Array.isArray(raw) ? raw as Record<string, any> : {};
  const blocked = new Set(["password", "secret", "token", "apiKey", "api_key", "accessToken", "refreshToken"]);
  return Object.fromEntries(Object.entries(source)
    .filter(([key]) => !blocked.has(key))
    .map(([key, value]) => [key, typeof value === "string" ? clean(value, 1000) : value]));
}

function normalizeInput(input: any) {
  const deviceType = normalizeDeviceType(input?.deviceType ?? input?.device_type ?? input?.type);
  const connectionType = normalizeConnectionType(input?.connectionType ?? input?.connection_type, deviceType);
  const name = clean(input?.name, 160) || deviceType.replace(/_/g, " ");
  return {
    name,
    deviceType,
    connectionType,
    status: clean(input?.status, 32) === "inactive" ? "inactive" as HardwareDeviceStatus : "active" as HardwareDeviceStatus,
    workstationId: clean(input?.workstationId ?? input?.workstation_id, 64) || null,
    isDefault: bool(input?.isDefault ?? input?.is_default),
    connectionConfig: sanitizeConnectionConfig(input?.connectionConfig ?? input?.connection_config),
    capabilities: Array.isArray(input?.capabilities)
      ? input.capabilities.map((item: unknown) => clean(item, 80)).filter(Boolean)
      : defaultCapabilities(deviceType),
  };
}

function serializeDevice(row: any): HardwareDevice {
  const deviceType = normalizeDeviceType(row.deviceType ?? row.device_type);
  return {
    id: row.id,
    tenantId: row.tenantId ?? row.tenant_id,
    name: row.name,
    deviceType,
    connectionType: normalizeConnectionType(row.connectionType ?? row.connection_type, deviceType),
    status: row.status === "inactive" ? "inactive" : "active",
    workstationId: row.workstationId ?? row.workstation_id ?? null,
    isDefault: bool(row.isDefault ?? row.is_default),
    connectionConfig: sanitizeConnectionConfig(row.connectionConfig ?? row.connection_config),
    capabilities: parseJson(row.capabilities, defaultCapabilities(deviceType)),
    lastCheckStatus: row.lastCheckStatus ?? row.last_check_status ?? null,
    lastCheckMessage: row.lastCheckMessage ?? row.last_check_message ?? null,
    lastCheckedAt: row.lastCheckedAt ?? row.last_checked_at ?? null,
    createdBy: row.createdBy ?? row.created_by ?? null,
    createdByName: row.createdByName ?? row.created_by_name ?? null,
    createdAt: row.createdAt ?? row.created_at ?? null,
    updatedAt: row.updatedAt ?? row.updated_at ?? null,
  };
}

function serializeEvent(row: any): HardwareDeviceEvent {
  return {
    id: row.id,
    tenantId: row.tenantId ?? row.tenant_id,
    deviceId: row.deviceId ?? row.device_id ?? null,
    eventType: row.eventType ?? row.event_type,
    commandType: row.commandType ?? row.command_type,
    status: row.status || "queued",
    requestPayload: parseJson(row.requestPayload ?? row.request_payload, {}),
    responsePayload: parseJson(row.responsePayload ?? row.response_payload, {}),
    errorMessage: row.errorMessage ?? row.error_message ?? null,
    createdBy: row.createdBy ?? row.created_by ?? null,
    createdByName: row.createdByName ?? row.created_by_name ?? null,
    createdAt: row.createdAt ?? row.created_at ?? null,
  };
}

function textHex(text: string) {
  return Buffer.from(text, "utf8").toString("hex");
}

function escposTextPayload(lines: string[], cut = true) {
  const text = `${lines.join("\n")}\n\n`;
  const initialize = "1b40";
  const body = textHex(text);
  const feedAndCut = cut ? "1d5600" : "";
  return `${initialize}${body}${feedAndCut}`;
}

function connectionReadiness(device: HardwareDevice) {
  const config = device.connectionConfig || {};
  if (device.status !== "active") return { ok: false, message: "Device is inactive." };
  if (device.connectionType === "escpos_network" && !config.host) return { ok: false, message: "Network ESC/POS devices need a host/IP address." };
  if (device.connectionType === "local_bridge" && !config.bridgeUrl) return { ok: false, message: "Local bridge devices need a bridge URL." };
  if (device.connectionType === "payment_provider" && (!config.provider || !config.providerDeviceId)) {
    return { ok: false, message: "Card terminals need provider and provider device ID." };
  }
  if ((device.connectionType === "serial" || device.connectionType === "webserial") && device.deviceType === "scale" && !config.baudRate) {
    return { ok: false, message: "Scale serial devices need a baud rate." };
  }
  return { ok: true, message: "Adapter configuration is ready." };
}

export function buildHardwareCommand(device: HardwareDevice, context: any = {}) {
  const readiness = connectionReadiness(device);
  const sale = context.sale || {};
  const items = Array.isArray(context.items) ? context.items : Array.isArray(sale.items) ? sale.items : [];
  const businessName = clean(context.businessName || context.business?.name, 120) || "Jimmy POS";

  switch (device.deviceType) {
    case "receipt_printer": {
      const lines = [
        businessName,
        `Receipt ${sale.id || context.receiptNumber || "TEST"}`,
        ...items.slice(0, 18).map((item: any) => `${Number(item.quantity || 1)} x ${clean(item.name || item.productName, 48)} R${Number(item.price || 0).toFixed(2)}`),
        `TOTAL R${Number(sale.total || context.total || 0).toFixed(2)}`,
      ];
      return { readiness, commandType: "escpos_receipt_print", transport: device.connectionType, payloadHex: escposTextPayload(lines), previewText: lines.join("\n") };
    }
    case "kitchen_printer": {
      const lines = [
        `${businessName} kitchen ticket`,
        `Order ${sale.tableNumber || sale.tabName || sale.id || "TEST"}`,
        ...items.map((item: any) => `${Number(item.quantity || 1)} x ${clean(item.name || item.productName, 48)}`),
      ];
      return { readiness, commandType: "escpos_kitchen_ticket", transport: device.connectionType, payloadHex: escposTextPayload(lines), previewText: lines.join("\n") };
    }
    case "cash_drawer":
      return { readiness, commandType: "escpos_drawer_pulse", transport: device.connectionType, payloadHex: "1b700019fa", pulseMs: 250 };
    case "scale":
      return { readiness, commandType: "scale_read_weight", transport: device.connectionType, request: device.connectionConfig.protocol === "nci" ? "W\r\n" : "SI\r\n", expectedUnit: device.connectionConfig.unit || "kg" };
    case "barcode_scanner":
      return { readiness, commandType: "barcode_scanner_readiness", transport: device.connectionType, inputMode: device.connectionType === "keyboard_wedge" ? "focused-input" : "device-event", expectedEvent: "barcode_lookup" };
    case "pole_display": {
      const displayLines = context.lines || [
        clean(context.customerName, 20) || "Welcome",
        `Total R${Number(context.total || sale.total || 0).toFixed(2)}`,
      ];
      return { readiness, commandType: "pole_display_write", transport: device.connectionType, payloadHex: `0c${textHex(displayLines.join("\n"))}`, lines: displayLines };
    }
    case "card_terminal":
      return {
        readiness,
        commandType: "card_terminal_pairing_check",
        transport: device.connectionType,
        provider: device.connectionConfig.provider || null,
        providerDeviceId: device.connectionConfig.providerDeviceId || null,
        terminalId: device.connectionConfig.terminalId || device.id,
      };
    default:
      return { readiness, commandType: "hardware_test", transport: device.connectionType };
  }
}

async function getHardwareDevice(tenantId: string, deviceId: string) {
  const rows = await query<any>(
    `SELECT *
       FROM hardware_devices
      WHERE tenant_id = ? AND id = ?
      LIMIT 1`,
    [tenantId, deviceId]
  );
  return rows[0] ? serializeDevice(rows[0]) : null;
}

async function recordHardwareDeviceEvent(
  tenantId: string,
  deviceId: string | null,
  eventType: string,
  commandType: string,
  status: HardwareEventStatus,
  requestPayload: unknown,
  responsePayload: unknown,
  errorMessage: string | null,
  actor: HardwareActor
) {
  const eventId = id("hwe");
  await query(
    `INSERT INTO hardware_device_events (
       id, tenant_id, device_id, event_type, command_type, status,
       request_payload, response_payload, error_message, created_by, created_by_name, created_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())`,
    [
      eventId,
      tenantId,
      deviceId,
      eventType,
      commandType,
      status,
      json(requestPayload),
      json(responsePayload),
      errorMessage,
      actor.staffId || null,
      actor.staffName || null,
    ]
  );
  return eventId;
}

export async function listHardwareDevices(tenantId: string, filters: { deviceType?: string | null; status?: string | null } = {}) {
  const where = ["tenant_id = ?"];
  const params: any[] = [tenantId];
  if (filters.deviceType) {
    where.push("device_type = ?");
    params.push(normalizeDeviceType(filters.deviceType));
  }
  if (filters.status) {
    where.push("status = ?");
    params.push(clean(filters.status, 32) === "inactive" ? "inactive" : "active");
  }

  const rows = await query<any>(
    `SELECT *
       FROM hardware_devices
      WHERE ${where.join(" AND ")}
      ORDER BY device_type ASC, is_default DESC, name ASC`,
    params
  );
  return rows.map(serializeDevice);
}

export async function listHardwareDeviceEvents(tenantId: string, limitInput: string | number | null = 50) {
  const limit = Math.min(200, Math.max(1, Number(limitInput || 50) || 50));
  const rows = await query<any>(
    `SELECT *
       FROM hardware_device_events
      WHERE tenant_id = ?
      ORDER BY created_at DESC
      LIMIT ?`,
    [tenantId, limit]
  );
  return rows.map(serializeEvent);
}

export async function createHardwareDevice(tenantId: string, input: any, actor: HardwareActor = {}) {
  const normalized = normalizeInput(input);
  const deviceId = id("hwd");
  if (normalized.isDefault) {
    await query(
      `UPDATE hardware_devices SET is_default = 0 WHERE tenant_id = ? AND device_type = ?`,
      [tenantId, normalized.deviceType]
    );
  }
  await query(
    `INSERT INTO hardware_devices (
       id, tenant_id, name, device_type, connection_type, status, workstation_id, is_default,
       connection_config, capabilities, created_by, created_by_name, created_at, updated_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())`,
    [
      deviceId,
      tenantId,
      normalized.name,
      normalized.deviceType,
      normalized.connectionType,
      normalized.status,
      normalized.workstationId,
      normalized.isDefault ? 1 : 0,
      json(normalized.connectionConfig),
      json(normalized.capabilities, []),
      actor.staffId || null,
      actor.staffName || null,
    ]
  );
  await recordAuditEventSafe({
    tenantId,
    action: "hardware.device_created",
    entityType: "hardware_device",
    entityId: deviceId,
    staffId: actor.staffId || null,
    staffName: actor.staffName || null,
    source: "hardware",
    details: { deviceType: normalized.deviceType, connectionType: normalized.connectionType, workstationId: normalized.workstationId, isDefault: normalized.isDefault },
  });
  return getHardwareDevice(tenantId, deviceId);
}

export async function updateHardwareDevice(tenantId: string, deviceId: string, input: any, actor: HardwareActor = {}) {
  const existing = await getHardwareDevice(tenantId, deviceId);
  if (!existing) return null;
  const normalized = normalizeInput({ ...existing, ...input });
  if (normalized.isDefault) {
    await query(
      `UPDATE hardware_devices SET is_default = 0 WHERE tenant_id = ? AND device_type = ? AND id <> ?`,
      [tenantId, normalized.deviceType, deviceId]
    );
  }
  await query(
    `UPDATE hardware_devices
        SET name = ?,
            device_type = ?,
            connection_type = ?,
            status = ?,
            workstation_id = ?,
            is_default = ?,
            connection_config = ?,
            capabilities = ?,
            updated_at = NOW()
      WHERE tenant_id = ? AND id = ?`,
    [
      normalized.name,
      normalized.deviceType,
      normalized.connectionType,
      normalized.status,
      normalized.workstationId,
      normalized.isDefault ? 1 : 0,
      json(normalized.connectionConfig),
      json(normalized.capabilities, []),
      tenantId,
      deviceId,
    ]
  );
  await recordAuditEventSafe({
    tenantId,
    action: "hardware.device_updated",
    entityType: "hardware_device",
    entityId: deviceId,
    staffId: actor.staffId || null,
    staffName: actor.staffName || null,
    source: "hardware",
    details: { deviceType: normalized.deviceType, connectionType: normalized.connectionType, workstationId: normalized.workstationId, isDefault: normalized.isDefault },
  });
  return getHardwareDevice(tenantId, deviceId);
}

export async function deleteHardwareDevice(tenantId: string, deviceId: string, actor: HardwareActor = {}) {
  await query(`DELETE FROM hardware_devices WHERE tenant_id = ? AND id = ?`, [tenantId, deviceId]);
  await recordAuditEventSafe({
    tenantId,
    action: "hardware.device_deleted",
    entityType: "hardware_device",
    entityId: deviceId,
    staffId: actor.staffId || null,
    staffName: actor.staffName || null,
    source: "hardware",
  });
  return { success: true };
}

export async function testHardwareDevice(tenantId: string, deviceId: string, actor: HardwareActor = {}, context: any = {}) {
  const device = await getHardwareDevice(tenantId, deviceId);
  if (!device) return null;
  const command = buildHardwareCommand(device, context);
  const ready = Boolean(command.readiness?.ok);
  const response = {
    ready,
    message: command.readiness?.message || "Adapter command built.",
    dispatchMode: device.connectionType,
    command,
  };
  const eventId = await recordHardwareDeviceEvent(
    tenantId,
    device.id,
    "hardware.test",
    command.commandType,
    ready ? "sent" : "failed",
    { context },
    response,
    ready ? null : response.message,
    actor
  );
  await query(
    `UPDATE hardware_devices
        SET last_check_status = ?,
            last_check_message = ?,
            last_checked_at = NOW(),
            updated_at = NOW()
      WHERE tenant_id = ? AND id = ?`,
    [ready ? "ready" : "attention", response.message, tenantId, device.id]
  );
  return { eventId, device: { ...device, lastCheckStatus: ready ? "ready" : "attention", lastCheckMessage: response.message }, ...response };
}

function saleItemsByWorkstation(sale: any) {
  const groups = new Map<string, any[]>();
  for (const item of Array.isArray(sale?.items) ? sale.items : []) {
    const workstationId = clean(item.workstationId ?? item.workstation_id, 64);
    if (!workstationId) continue;
    groups.set(workstationId, [...(groups.get(workstationId) || []), item]);
  }
  return groups;
}

export async function queueKitchenPrintJobsForSale(tenantId: string, sale: any, actor: HardwareActor = {}) {
  const groups = saleItemsByWorkstation(sale);
  if (groups.size === 0) return [];
  const devices = await listHardwareDevices(tenantId, { deviceType: "kitchen_printer", status: "active" });
  if (devices.length === 0) return [];
  const defaultPrinter = devices.find(device => device.isDefault);
  const jobs = [];

  for (const [workstationId, items] of groups.entries()) {
    const device = devices.find(candidate => candidate.workstationId === workstationId) || defaultPrinter;
    if (!device) {
      const eventId = await recordHardwareDeviceEvent(
        tenantId,
        null,
        "hardware.kitchen_ticket",
        "escpos_kitchen_ticket",
        "skipped",
        { saleId: sale?.id || null, workstationId, itemCount: items.length },
        { message: "No kitchen printer configured for workstation." },
        "No kitchen printer configured for workstation.",
        actor
      );
      jobs.push({ eventId, workstationId, status: "skipped", device: null, itemCount: items.length });
      continue;
    }

    const command = buildHardwareCommand(device, { sale, items });
    const eventId = await recordHardwareDeviceEvent(
      tenantId,
      device.id,
      "hardware.kitchen_ticket",
      command.commandType,
      command.readiness?.ok ? "queued" : "failed",
      { saleId: sale?.id || null, workstationId, itemCount: items.length },
      { command, message: command.readiness?.message },
      command.readiness?.ok ? null : command.readiness?.message || "Kitchen printer is not ready.",
      actor
    );
    jobs.push({ eventId, workstationId, status: command.readiness?.ok ? "queued" : "failed", device, command, itemCount: items.length });
  }
  return jobs;
}

export async function queueCashDrawerPulseForNoSale(tenantId: string, actor: HardwareActor = {}, context: any = {}) {
  const devices = await listHardwareDevices(tenantId, { deviceType: "cash_drawer", status: "active" });
  const device = devices.find(candidate => candidate.isDefault) || devices[0];
  if (!device) return null;

  const command = buildHardwareCommand(device, context);
  const eventId = await recordHardwareDeviceEvent(
    tenantId,
    device.id,
    "hardware.cash_drawer_pulse",
    command.commandType,
    command.readiness?.ok ? "queued" : "failed",
    {
      cashSessionId: context.cashSessionId || null,
      movementId: context.movementId || null,
      reason: context.reason || null,
    },
    { command, message: command.readiness?.message },
    command.readiness?.ok ? null : command.readiness?.message || "Cash drawer is not ready.",
    actor
  );
  return { eventId, status: command.readiness?.ok ? "queued" : "failed", device, command };
}
