// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

type Catalog = {
  products: Record<string, string | number>;
  options: Record<string, { productId: string; priceExtra: string | number }>;
  business: unknown;
  customer: { discountPercent?: number; loyaltyPoints?: number } | null;
  storedItems: Array<{ productId: string; price: string | number }>;
};

const catalog: Catalog = { products: {}, options: {}, business: {}, customer: null, storedItems: [] };

vi.mock("../../server/db.js", () => ({
  query: vi.fn(async (sql: string, params: unknown[] = []) => {
    if (/FROM products WHERE/.test(sql)) {
      const ids = params[1] as string[];
      return ids.filter(id => id in catalog.products).map(id => ({ id, price: catalog.products[id] }));
    }
    if (/FROM modifier_options/.test(sql)) {
      const ids = params[1] as string[];
      return ids.filter(id => id in catalog.options).map(id => ({ id, ...catalog.options[id] }));
    }
    if (/FROM app_settings/.test(sql)) return [{ business: catalog.business }];
    if (/FROM customers/.test(sql)) return catalog.customer ? [catalog.customer] : [];
    if (/FROM sale_items si/.test(sql)) return catalog.storedItems;
    return [];
  }),
}));

import { filterLinesNotOnSale, findSaleItemPriceMismatches, findSaleTotalProblem } from "../../server/salePricing.js";

beforeEach(() => {
  catalog.products = { p1: "10.00", p2: 5 };
  catalog.options = {};
  catalog.business = {};
  catalog.customer = null;
  catalog.storedItems = [];
});

describe("findSaleItemPriceMismatches", () => {
  it("accepts a line at catalog price", async () => {
    expect(await findSaleItemPriceMismatches("t", [{ productId: "p1", price: 10, quantity: 1 }])).toEqual([]);
  });

  it("adds modifier option price_extra", async () => {
    catalog.options = { opt1: { productId: "p1", priceExtra: "2.50" } };
    const items = [{ productId: "p1", price: 12.5, quantity: 1, selectedModifiers: [{ optionId: "opt1" }] }];
    expect(await findSaleItemPriceMismatches("t", items)).toEqual([]);
  });

  it("flags a lowered price", async () => {
    const result = await findSaleItemPriceMismatches("t", [{ productId: "p1", name: "Burger", price: 8, quantity: 1 }]);
    expect(result).toEqual([{ productId: "p1", name: "Burger", submittedPrice: 8, catalogPrice: 10 }]);
  });

  it("flags unknown products with null catalog price", async () => {
    const result = await findSaleItemPriceMismatches("t", [{ productId: "nope", price: 3, quantity: 1 }]);
    expect(result).toHaveLength(1);
    expect(result[0].catalogPrice).toBeNull();
    expect(result[0].submittedPrice).toBe(3);
  });

  it("flags an option belonging to a different product", async () => {
    catalog.options = { opt1: { productId: "p2", priceExtra: "2.50" } };
    const items = [{ productId: "p1", price: 12.5, quantity: 1, selectedModifiers: [{ optionId: "opt1" }] }];
    const result = await findSaleItemPriceMismatches("t", items);
    expect(result).toHaveLength(1);
    expect(result[0].catalogPrice).toBeNull();
  });

  it("uses productId rather than id when both are set", async () => {
    const items = [{ id: "sale-item-123", productId: "p1", price: 10, quantity: 1 }];
    expect(await findSaleItemPriceMismatches("t", items)).toEqual([]);
  });

  it("falls back to id when productId is absent", async () => {
    expect(await findSaleItemPriceMismatches("t", [{ id: "p2", price: 5, quantity: 1 }])).toEqual([]);
  });

  it("handles string prices from pg", async () => {
    expect(await findSaleItemPriceMismatches("t", [{ productId: "p1", price: 10, quantity: 1 }])).toEqual([]);
    const result = await findSaleItemPriceMismatches("t", [{ productId: "p1", price: 10.01, quantity: 1 }]);
    expect(result[0].catalogPrice).toBe(10);
  });
});

