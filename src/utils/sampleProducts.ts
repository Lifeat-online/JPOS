export interface SampleProduct {
  name: string;
  price: number;
  category: string;
  section: string;
  stock: number;
  minStock: number;
  barcode: string;
}

function build(prefix: string, category: string, items: Array<[string, number]>): SampleProduct[] {
  return items.map(([name, price], i) => ({
    name,
    price,
    category,
    section: 'Samples',
    stock: 50,
    minStock: 10,
    barcode: `${prefix}-${String(i + 1).padStart(3, '0')}`,
  }));
}

export const SAMPLE_PRODUCTS: Record<'retail' | 'cafe', SampleProduct[]> = {
  retail: build('SAMPLE-R', 'Sample Retail', [
    ['Still Water 500ml', 12.99],
    ['White Bread Loaf', 21.99],
    ['Full Cream Milk 1L', 19.99],
    ['Large Eggs 6 Pack', 24.99],
    ['Maize Meal 5kg', 64.99],
    ['Sunflower Oil 750ml', 49.99],
    ['Cola Soft Drink 2L', 27.99],
    ['Instant Coffee 200g', 79.99],
  ]),
  cafe: build('SAMPLE-C', 'Sample Café', [
    ['Flat White', 34],
    ['Cappuccino', 36],
    ['Americano', 28],
    ['Iced Latte', 40],
    ['Toasted Cheese & Tomato', 65],
    ['Butter Croissant', 32],
    ['Blueberry Muffin', 30],
    ['Fresh Orange Juice', 38],
  ]),
};
