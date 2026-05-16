import { CategoryTree } from './types';

export const DEFAULT_CATEGORY_TREE: CategoryTree = {
  'Retail': {
    'Electronics': ['Mobile', 'Audio', 'Accessories', 'Computing'],
    'Groceries': ['Dairy', 'Bakery', 'Produce', 'Pantry'],
    'Clothing': [],
    'Home Decor': [],
  },
  'Food & Beverage': {
    'Beverages': ['Hot Drinks', 'Cold Drinks', 'Alcoholic'],
    'Snacks': ['Sweets', 'Savoury', 'Healthy'],
    'Meals': [],
    'Ingredients': [],
  },
  'Service': {
    'Consultation': [],
    'Repair': [],
    'Subscription': [],
  },
};

export const INITIAL_PRODUCTS = [
  { name: 'Smartphone A14', price: 3499.00, costPrice: 2750.00, category: 'Electronics', section: 'Retail', subCategory: 'Mobile', stock: 18, minStock: 4, barcode: 'DEMO-RET-001' },
  { name: 'Wireless Earbuds', price: 699.00, costPrice: 420.00, category: 'Electronics', section: 'Retail', subCategory: 'Audio', stock: 36, minStock: 8, barcode: 'DEMO-RET-002' },
  { name: 'USB-C Fast Charger', price: 249.00, costPrice: 110.00, category: 'Electronics', section: 'Retail', subCategory: 'Accessories', stock: 64, minStock: 12, barcode: 'DEMO-RET-003' },
  { name: 'Bluetooth Keyboard', price: 499.00, costPrice: 290.00, category: 'Electronics', section: 'Retail', subCategory: 'Computing', stock: 14, minStock: 3, barcode: 'DEMO-RET-004' },
  { name: 'Full Cream Milk 2L', price: 34.00, costPrice: 24.00, category: 'Groceries', section: 'Retail', subCategory: 'Dairy', stock: 44, minStock: 10, barcode: 'DEMO-RET-005' },
  { name: 'Brown Bread Loaf', price: 18.00, costPrice: 12.00, category: 'Groceries', section: 'Retail', subCategory: 'Bakery', stock: 38, minStock: 12, barcode: 'DEMO-RET-006' },
  { name: 'Apples 1kg Bag', price: 29.00, costPrice: 18.00, category: 'Groceries', section: 'Retail', subCategory: 'Produce', stock: 22, minStock: 6, barcode: 'DEMO-RET-007' },
  { name: 'Rice 2kg', price: 46.00, costPrice: 32.00, category: 'Groceries', section: 'Retail', subCategory: 'Pantry', stock: 52, minStock: 8, barcode: 'DEMO-RET-008' },
  { name: 'Laundry Detergent 1kg', price: 79.00, costPrice: 53.00, category: 'Groceries', section: 'Retail', subCategory: 'Household', stock: 30, minStock: 6, barcode: 'DEMO-RET-009' },
  { name: 'Plain T-Shirt', price: 129.00, costPrice: 66.00, category: 'Clothing', section: 'Retail', subCategory: 'Men', stock: 40, minStock: 8, barcode: 'DEMO-RET-010' },
  { name: 'Summer Dress', price: 299.00, costPrice: 160.00, category: 'Clothing', section: 'Retail', subCategory: 'Women', stock: 16, minStock: 4, barcode: 'DEMO-RET-011' },
  { name: 'Canvas Sneakers', price: 399.00, costPrice: 245.00, category: 'Clothing', section: 'Retail', subCategory: 'Footwear', stock: 20, minStock: 5, barcode: 'DEMO-RET-012' },
  { name: 'Ceramic Mug Set', price: 149.00, costPrice: 78.00, category: 'Home Decor', section: 'Retail', subCategory: 'Kitchenware', stock: 24, minStock: 5, barcode: 'DEMO-RET-013' },
  { name: 'Desk Lamp', price: 259.00, costPrice: 150.00, category: 'Home Decor', section: 'Retail', subCategory: 'Lighting', stock: 12, minStock: 3, barcode: 'DEMO-RET-014' },
  { name: 'Phone Screen Repair', price: 899.00, costPrice: 520.00, category: 'Repair', section: 'Service', subCategory: 'Mobile', stock: 999, minStock: 0, barcode: 'DEMO-RET-015' },
];

export function getCategoryIcon(cat: string): string {
  switch (cat) {
    case 'Beverages': return '☕';
    case 'Snacks': return '🥨';
    case 'Electronics': return '🎁';
    case 'Groceries': return '🥪';
    default: return '📦';
  }
}

export function getProductImage(product: { name?: string; category?: string; imageUrl?: string }): string {
  if (product.imageUrl) return product.imageUrl;
  const bgColor = '1e293b';
  const textColor = 'f8fafc';
  return `https://placehold.co/600x600/${bgColor}/${textColor}?text=${encodeURIComponent(product.name || 'Product')}%0A${encodeURIComponent(product.category || 'Category')}`;
}
