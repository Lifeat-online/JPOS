import { Server as SocketIOServer } from "socket.io";
import { query } from "./db.js";
import { isPostgres } from "./db.js";

// ── Types ─────────────────────────────────────────────────────────────────────

export type SocketUser = {
  uid: string;
  email: string;
  name: string;
  tenantId: string;
  role: string;
  staffId: string;
};

// ── Socket.IO Setup ───────────────────────────────────────────────────────────

export function setupSocketIO(httpServer: any) {
  const poleDisplaysByTerminal = new Map<string, string>();
  const accountDevices = new Map<string, Map<string, Set<string>>>();
  const activeTerminalByAccount = new Map<string, string>();

  const emitAccountDevicePresence = (presenceKey: string) => {
    const devices = accountDevices.get(presenceKey);
    const activeDeviceCount = devices ? devices.size : 0;
    const activeTerminalDeviceId = activeTerminalByAccount.get(presenceKey) || null;
    io.to(`account-devices:${presenceKey}`).emit("account_device_presence", {
      activeDeviceCount,
      activeTerminalDeviceId,
    });
  };

  const removeAccountDevicePresence = (socket: any) => {
    const presenceKey = socket.data?.accountPresenceKey;
    const deviceId = socket.data?.accountDeviceId;
    if (!presenceKey || !deviceId) return;

    const devices = accountDevices.get(presenceKey);
    const sockets = devices?.get(deviceId);
    sockets?.delete(socket.id);
    if (sockets && sockets.size === 0) devices?.delete(deviceId);
    if (activeTerminalByAccount.get(presenceKey) === deviceId && (!devices || !devices.has(deviceId))) {
      const nextDeviceId = devices ? Array.from(devices.keys())[0] : null;
      if (nextDeviceId) activeTerminalByAccount.set(presenceKey, nextDeviceId);
      else activeTerminalByAccount.delete(presenceKey);
    }
    if (devices && devices.size === 0) {
      accountDevices.delete(presenceKey);
      activeTerminalByAccount.delete(presenceKey);
    }

    emitAccountDevicePresence(presenceKey);
    socket.leave(`account-devices:${presenceKey}`);
  };

  const io = new SocketIOServer(httpServer, {
    cors: {
      origin: "*",
      methods: ["GET", "POST"],
    },
    pingTimeout: 60000,
    pingInterval: 25000,
  });

  // ── Middleware: Authenticate socket connections ─────────────────────────────

  io.use((socket: any, next) => {
    const handshake = socket.handshake as any;
    const authHeader = handshake.auth?.token;

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return next(new Error("Authentication required"));
    }

    const token = authHeader.substring(7);
    socket.token = token;
    next();
  });

  // ── Connection Handler ──────────────────────────────────────────────────────

  io.on("connection", (socket: any) => {
    console.log(`Client connected: ${socket.id}`);

    // Store socket user info
    let socketUser: SocketUser | null = null;

    // ── Join workstation channel (only when register is open) ─────────────────

    socket.on("join_workstation", async (workstationId: string) => {
      if (!workstationId) return;
      socket.join(`workstation:${workstationId}`);
      console.log(`Socket ${socket.id} joined workstation: ${workstationId}`);
    });

    // ── Join table channel (only when table is active) ────────────────────────

    socket.on("join_table", async (tableId: string) => {
      if (!tableId) return;
      socket.join(`table:${tableId}`);
      console.log(`Socket ${socket.id} joined table: ${tableId}`);
    });

    // ── Join tab channel (only when tab is open) ──────────────────────────────

    socket.on("join_tab", async (tabId: string) => {
      if (!tabId) return;
      socket.join(`tab:${tabId}`);
      console.log(`Socket ${socket.id} joined tab: ${tabId}`);
    });

    // ── Join tenant channel (for general updates) ─────────────────────────────

    socket.on("join_tenant", async (tenantId: string) => {
      if (!tenantId) return;
      socket.join(`tenant:${tenantId}`);
      console.log(`Socket ${socket.id} joined tenant: ${tenantId}`);
    });

    // ── Join messages channel ─────────────────────────────────────────────────

    socket.on("join_messages", (tenantId: string) => {
      socket.join(`tenant:${tenantId}:messages`);
    });

    socket.on("account_device_active", (payload: { tenantId?: string; staffId?: string; deviceId?: string }) => {
      const tenantId = String(payload?.tenantId || "");
      const staffId = String(payload?.staffId || "");
      const deviceId = String(payload?.deviceId || socket.id);
      if (!tenantId || !staffId || !deviceId) return;

      removeAccountDevicePresence(socket);

      const presenceKey = `${tenantId}:${staffId}`;
      const devices = accountDevices.get(presenceKey) || new Map<string, Set<string>>();
      const sockets = devices.get(deviceId) || new Set<string>();
      sockets.add(socket.id);
      devices.set(deviceId, sockets);
      accountDevices.set(presenceKey, devices);

      socket.data.accountPresenceKey = presenceKey;
      socket.data.accountDeviceId = deviceId;
      socket.join(`account-devices:${presenceKey}`);
      if (!activeTerminalByAccount.get(presenceKey)) activeTerminalByAccount.set(presenceKey, deviceId);
      emitAccountDevicePresence(presenceKey);
    });

    socket.on("account_terminal_select", (payload: { tenantId?: string; staffId?: string; deviceId?: string }) => {
      const tenantId = String(payload?.tenantId || "");
      const staffId = String(payload?.staffId || "");
      const deviceId = String(payload?.deviceId || socket.data.accountDeviceId || socket.id);
      if (!tenantId || !staffId || !deviceId) return;

      const presenceKey = `${tenantId}:${staffId}`;
      activeTerminalByAccount.set(presenceKey, deviceId);
      io.to(`account-devices:${presenceKey}`).emit("account_active_terminal_selected", {
        activeTerminalDeviceId: deviceId,
      });
      emitAccountDevicePresence(presenceKey);
    });

    socket.on("terminal_register", (payload: { tenantId?: string; staffId?: string; terminalId?: string; deviceId?: string }) => {
      const terminalId = String(payload?.terminalId || "");
      if (!terminalId) return;
      const tenantId = String(payload?.tenantId || "");
      const staffId = String(payload?.staffId || "");
      const deviceId = String(payload?.deviceId || socket.data.accountDeviceId || socket.id);
      if (tenantId && staffId && deviceId) {
        const presenceKey = `${tenantId}:${staffId}`;
        if (!activeTerminalByAccount.get(presenceKey)) activeTerminalByAccount.set(presenceKey, deviceId);
        emitAccountDevicePresence(presenceKey);
      }
      socket.join(`terminal:${terminalId}`);
      socket.data.terminalId = terminalId;
      socket.data.deviceRole = "terminal";
      io.to(`terminal:${terminalId}`).emit("companion_state", {
        terminalId,
        poleDisplayDeviceId: poleDisplaysByTerminal.get(terminalId) || null,
      });
    });

    socket.on("companion_join", (payload: { terminalId?: string; deviceId?: string; mode?: string }) => {
      const terminalId = String(payload?.terminalId || "");
      const deviceId = String(payload?.deviceId || socket.id);
      const requestedMode = payload?.mode === "pole_display" ? "pole_display" : payload?.mode === "wireless_scanner" ? "wireless_scanner" : "remote_control";
      if (!terminalId) return;

      let assignedMode = requestedMode;
      const currentPoleDisplay = poleDisplaysByTerminal.get(terminalId);
      if (requestedMode === "pole_display") {
        if (currentPoleDisplay && currentPoleDisplay !== deviceId) {
          assignedMode = "remote_control";
        } else {
          poleDisplaysByTerminal.set(terminalId, deviceId);
        }
      }

      socket.join(`terminal:${terminalId}`);
      socket.data.terminalId = terminalId;
      socket.data.companionDeviceId = deviceId;
      socket.data.companionMode = assignedMode;
      socket.data.deviceRole = "companion";

      socket.emit("companion_mode_assigned", {
        terminalId,
        requestedMode,
        assignedMode,
        poleDisplayDeviceId: poleDisplaysByTerminal.get(terminalId) || null,
      });
      io.to(`terminal:${terminalId}`).emit("companion_state", {
        terminalId,
        poleDisplayDeviceId: poleDisplaysByTerminal.get(terminalId) || null,
      });
    });

    socket.on("companion_command", (payload: { terminalId?: string; command?: string; data?: any }) => {
      const terminalId = String(payload?.terminalId || socket.data.terminalId || "");
      if (!terminalId || !payload?.command) return;
      socket.to(`terminal:${terminalId}`).emit("companion_command", {
        command: payload.command,
        data: payload.data || {},
        fromDeviceId: socket.data.companionDeviceId || socket.id,
      });
    });

    socket.on("terminal_display_update", (payload: { terminalId?: string; data?: any }) => {
      const terminalId = String(payload?.terminalId || socket.data.terminalId || "");
      if (!terminalId) return;
      socket.to(`terminal:${terminalId}`).emit("terminal_display_update", {
        terminalId,
        data: payload.data || {},
      });
    });

    // ── Leave channels ────────────────────────────────────────────────────────

    socket.on("leave_workstation", (workstationId: string) => {
      socket.leave(`workstation:${workstationId}`);
    });

    socket.on("leave_table", (tableId: string) => {
      socket.leave(`table:${tableId}`);
    });

    socket.on("leave_tab", (tabId: string) => {
      socket.leave(`tab:${tabId}`);
    });

    socket.on("leave_tenant", (tenantId: string) => {
      socket.leave(`tenant:${tenantId}`);
    });

    socket.on("leave_messages", (tenantId: string) => {
      socket.leave(`tenant:${tenantId}:messages`);
    });

    // ── Disconnect Handler ────────────────────────────────────────────────────

    socket.on("disconnect", () => {
      removeAccountDevicePresence(socket);
      if (socket.data?.companionMode === "pole_display" && socket.data?.terminalId) {
        const terminalId = String(socket.data.terminalId);
        const deviceId = String(socket.data.companionDeviceId || socket.id);
        if (poleDisplaysByTerminal.get(terminalId) === deviceId) {
          poleDisplaysByTerminal.delete(terminalId);
          io.to(`terminal:${terminalId}`).emit("companion_state", {
            terminalId,
            poleDisplayDeviceId: null,
          });
        }
      }
      console.log(`Client disconnected: ${socket.id}`);
    });
  });

  return io;
}

