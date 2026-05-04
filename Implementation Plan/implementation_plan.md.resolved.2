# Restaurant Mode Workstation Workflow

This document outlines the architecture and workflow for transitioning the POS into a fully-fledged Restaurant management system, focusing on Workstation-specific routing, granular order lifecycles, and staff gamification.

## 1. Data Model Adjustments (`types.ts`)

To support granular routing and performance tracking, the data models must be expanded:

### Products & Workstations
- **[NEW] Workstation Model**: Defines a production area (e.g., Kitchen, Bar, Sushi Station).
  - `id: string`, `name: string`, `type: 'kitchen' | 'bar' | 'other'`
- **[MODIFY] Product Model**: Add `workstationId?: string`. When added to a cart, the system knows where to route this item.

### Orders & Item Lifecycle
Currently, the `Sale` status applies to the whole order. We must move lifecycle tracking to the **Item Level** (`OrderItem`).
- **[MODIFY] OrderItem (extends CartItem)**:
  - `status: 'pending' | 'accepted' | 'ready' | 'delivered'`
  - `workstationId: string`
  - Timestamps: `orderedAt`, `acceptedAt`, `readyAt`, `deliveredAt`
  - `staffId: string` (The chef/barman who accepted/prepared it)

### Staff Performance & Gamification
- **[MODIFY] Staff Model**:
  - Add `metrics`: Average prep time, total tips earned, average table turnaround time.
  - Add `badges: string[]` (e.g., "Speed Demon", "Tip Magnet").
  - Add `rank: string` (e.g., "Novice", "Pro", "Master").

## 2. Order Workflow & Timing Mechanism

1. **Seating & Ordering (Register/Server Tablet)**
   - Server opens a Table, adds items to the cart, and clicks **"Send to Workstations"**.
   - `orderedAt` is stamped on all items. Items are broadcasted to respective Workstation screens.
2. **Accepting (Workstation Display)**
   - The Chef/Barman sees the incoming items on their screen.
   - They click **"Accept"** on the ticket when starting preparation.
   - `acceptedAt` is stamped (Tracks *Wait Time*).
3. **Ready/Done (Workstation Display)**
   - When finished, the workstation server clicks **"Ready"**.
   - `readyAt` is stamped (Tracks *Prep Time*).
   - This triggers a real-time notification to the Server's terminal/tablet.
4. **Delivery & Checkout (Register/Server Tablet)**
   - Server marks items as **"Delivered"** (`deliveredAt` stamped).
   - When the client pays and leaves, the table is closed, and the total **Turnaround Time** and **Tip Amount** are recorded to the Server's metrics.

## 3. UI Component Changes

### [NEW] `WorkstationView.tsx` (Replaces `KitchenView.tsx`)
A dedicated view for production areas. It filters incoming `sales` based on the configured `workstationId`.
- Features an "Accept" button (changes color/status).
- Features a "Mark Ready" button (sends notification).

### [MODIFY] `PointOfSaleView.tsx` & Notifications
- Add a notification bell or toast system for Waiters to see "Table 4 Drinks are Ready!".
- Update the checkout flow to capture tips specifically for performance tracking.

### [NEW] `LeaderboardView.tsx`
A dashboard for staff to view their ranks, badges, and metrics compared to peers.

---

> [!IMPORTANT]
> ## User Review Required
> 
> 1. **Workstation Setup**: Should a register terminal have the ability to act as *both* a Front-of-House POS *and* a Workstation Display simultaneously (split screen), or will they be distinct hardware screens?
> 2. **Order Grouping**: On the Workstation screen, do you want items grouped by **Table/Ticket** (e.g., a ticket for Table 4 containing 3 burgers), or a continuous stream of **Individual Items** to knock off one by one?
> 3. **Gamification Ranks**: Do you have specific names for the Ranks and Badges you want to use, or should I invent a default tiered system (e.g., Bronze, Silver, Gold)?

Please provide feedback on the questions above so we can lock in the plan and proceed to execution!
