import { describe, it, expect } from 'vitest';
import { SAMPLE_PRODUCTS } from '../../src/utils/sampleProducts.ts';

describe('SAMPLE_PRODUCTS', () => {
  it.each(['retail', 'cafe'] as const)('has 8 unique barcodes for %s', mode => {
    const list = SAMPLE_PRODUCTS[mode];
    expect(list).toHaveLength(8);
    expect(new Set(list.map(p => p.barcode)).size).toBe(8);
    expect(list.every(p => p.section === 'Samples' && p.price > 0)).toBe(true);
  });
});