// ── Helper Functions ──────────────────────────────────────────────────────────

/**
 * Broadcast to all clients in a workstation (only active when register is open)
 */
export function broadcastToWorkstation(io: any, workstationId: string, data: any) {
  io.to(`workstation:${workstationId}`).emit("workstation_update", data);
}

/**
 * Broadcast to all clients in a table (only active when table is in use)
 */
export function broadcastToTable(io: any, tableId: string, data: any) {
  io.to(`table:${tableId}`).emit("table_update", data);
}

/**
 * Broadcast to all clients in a tab (only active when tab is open)
 */
export function broadcastToTab(io: any, tabId: string, data: any) {
  io.to(`tab:${tabId}`).emit("tab_update", data);
}

/**
 * Broadcast to all clients in a tenant
 */
export function broadcastToTenant(io: any, tenantId: string, event: string, data: any) {
  io.to(`tenant:${tenantId}`).emit(event, data);
}

/**
 * Broadcast to all clients in a tenant's messages channel
 */
export function broadcastToMessages(io: any, tenantId: string, data: any) {
  io.to(`tenant:${tenantId}:messages`).emit("messages_update", data);
}

// ── Workstation Status Broadcasting ───────────────────────────────────────────

/**
 * Broadcast workstation status update
 */
export async function broadcastWorkstationStatus(
  io: any,
  workstationId: string,
  status: string
) {
  // Get updated workstation data
  const rows = await query<any>(
    `SELECT * FROM workstations WHERE id = ?`,
    [workstationId]
  );

  if (rows.length > 0) {
    broadcastToWorkstation(io, workstationId, {
      type: "workstation_status_update",
      workstation: rows[0],
      status,
    });
  }
}

