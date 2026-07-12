/**
 * Backfill pgvector embeddings for products that don't have one yet.
 *
 * Usage:
 *   npm run embed:backfill            # every tenant
 *   npm run embed:backfill <tenantId> # a single tenant
 *
 * Requires the `vector` extension (see init-db ensureProductEmbeddingSchema)
 * and an OpenAI key configured for the tenant (AI settings or OPENAI_API_KEY).
 */
import dotenv from "dotenv";
dotenv.config();
import { query } from "../server/db.js";
import { embedManyForTenant, productEmbeddingText } from "../server/ai.js";

const BATCH_SIZE = 64;

interface ProductRow {
  id: string;
  name: string | null;
  category: string | null;
  subCategory: string | null;
  section: string | null;
  barcode: string | null;
}

async function backfillTenant(tenantId: string): Promise<void> {
  const products = await query<ProductRow>(
    `SELECT id, name, category, sub_category AS "subCategory", section, barcode
       FROM products
      WHERE tenant_id = $1 AND embedding IS NULL`,
    [tenantId],
  );
  if (!products.length) {
    console.log(`tenant ${tenantId}: no products need embedding`);
    return;
  }
  console.log(`tenant ${tenantId}: embedding ${products.length} products…`);
  for (let i = 0; i < products.length; i += BATCH_SIZE) {
    const chunk = products.slice(i, i + BATCH_SIZE);
    const vectors = await embedManyForTenant(tenantId, chunk.map(productEmbeddingText));
    if (!vectors) {
      console.warn(`tenant ${tenantId}: embeddings not configured (no OpenAI key); skipping tenant`);
      return;
    }
    for (let j = 0; j < chunk.length; j++) {
      await query(`UPDATE products SET embedding = $3::vector WHERE tenant_id = $1 AND id = $2`, [
        tenantId,
        chunk[j].id,
        `[${vectors[j].join(",")}]`,
      ]);
    }
    console.log(`  ${Math.min(i + BATCH_SIZE, products.length)}/${products.length}`);
  }
}

async function main(): Promise<void> {
  const onlyTenant = process.argv[2];
  const tenants = onlyTenant
    ? [{ id: onlyTenant }]
    : await query<{ id: string }>("SELECT id FROM tenants ORDER BY id");
  for (const tenant of tenants) {
    await backfillTenant(tenant.id);
  }
  console.log("Backfill complete.");
  process.exit(0);
}

main().catch((err) => {
  console.error("Backfill failed:", err);
  process.exit(1);
});
