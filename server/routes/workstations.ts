import { Router } from "express";
import { requireAuth } from "../auth-middleware.js";
import { getWorkstationsByTenant, getMessagesByTenant, getMessagesByChannel } from "../db-adapter.js";
import { createWorkstation, deleteWorkstation, createMessage, markMessageRead } from "../db-crud.js";
import { validateSchema, WorkstationSchema } from "../validation.js";
import { broadcastToMessages } from "../socket.js";
import { sendPushNotification } from "../pushNotifications.js";
import {
  listHardwareDevices, createHardwareDevice, updateHardwareDevice,
  deleteHardwareDevice, testHardwareDevice, listHardwareDeviceEvents,
  queueCashDrawerPulseForNoSale,
} from "../hardwareAdapters.js";
import { query } from "../db.js";
import { canUseActionCenter, denyWithAudit } from "./_helpers.js";

export const workstationsRouter = Router({ mergeParams: true });

workstationsRouter.get("/workstations", requireAuth, async (req: any, res) => {
  try { res.json(await getWorkstationsByTenant(req.params.tenantId)); }
  catch (err: any) { res.status(500).json({ error: err.message }); }
});

workstationsRouter.post("/workstations", requireAuth, validateSchema(WorkstationSchema), async (req: any, res) => {
  try { res.json(await createWorkstation(req.params.tenantId, req.body)); }
  catch (err: any) { res.status(500).json({ error: err.message }); }
});

workstationsRouter.delete("/workstations/:id", requireAuth, async (req: any, res) => {
  try { await deleteWorkstation(req.params.tenantId, req.params.id); res.json({ success: true }); }
  catch (err: any) { res.status(500).json({ error: err.message }); }
});

// ── Companion device assignments ───────────────────────────────────────────