// ── Table Status Broadcasting ─────────────────────────────────────────────────

/**
 * Broadcast table status update
 */
export async function broadcastTableStatus(
  io: any,
  tableId: string,
  status: string
) {
  // Get updated table data
  const rows = await query<any>(
    `SELECT * FROM restaurant_tables WHERE id = ?`,
    [tableId]
  );

  if (rows.length > 0) {
    broadcastToTable(io, tableId, {
      type: "table_status_update",
      table: rows[0],
      status,
    });
  }
}

// ── Tab Status Broadcasting ───────────────────────────────────────────────────

/**
 * Broadcast tab status update
 */
export async function broadcastTabStatus(
  io: any,
  tabId: string,
  status: string
) {
  // Get updated tab data
  const rows = await query<any>(
    `SELECT * FROM sales WHERE id = ?`,
    [tabId]
  );

  if (rows.length > 0) {
    broadcastToTab(io, tabId, {
      type: "tab_status_update",
      tab: rows[0],
      status,
    });
  }
}

// ── Sales Status Broadcasting ─────────────────────────────────────────────────

/**
 * Broadcast sales status update to relevant workstations/tables
 */
export async function broadcastSalesUpdate(io: any, tenantId: string, saleId: string) {
  // Get updated sale data with items
  const rows = await query<any>(
    `
    SELECT s.*, 
      (SELECT JSON_ARRAYAGG(JSON_OBJECT(
        'id', si.id,
        'product_id', si.product_id,
        'product_name', si.product_name,
        'price', si.price,
        'quantity', si.quantity,
        'status', si.status,
        'workstation_id', si.workstation_id
      )) FROM sale_items si WHERE si.sale_id = s.id) as items
    FROM sales s
    WHERE s.id = ? AND s.tenant_id = ?
    `,
    [saleId, tenantId]
  );

  if (rows.length > 0) {
    const sale = rows[0];
    
    // Broadcast to tenant
    broadcastToTenant(io, tenantId, "sales_update", {
      type: "sale_update",
      sale,
    });

    // If sale has a workstation, broadcast to that workstation
    if (sale.items && Array.isArray(sale.items)) {
      const workstations = new Set<string>();
      sale.items.forEach((item: any) => {
        if (item.workstation_id) workstations.add(item.workstation_id);
      });
      
      workstations.forEach((wsId: string) => {
        broadcastToWorkstation(io, wsId, {
          type: "workstation_order_update",
          sale,
        });
      });
    }
  }
}

/**
 * Broadcast to all clients in a tenant's sales channel
 */
export function broadcastToSales(io: any, tenantId: string, data: any) {
  io.to(`tenant:${tenantId}`).emit("sales_update", data);
}

// ── Message Broadcasting ──────────────────────────────────────────────────────

/**
 * Broadcast a new message to all clients in a tenant's messages channel
 */
export async function broadcastNewMessage(io: any, tenantId: string, message: any) {
  broadcastToMessages(io, tenantId, {
    type: "new_message",
    message,
  });
}
