# WebSocket Implementation Status

## Date: May 16, 2026

## Summary

**Current State:** Socket.IO is installed but NOT actively used. The messaging system uses REST polling instead of real-time WebSockets.

---

## Current Implementation

### Server-Side (Node.js/Express)
- **Dependencies:** `socket.io` (4.7.5) installed but not used
- **Server Setup:** No Socket.IO server initialized
- **Endpoints:** All messaging via REST API (`/api/mariadb/tenants/:tenantId/messages`)

### Client-Side (React)
- **Dependencies:** `socket.io-client` (4.7.5) installed but not used
- **Hook:** `useMessaging` uses REST polling every 10 seconds
- **Real-time:** No real-time updates - relies on polling

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

## WebSocket Implementation (Not Active)

### What Would Be Needed:

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
**Keep REST polling** - It's sufficient and simpler to maintain.

### For High Scale (1000+ concurrent users):
**Consider WebSockets** - Polling becomes inefficient at scale.

### Hybrid Approach:
1. Use WebSockets for real-time updates
2. Fall back to polling if WebSocket fails
3. Use Redis for message broadcasting across multiple server instances

---

## Files Involved

### Server:
- `server/app.ts` - Socket.IO imported but not used
- `server/mariadb-adapter.ts` - REST endpoints for messages
- `server/mariadb-crud.ts` - Message CRUD operations

### Client:
- `src/hooks/useMessaging.ts` - Polling implementation
- `src/views/MessagingView.tsx` - Message UI
- `src/App.tsx` - Messaging integration

---

## Conclusion

The WebSocket dependencies are installed but not actively used. The current REST polling implementation is functional and appropriate for the current scale. Consider implementing WebSockets if you need real-time updates or expect significant growth in concurrent users.