workstationsRouter.get("/companion-device-assignments", requireAuth, async (req: any, res) => {
  try {
    const rows = await query(
      `SELECT cda.id, cda.tenant_id AS tenantId, cda.device_id AS deviceId, cda.device_name AS deviceName,
              cda.workstation_id AS workstationId, w.name AS workstationName, w.type AS workstationType,
              cda.default_mode AS defaultMode, cda.assigned_by AS assignedBy,
              cda.created_at AS createdAt, cda.updated_at AS updatedAt
         FROM companion_device_assignments cda
         LEFT JOIN workstations w ON w.id = cda.workstation_id AND w.tenant_id = cda.tenant_id
        WHERE cda.tenant_id = ?
        ORDER BY cda.updated_at DESC`,
      [req.params.tenantId]
    );
    res.json(rows);
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

workstationsRouter.put("/companion-device-assignments/:deviceId", requireAuth, async (req: any, res) => {
  try {
    if (!canUseActionCenter(req.user?.role)) {
      return denyWithAudit(req, res, "companion_device.assign", "Manager access is required to assign companion devices.");
    }
    const { workstationId, defaultMode, deviceName } = req.body || {};
    const id = `cda_${Date.now()}_${Math.random().toString(36).substring(7)}`;
    await query(
      `INSERT INTO companion_device_assignments (id, tenant_id, device_id, device_name, workstation_id, default_mode, assigned_by, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, NOW(), NOW())
       ON CONFLICT (tenant_id, device_id) DO UPDATE SET
         workstation_id = EXCLUDED.workstation_id, device_name = EXCLUDED.device_name,
         default_mode = EXCLUDED.default_mode, assigned_by = EXCLUDED.assigned_by, updated_at = NOW()`,
      [id, req.params.tenantId, req.params.deviceId, deviceName || req.params.deviceId, workstationId || null, defaultMode || "display", req.user?.staffId || null]
    );
    res.json({ success: true });
  } catch (err: any) { res.status(400).json({ error: err.message }); }
});

workstationsRouter.delete("/companion-device-assignments/:deviceId", requireAuth, async (req: any, res) => {
  try {
    if (!canUseActionCenter(req.user?.role)) {
      return denyWithAudit(req, res, "companion_device.unassign", "Manager access is required to unassign companion devices.");
    }
    await query(
      `DELETE FROM companion_device_assignments WHERE tenant_id = ? AND device_id = ?`,
      [req.params.tenantId, req.params.deviceId]
    );
    res.json({ success: true });
  } catch (err: any) { res.status(400).json({ error: err.message }); }
});

// ── Hardware devices ───────────────────────────────────────────────────────

workstationsRouter.get("/hardware-devices", requireAuth, async (req: any, res) => {
  try {
    if (!canUseActionCenter(req.user?.role)) return denyWithAudit(req, res, "hardware.devices_view", "Manager access is required for hardware devices.");
    res.json(await listHardwareDevices(req.params.tenantId, {
      deviceType: typeof req.query.deviceType === "string" ? req.query.deviceType : null,
      status: typeof req.query.status === "string" ? req.query.status : null,
    }));
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

workstationsRouter.post("/hardware-devices", requireAuth, async (req: any, res) => {
  try {
    if (!canUseActionCenter(req.user?.role)) return denyWithAudit(req, res, "hardware.device_create", "Manager access is required for hardware devices.");
    res.status(201).json(await createHardwareDevice(req.params.tenantId, req.body || {}, {
      staffId: req.user?.staffId || req.user?.uid || null, staffName: req.user?.name || null,
    }));
  } catch (err: any) { res.status(400).json({ error: err.message }); }
});

workstationsRouter.put("/hardware-devices/:deviceId", requireAuth, async (req: any, res) => {
  try {
    if (!canUseActionCenter(req.user?.role)) return denyWithAudit(req, res, "hardware.device_update", "Manager access is required for hardware devices.");
    const device = await updateHardwareDevice(req.params.tenantId, req.params.deviceId, req.body || {}, {
      staffId: req.user?.staffId || req.user?.uid || null, staffName: req.user?.name || null,
    });
    if (!device) return res.status(404).json({ error: "Hardware device not found" });
    res.json(device);
  } catch (err: any) { res.status(400).json({ error: err.message }); }
});

workstationsRouter.delete("/hardware-devices/:deviceId", requireAuth, async (req: any, res) => {
  try {
    if (!canUseActionCenter(req.user?.role)) return denyWithAudit(req, res, "hardware.device_delete", "Manager access is required for hardware devices.");
    res.json(await deleteHardwareDevice(req.params.tenantId, req.params.deviceId, {
      staffId: req.user?.staffId || req.user?.uid || null, staffName: req.user?.name || null,
    }));
  } catch (err: any) { res.status(400).json({ error: err.message }); }
});

workstationsRouter.post("/hardware-devices/:deviceId/test", requireAuth, async (req: any, res) => {
  try {
    if (!canUseActionCenter(req.user?.role)) return denyWithAudit(req, res, "hardware.device_test", "Manager access is required for hardware device tests.");
    const result = await testHardwareDevice(req.params.tenantId, req.params.deviceId, {
      staffId: req.user?.staffId || req.user?.uid || null, staffName: req.user?.name || null,
    }, req.body || {});
    if (!result) return res.status(404).json({ error: "Hardware device not found" });
    res.json(result);
  } catch (err: any) { res.status(400).json({ error: err.message }); }
});

workstationsRouter.get("/hardware-events", requireAuth, async (req: any, res) => {
  try {
    if (!canUseActionCenter(req.user?.role)) return denyWithAudit(req, res, "hardware.events_view", "Manager access is required for hardware events.");
    res.json(await listHardwareDeviceEvents(req.params.tenantId, typeof req.query.limit === "string" ? req.query.limit : 50));
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// ── Messages ───────────────────────────────────────────────────────────────

workstationsRouter.get("/messages", requireAuth, async (req: any, res) => {
  try {
    const { channel, limit } = req.query;
    const data = channel
      ? await getMessagesByChannel(req.params.tenantId, channel as string, limit ? parseInt(limit as string) : 100)
      : await getMessagesByTenant(req.params.tenantId, limit ? parseInt(limit as string) : 100);
    res.json(data);
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

workstationsRouter.post("/messages", requireAuth, async (req: any, res) => {
  try {
    const data = await createMessage(req.params.tenantId, req.body);
    const io = req.app.get("io");
    if (io) broadcastToMessages(io, req.params.tenantId, { type: "new_message", message: data });
    if (req.body?.isSystemNotification || req.body?.isSystem || req.body?.senderRole === "workstation") {
      await sendPushNotification(req.params.tenantId, {
        title: req.body?.senderName ? `${req.body.senderName} notification` : "Staff notification",
        body: String(req.body?.text || "New staff notification"),
        url: "/messages", tag: `staff-message-${data.id}`,
        icon: "/icons/icon-192.png", badge: "/icons/icon-192.png",
        vibrate: [130, 70, 130],
        data: { type: "staff_message", messageId: data.id, channel: req.body?.channel || "general" },
        actions: [{ action: "open-messages", title: "Open messages" }],
      }, { urgency: "high", ttl: 300 }).catch((err: any) => console.warn("Staff message push failed:", err?.message || err));
    }
    res.json(data);
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

workstationsRouter.put("/messages/:id/read", requireAuth, async (req: any, res) => {
  try { await markMessageRead(req.params.tenantId, req.params.id, req.body.userId); res.json({ success: true }); }
  catch (err: any) { res.status(500).json({ error: err.message }); }
});