describe("findSaleTotalProblem", () => {
  const items = [{ productId: "p1", price: 50, quantity: 2 }]; // 100.00

  it("flags a subtotal that differs from the lines", async () => {
    const problem = await findSaleTotalProblem("t", { items, subtotal: 90, total: 90 });
    expect(problem).toMatchObject({ kind: "subtotal_mismatch", submitted: 90, expected: 100 });
  });

  it("accepts a matching subtotal and total", async () => {
    expect(await findSaleTotalProblem("t", { items, subtotal: 100, total: 100 })).toBeNull();
  });

  it("flags a near-zero total with no discounts available", async () => {
    const problem = await findSaleTotalProblem("t", { items, total: 0.01 });
    expect(problem?.kind).toBe("total_below_minimum");
  });

  it("allows happy hour discount but not beyond it", async () => {
    catalog.business = { happyHourDiscounts: [{ enabled: true, discountPercent: 20 }] };
    expect(await findSaleTotalProblem("t", { items, total: 80 })).toBeNull();
    expect((await findSaleTotalProblem("t", { items, total: 79 }))?.kind).toBe("total_below_minimum");
  });

  it("ignores disabled happy hour rules", async () => {
    catalog.business = { happyHourDiscounts: [{ enabled: false, discountPercent: 20 }] };
    expect((await findSaleTotalProblem("t", { items, total: 80 }))?.kind).toBe("total_below_minimum");
  });

  it("allows the customer's discount_percent", async () => {
    catalog.customer = { discountPercent: 10, loyaltyPoints: 0 };
    expect(await findSaleTotalProblem("t", { items, total: 90, customerId: "c1" })).toBeNull();
    expect((await findSaleTotalProblem("t", { items, total: 89, customerId: "c1" }))?.kind).toBe("total_below_minimum");
  });

  it("allows loyalty redemption up to the customer's points", async () => {
    catalog.business = { enableLoyalty: true, pointsRequiredForDiscount: 100, discountAmountForPoints: 10 };
    catalog.customer = { discountPercent: 0, loyaltyPoints: 250 };
    expect(await findSaleTotalProblem("t", { items, total: 80, customerId: "c1" })).toBeNull();
    expect((await findSaleTotalProblem("t", { items, total: 79, customerId: "c1" }))?.kind).toBe("total_below_minimum");
  });

  describe("loyalty points cap depends on redemption", () => {
    beforeEach(() => {
      catalog.business = { enableLoyalty: true, pointsRequiredForDiscount: 100, discountAmountForPoints: 10 };
      catalog.customer = { discountPercent: 0, loyaltyPoints: 250 };
    });

    it("gives no points discount on a completed sale that redeems nothing", async () => {
      const problem = await findSaleTotalProblem("t", { items, total: 80, customerId: "c1", status: "completed", loyaltyPointsRedeemed: 0 });
      expect(problem?.kind).toBe("total_below_minimum");
    });

    it("caps a completed sale at the points it redeems", async () => {
      const sale = { items, customerId: "c1", status: "completed", loyaltyPointsRedeemed: 200 };
      expect(await findSaleTotalProblem("t", { ...sale, total: 80 })).toBeNull();
      expect((await findSaleTotalProblem("t", { ...sale, total: 79 }))?.kind).toBe("total_below_minimum");
    });

    it("uses the customer's balance as the cap for an open sale", async () => {
      expect(await findSaleTotalProblem("t", { items, total: 80, customerId: "c1", status: "open" })).toBeNull();
    });
  });

  it("allows promotionDiscount", async () => {
    expect(await findSaleTotalProblem("t", { items, total: 85, promotionDiscount: 15 })).toBeNull();
  });

  it("parses app_settings.business stored as a JSON string", async () => {
    catalog.business = JSON.stringify({ happyHourDiscounts: [{ enabled: true, discountPercent: 20 }] });
    expect(await findSaleTotalProblem("t", { items, total: 80 })).toBeNull();
    expect((await findSaleTotalProblem("t", { items, total: 79 }))?.kind).toBe("total_below_minimum");
  });
});

describe("filterLinesNotOnSale", () => {
  it("returns only lines that are new or re-priced", async () => {
    catalog.storedItems = [{ productId: "p1", price: "10.00" }];
    const items = [
      { productId: "p1", price: 10 },
      { productId: "p1", price: 9 },
      { productId: "p2", price: 5 },
    ];
    expect(await filterLinesNotOnSale("t", "sale1", items)).toEqual(items.slice(1));
  });
});
