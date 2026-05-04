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
  { name: 'Coffee', price: 25.00, category: 'Beverages', section: 'Food & Beverage', subCategory: 'Hot Drinks', stock: 100, barcode: '123456' },
  { name: 'Soda', price: 15.00, category: 'Beverages', section: 'Food & Beverage', subCategory: 'Cold Drinks', stock: 80, barcode: '223344' },
  { name: 'Chips', price: 12.50, category: 'Snacks', section: 'Food & Beverage', subCategory: 'Savoury', stock: 120, barcode: '556677' },
  { name: 'Chocolate', price: 18.00, category: 'Snacks', section: 'Food & Beverage', subCategory: 'Sweets', stock: 50, barcode: '889900' },
  { name: 'Headphones', price: 450.00, category: 'Electronics', section: 'Retail', subCategory: 'Audio', stock: 10, barcode: '112233' },
  { name: 'Milk', price: 22.00, category: 'Groceries', section: 'Retail', subCategory: 'Dairy', stock: 40, barcode: '445566' },
  { name: 'Bread', price: 16.00, category: 'Groceries', section: 'Retail', subCategory: 'Bakery', stock: 35, barcode: '778899' },
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
