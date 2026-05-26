import dotenv from "dotenv";

dotenv.config({ override: true });

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

async function main() {
  const { query } = await import("../server/db.js");
  const {
    ensureAuditAndStockLedgerSchema,
    ensureManagerTaskSchema,
    ensureStockTakeSchema,
  } = await import("../server/init-db.js");
  const {
    approveStockTakeSession,
    createStockTakeSession,
    submitStockTakeCount,
  } = await import("../server/stockTake.js");

  await ensureAuditAndStockLedgerSchema();
  await ensureManagerTaskSchema();
  await ensureStockTakeSchema();

  const suffix = Date.now().toString(36);
  const tenantId = `smoke_stocktake_${suffix}`;
  const managerId = `smoke_mgr_${suffix}`;
  const counterId = `smoke_counter_${suffix}`;
  const milkId = `smoke_milk_${suffix}`;
  const breadId = `smoke_bread_${suffix}`;

  try {
    await query(
      `INSERT INTO tenants (id, name, created_at, updated_at) VALUES (?, ?, NOW(), NOW())`,
      [tenantId, "Stocktake Smoke Tenant"]
    );
    await query(
      `INSERT INTO staff (id, tenant_id, name, role, email, status, created_at, updated_at)
       VALUES (?, ?, ?, 'manager', ?, 'active', NOW(), NOW()),
              (?, ?, ?, 'cashier', ?, 'active', NOW(), NOW())`,
      [
        managerId,
        tenantId,
        "Smoke Manager",
        `${managerId}@example.test`,
        counterId,
        tenantId,
        "Smoke Counter",
        `${counterId}@example.test`,
      ]
    );
    await query(
      `INSERT INTO products (id, tenant_id, name, price, category, stock, min_stock, barcode, created_at, updated_at)
       VALUES (?, ?, 'Smoke Milk', 10, 'Smoke', 10, 2, ?, NOW(), NOW()),
              (?, ?, 'Smoke Bread', 12, 'Smoke', 4, 2, ?, NOW(), NOW())`,
      [milkId, tenantId, `milk-${suffix}`, breadId, tenantId, `bread-${suffix}`]
    );

    const created = await createStockTakeSession(
      tenantId,
      {
        name: "Smoke spot check",
        type: "spot_check",
        notes: "Automated stocktake smoke test",
        assignments: [
          { productId: milkId, assignedTo: counterId, assignedToName: "Smoke Counter" },
          { productId: breadId, assignedTo: counterId, assignedToName: "Smoke Counter" },
        ],
      },
      { staffId: managerId, staffName: "Smoke Manager", role: "manager" }
    );

    assert(created?.items?.length === 2, "Expected two assigned stocktake items.");
    const milkItem = created.items.find((item: any) => item.productId === milkId);
    const breadItem = created.items.find((item: any) => item.productId === breadId);
    assert(milkItem?.id, "Milk stocktake item was not created.");
    assert(breadItem?.id, "Bread stocktake item was not created.");

    await submitStockTakeCount(
      tenantId,
      milkItem.id,
      { countedQuantity: 8, note: "Shelf count" },
      { staffId: counterId, staffName: "Smoke Counter", role: "cashier" }
    );
    const submitted = await submitStockTakeCount(
      tenantId,
      breadItem.id,
      { countedQuantity: 4, note: "Shelf count" },
      { staffId: counterId, staffName: "Smoke Counter", role: "cashier" }
    );
    assert(submitted?.status === "submitted", "Session did not submit after all counts were entered.");

    const approved = await approveStockTakeSession(
      tenantId,
      created.id,
      { staffId: managerId, staffName: "Smoke Manager", role: "manager" }
    );
    assert(approved?.status === "approved", "Session did not approve.");
    assert(approved.applied?.length === 1, "Expected exactly one stock movement for the variance.");

    const products = await query<any>(
      `SELECT id, stock FROM products WHERE tenant_id = ? AND id IN (?, ?) ORDER BY id`,
      [tenantId, milkId, breadId]
    );
    const stockById = new Map(products.map((product: any) => [product.id, Number(product.stock)]));
    assert(stockById.get(milkId) === 8, "Milk stock was not adjusted to the counted quantity.");
    assert(stockById.get(breadId) === 4, "Bread stock should remain unchanged.");

    const movements = await query<any>(
      `SELECT reason, product_id AS productId, quantity_delta AS quantityDelta
         FROM stock_movements
        WHERE tenant_id = ? AND reference_type = 'stock_take_session' AND reference_id = ?`,
      [tenantId, created.id]
    );
    assert(movements.length === 1, "Expected one stock movement row for stocktake variance.");
    assert(movements[0].reason === "stock_take", "Stock movement reason should be stock_take.");

    console.log(JSON.stringify({
      ok: true,
      tenantId,
      sessionId: created.id,
      status: approved.status,
      appliedMovements: approved.applied.length,
      finalStock: Object.fromEntries(stockById),
    }, null, 2));
  } finally {
    await query(`DELETE FROM tenants WHERE id = ?`, [tenantId]).catch(() => undefined);
  }
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
