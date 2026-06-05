# WebSocket Implementation Status

## Date: May 16, 2026
## Updated: June 5, 2026

## Summary

**Current State:** Socket.IO is active for tenant, workstation, table, tab, sales, and message room updates. REST polling remains the durable fallback for message history and clients that are offline or disconnected.

---

## Current Implementation

### Server-Side (Node.js/Express)
- **Dependencies:** `socket.io` (4.7.5)
- **Server Setup:** `server/app.ts` creates an HTTP server and attaches Socket.IO through `server/socket.ts`
- **Fan-out:** single-process rooms are immediate; multi-instance deployments can set `JPOS_REALTIME_FANOUT=database` to publish room events through `realtime_pubsub_events`
- **Endpoints:** REST endpoints still own persistence and provide fallback reads, including `/api/mariadb/tenants/:tenantId/messages`

### Client-Side (React)
- **Dependencies:** `socket.io-client` (4.7.5)
- **Hook:** `src/hooks/useSocket.ts` joins tenant/workstation/table/tab/message rooms when enabled
- **Fallback:** REST polling remains available for message history, reconnect recovery, and non-live views

---

## Why REST Polling Instead of WebSockets?

The current implementation uses REST polling for several reasons:

1. **Simplicity:** REST is easier to implement and debug
2. **Database-driven:** Messages are stored in MariaDB, making polling straightforward
3. **Multi-tenant:** REST endpoints naturally support tenant scoping
4. **Fallback:** Polling works even if WebSocket connections drop

---

## Polling Implementation Details

### useMessaging Hook
```typescript
const POLL_MS = 10_000; // 10 seconds

useEffect(() => {
  const interval = window.setInterval(fetchMessages, POLL_MS);
  
  // Stop polling when tab is hidden to save resources
  document.addEventListener('visibilitychange', handleVisibility);
  
  return () => {
    clearInterval(interval);
    document.removeEventListener('visibilitychange', handleVisibility);
  };
}, [fetchMessages]);
```

### Features:
- Polls every 10 seconds
- Stops when tab is hidden (saves bandwidth)
- Optimistic updates for message sending
- Local state management for unread counts

---

## Socket.IO Implementation

### Active Server Shape:

**Server:**
```typescript
import { Server } from "socket.io";

const io = new Server(httpServer, {
  cors: { origin: "*" }
});

io.on("connection", (socket) => {
  console.log("Client connected");
  
  socket.on("join_channel", (channel) => {
    socket.join(channel);
  });
  
  socket.on("send_message", (data) => {
    io.to(data.channel).emit("new_message", data);
  });
  
  socket.on("disconnect", () => {
    console.log("Client disconnected");
  });
});
```

**Client:**
```typescript
import { io } from "socket.io-client";

const socket = io();

useEffect(() => {
  socket.emit("join_channel", activeChannel);
  
  socket.on("new_message", (message) => {
    setMessages(prev => [...prev, message]);
  });
  
  return () => {
    socket.disconnect();
  };
}, [activeChannel]);
```

---

## Pros and Cons

### REST Polling (Current)
| Pros | Cons |
|------|------|
| Simple to implement | Higher latency (up to 10s) |
| Works with existing DB schema | More HTTP requests |
| Easier to debug | Higher server load |
| No connection management | Not suitable for high-frequency updates |

### WebSockets (Not Active)
| Pros | Cons |
|------|------|
| Real-time updates | More complex implementation |
| Lower latency | Connection management needed |
| Less bandwidth | Harder to debug |
| Better for real-time | Requires server-side changes |

---

## Recommendations

### For Current Scale (10-100 concurrent users):
**Use the default in-process Socket.IO rooms plus REST fallback** - no extra shared fan-out layer is needed for a single app instance.

### For High Scale (1000+ concurrent users):
**Enable shared fan-out** - set `JPOS_REALTIME_FANOUT=database` when multiple app instances serve Socket.IO traffic against the same database.

### Hybrid Approach:
1. Use WebSockets for real-time updates
2. Fall back to polling if WebSocket fails
3. Use the database-backed `realtime_pubsub_events` layer for message broadcasting across multiple server instances, or replace it with Redis later if traffic demands it

---

## Files Involved

### Server:
- `server/app.ts` - creates the HTTP server and attaches Socket.IO
- `server/socket.ts` - room joins and local broadcast helpers
- `server/realtimePubsub.ts` - optional database-backed cross-instance fan-out
- `server/init-db.ts` - creates/heals `realtime_pubsub_events`
- `server/mariadb-adapter.ts` - REST endpoints for messages
- `server/mariadb-crud.ts` - Message CRUD operations

### Client:
- `src/hooks/useSocket.ts` - Socket.IO connection and room joins
- `src/hooks/useMessaging.ts` - Polling implementation and message persistence fallback
- `src/views/MessagingView.tsx` - Message UI
- `src/App.tsx` - Messaging integration

---

## Conclusion

Socket.IO is active for live room updates, while REST polling remains the safe persistence and recovery path. Multi-instance deployments should enable `JPOS_REALTIME_FANOUT=database` so sibling Node processes receive the same tenant, sales, workstation, table, tab, and message events.
