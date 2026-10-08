import { Server as SocketIOServer } from "socket.io";
import { query } from "./db.js";
import { verifyToken, type AuthTokenPayload } from "./auth-middleware.js";
import { publishRealtimeEventIfEnabled, startRealtimePubsubPoller } from "./realtimePubsub.js";
// Resource rooms are keyed by bare row ids, so a join must prove the row
// belongs to the caller's tenant before the socket is allowed in.
const ROOM_OWNERSHIP_SQL = {
    workstation: "SELECT 1 FROM workstations WHERE id = $1 AND tenant_id = $2 LIMIT 1",
    table: "SELECT 1 FROM restaurant_tables WHERE id = $1 AND tenant_id = $2 LIMIT 1",
    tab: "SELECT 1 FROM sales WHERE id = $1 AND tenant_id = $2 LIMIT 1",
} as const;
async function tenantOwnsRoomResource(kind: keyof typeof ROOM_OWNERSHIP_SQL, resourceId: unknown, tenantId: string): Promise<boolean> {
    if (!resourceId || !tenantId)
        return false;
    try {
        const rows = await query<any>(ROOM_OWNERSHIP_SQL[kind], [String(resourceId), tenantId]);
        return rows.length > 0;
    }
    catch (err) {
        console.warn(`Socket ${kind} ownership check failed:`, err);
        return false;
    }
}
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
        if (!presenceKey || !deviceId)
            return;
        const devices = accountDevices.get(presenceKey);
        const sockets = devices?.get(deviceId);
        sockets?.delete(socket.id);
        if (sockets && sockets.size === 0)
            devices?.delete(deviceId);
        if (activeTerminalByAccount.get(presenceKey) === deviceId && (!devices || !devices.has(deviceId))) {
            const nextDeviceId = devices ? Array.from(devices.keys())[0] : null;
            if (nextDeviceId)
                activeTerminalByAccount.set(presenceKey, nextDeviceId);
            else
                activeTerminalByAccount.delete(presenceKey);
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
    const stopRealtimeFanout = startRealtimePubsubPoller({
        emitLocal(event) {
            io.to(event.channel).emit(event.eventName, event.payload);
        },
    });
    (io as any).stopRealtimeFanout = stopRealtimeFanout;
    // ── Middleware: Authenticate socket connections ─────────────────────────────
    io.use((socket: any, next) => {
        const handshake = socket.handshake as any;
        const authHeader = handshake.auth?.token;
        if (!authHeader || !authHeader.startsWith("Bearer ")) {
            return next(new Error("Authentication required"));
        }
        const payload = verifyToken(authHeader.substring(7));
        if (!payload || !payload.tenantId) {
            return next(new Error("Authentication required"));
        }
        socket.data.user = payload;
        next();
    });
    // ── Connection Handler ──────────────────────────────────────────────────────
    io.on("connection", (socket: any) => {
        console.log(`Client connected: ${socket.id}`);
        // Identity and tenant come only from the verified token, never from event payloads.
        const socketUser = socket.data.user as AuthTokenPayload;
        const socketTenantId = socketUser.tenantId;
        const socketStaffKey = socketUser.staffId || socketUser.uid;
        const tenantKey = (id: string) => `${socketTenantId}:${id}`;
        // ── Join workstation channel (only when register is open) ─────────────────
        socket.on("join_workstation", async (workstationId: string) => {
            if (!(await tenantOwnsRoomResource("workstation", workstationId, socketTenantId)))
                return;
            socket.join(`workstation:${workstationId}`);
            console.log(`Socket ${socket.id} joined workstation: ${workstationId}`);
        });
        // ── Join table channel (only when table is active) ────────────────────────
        socket.on("join_table", async (tableId: string) => {
            if (!(await tenantOwnsRoomResource("table", tableId, socketTenantId)))
                return;
            socket.join(`table:${tableId}`);
            console.log(`Socket ${socket.id} joined table: ${tableId}`);
        });
        // ── Join tab channel (only when tab is open) ──────────────────────────────
        socket.on("join_tab", async (tabId: string) => {
            if (!(await tenantOwnsRoomResource("tab", tabId, socketTenantId)))
                return;
            socket.join(`tab:${tabId}`);
            console.log(`Socket ${socket.id} joined tab: ${tabId}`);
        });
        // ── Join tenant channel (for general updates) ─────────────────────────────
        socket.on("join_tenant", async (tenantId: string) => {
            if (tenantId !== socketTenantId)
                return;
            socket.join(`tenant:${tenantId}`);
            console.log(`Socket ${socket.id} joined tenant: ${tenantId}`);
        });
        // ── Join messages channel ─────────────────────────────────────────────────
        socket.on("join_messages", (tenantId: string) => {
            if (tenantId !== socketTenantId)
                return;
            socket.join(`tenant:${tenantId}:messages`);
        });
        socket.on("account_device_active", (payload: {
            deviceId?: string;
        }) => {
            const deviceId = String(payload?.deviceId || socket.id);
            if (!socketStaffKey || !deviceId)
                return;
            removeAccountDevicePresence(socket);
            const presenceKey = tenantKey(socketStaffKey);
            const devices = accountDevices.get(presenceKey) || new Map<string, Set<string>>();
            const sockets = devices.get(deviceId) || new Set<string>();
            sockets.add(socket.id);
            devices.set(deviceId, sockets);
            accountDevices.set(presenceKey, devices);
            socket.data.accountPresenceKey = presenceKey;
            socket.data.accountDeviceId = deviceId;
            socket.join(`account-devices:${presenceKey}`);
            if (!activeTerminalByAccount.get(presenceKey))
                activeTerminalByAccount.set(presenceKey, deviceId);
            emitAccountDevicePresence(presenceKey);
        });
        socket.on("account_terminal_select", (payload: {
            deviceId?: string;
        }) => {
            const deviceId = String(payload?.deviceId || socket.data.accountDeviceId || socket.id);
            if (!socketStaffKey || !deviceId)
                return;
            const presenceKey = tenantKey(socketStaffKey);
            activeTerminalByAccount.set(presenceKey, deviceId);
            io.to(`account-devices:${presenceKey}`).emit("account_active_terminal_selected", {
                activeTerminalDeviceId: deviceId,
            });
            emitAccountDevicePresence(presenceKey);
        });
        socket.on("terminal_register", (payload: {
            terminalId?: string;
            deviceId?: string;
        }) => {
            const terminalId = String(payload?.terminalId || "");
            if (!terminalId)
                return;
            const deviceId = String(payload?.deviceId || socket.data.accountDeviceId || socket.id);
            if (socketStaffKey && deviceId) {
                const presenceKey = tenantKey(socketStaffKey);
                if (!activeTerminalByAccount.get(presenceKey))
                    activeTerminalByAccount.set(presenceKey, deviceId);
                emitAccountDevicePresence(presenceKey);
            }
            socket.join(`terminal:${tenantKey(terminalId)}`);
            socket.data.terminalId = terminalId;
            socket.data.deviceRole = "terminal";
            io.to(`terminal:${tenantKey(terminalId)}`).emit("companion_state", {
                terminalId,
                poleDisplayDeviceId: poleDisplaysByTerminal.get(tenantKey(terminalId)) || null,
            });
        });
        socket.on("companion_join", (payload: {
            terminalId?: string;
            deviceId?: string;
            mode?: string;
        }) => {
            const terminalId = String(payload?.terminalId || "");
            const deviceId = String(payload?.deviceId || socket.id);
            const requestedMode = payload?.mode === "pole_display" ? "pole_display" : "wireless_scanner";
            if (!terminalId)
                return;
            let assignedMode = requestedMode;
            const currentPoleDisplay = poleDisplaysByTerminal.get(tenantKey(terminalId));
            if (requestedMode === "pole_display") {
                if (currentPoleDisplay && currentPoleDisplay !== deviceId) {
                    assignedMode = "wireless_scanner";
                }
                else {
                    poleDisplaysByTerminal.set(tenantKey(terminalId), deviceId);
                }
            }
            socket.join(`terminal:${tenantKey(terminalId)}`);
            socket.data.terminalId = terminalId;
            socket.data.companionDeviceId = deviceId;
            socket.data.companionMode = assignedMode;
            socket.data.deviceRole = "companion";
            socket.emit("companion_mode_assigned", {
                terminalId,
                requestedMode,
                assignedMode,
                poleDisplayDeviceId: poleDisplaysByTerminal.get(tenantKey(terminalId)) || null,
            });
            io.to(`terminal:${tenantKey(terminalId)}`).emit("companion_state", {
                terminalId,
                poleDisplayDeviceId: poleDisplaysByTerminal.get(tenantKey(terminalId)) || null,
            });
        });
        socket.on("companion_command", (payload: {
            terminalId?: string;
            command?: string;
            data?: any;
        }) => {
            const terminalId = String(payload?.terminalId || socket.data.terminalId || "");
            if (!terminalId || !payload?.command)
                return;
            if (payload.command !== "barcode_lookup")
                return;
            socket.to(`terminal:${tenantKey(terminalId)}`).emit("companion_command", {
                command: payload.command,
                data: payload.data || {},
                fromDeviceId: socket.data.companionDeviceId || socket.id,
            });
        });
        socket.on("terminal_display_update", (payload: {
            terminalId?: string;
            data?: any;
        }) => {
            const terminalId = String(payload?.terminalId || socket.data.terminalId || "");
            if (!terminalId)
                return;
            socket.to(`terminal:${tenantKey(terminalId)}`).emit("terminal_display_update", {
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
                if (poleDisplaysByTerminal.get(tenantKey(terminalId)) === deviceId) {
                    poleDisplaysByTerminal.delete(tenantKey(terminalId));
                    io.to(`terminal:${tenantKey(terminalId)}`).emit("companion_state", {
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
    emitRealtimeRoom(io, `workstation:${workstationId}`, "workstation_update", data);
}
/**
 * Broadcast to all clients in a table (only active when table is in use)
 */
export function broadcastToTable(io: any, tableId: string, data: any) {
    emitRealtimeRoom(io, `table:${tableId}`, "table_update", data);
}
/**
 * Broadcast to all clients in a tab (only active when tab is open)
 */
export function broadcastToTab(io: any, tabId: string, data: any) {
    emitRealtimeRoom(io, `tab:${tabId}`, "tab_update", data);
}
/**
 * Broadcast to all clients in a tenant
 */
export function broadcastToTenant(io: any, tenantId: string, event: string, data: any) {
    emitRealtimeRoom(io, `tenant:${tenantId}`, event, data);
}
/**
 * Broadcast to all clients in a tenant's messages channel
 */
export function broadcastToMessages(io: any, tenantId: string, data: any) {
    emitRealtimeRoom(io, `tenant:${tenantId}:messages`, "messages_update", data);
}
function emitRealtimeRoom(io: any, channel: string, eventName: string, data: any) {
    io.to(channel).emit(eventName, data);
    void publishRealtimeEventIfEnabled({ channel, eventName, payload: data }).catch((err) => {
        console.warn("Failed to publish realtime fan-out event:", err);
    });
}
// ── Workstation Status Broadcasting ───────────────────────────────────────────
/**
 * Broadcast workstation status update
 */
export async function broadcastWorkstationStatus(io: any, workstationId: string, status: string) {
    // Get updated workstation data
    const rows = await query<any>(`SELECT * FROM workstations WHERE id = $1`, [workstationId]);
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
export async function broadcastTableStatus(io: any, tableId: string, status: string) {
    // Get updated table data
    const rows = await query<any>(`SELECT * FROM restaurant_tables WHERE id = $1`, [tableId]);
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
export async function broadcastTabStatus(io: any, tabId: string, status: string) {
    // Get updated tab data
    const rows = await query<any>(`SELECT * FROM sales WHERE id = $1`, [tabId]);
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
    const rows = await query<any>(`
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
    WHERE s.id = $1 AND s.tenant_id = $2
    `, [saleId, tenantId]);
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
                if (item.workstation_id)
                    workstations.add(item.workstation_id);
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
