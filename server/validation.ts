import { Request, Response, NextFunction } from 'express';

// ── Input Validation Middleware ──────────────────────────────────────────────

export function validateSchema(schema: any) {
  return (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = schema.safeParse(req.body);
      if (!result.success) {
        return res.status(400).json({
          error: 'Invalid input',
          details: result.error.errors.map(e => ({
            path: e.path.join('.'),
            message: e.message
          }))
        });
      }
      next();
    } catch (err) {
      next(err);
    }
  };
}

// ── Validation Schemas ───────────────────────────────────────────────────────

import { z } from 'zod';

export const LoginSchema = z.object({
  email: z.string().email({ message: 'Invalid email address' }),
  password: z.string().min(6, { message: 'Password must be at least 6 characters' }),
  tenantId: z.string().optional()
});

export const PasswordSetupSchema = z.object({
  staffId: z.string().min(1, { message: 'Staff ID is required' }),
  password: z.string()
    .min(8, { message: 'Password must be at least 8 characters' })
    .regex(/[A-Z]/, { message: 'Password must contain at least one uppercase letter' })
    .regex(/[a-z]/, { message: 'Password must contain at least one lowercase letter' })
    .regex(/[0-9]/, { message: 'Password must contain at least one number' })
});

export const ProductSchema = z.object({
  name: z.string().min(1, { message: 'Product name is required' }),
  price: z.number().min(0, { message: 'Price must be positive' }),
  costPrice: z.number().min(0).optional(),
  section: z.string().optional(),
  category: z.string().optional(),
  subCategory: z.string().optional(),
  stock: z.number().min(0).optional(),
  minStock: z.number().min(0).optional(),
  imageUrl: z.string().url().optional(),
  barcode: z.string().optional(),
  workstationId: z.string().optional()
});

export const CustomerSchema = z.object({
  name: z.string().min(1, { message: 'Customer name is required' }),
  email: z.string().email({ message: 'Invalid email address' }).optional(),
  phone: z.string().min(10, { message: 'Phone number must be at least 10 digits' }).optional(),
  address: z.string().optional(),
  notes: z.string().optional(),
  loyaltyPoints: z.number().min(0).optional(),
  walletBalance: z.number().min(0).optional(),
  uid: z.string().optional()
});

export const StaffSchema = z.object({
  name: z.string().min(1, { message: 'Staff name is required' }),
  role: z.enum(['admin', 'cashier', 'manager', 'chef', 'dev'], { message: 'Invalid role' }),
  email: z.string().email({ message: 'Invalid email address' }),
  phone: z.string().min(10, { message: 'Phone number must be at least 10 digits' }).optional(),
  status: z.enum(['active', 'inactive']).optional(),
  assignedSections: z.array(z.string()).optional(),
  assignedCategories: z.array(z.string()).optional(),
  idNumber: z.string().optional(),
  payRate: z.number().min(0).optional(),
  payType: z.enum(['hourly', 'salary']).optional(),
  accumulatedLeave: z.number().min(0).optional(),
  walletBalance: z.number().min(0).optional()
});

export const SaleSchema = z.object({
  items: z.array(z.object({
    productId: z.string().optional(),
    name: z.string().min(1),
    price: z.number().min(0),
    quantity: z.number().min(1),
    status: z.string().optional(),
    workstationId: z.string().optional()
  })).min(1, { message: 'Sale must have at least one item' }),
  total: z.number().min(0),
  subtotal: z.number().min(0),
  taxAmount: z.number().min(0).optional(),
  taxRate: z.number().min(0).optional(),
  taxInclusive: z.boolean().optional(),
  paymentMethod: z.enum(['cash', 'payfast', 'card', 'wallet', 'pending']).optional(),
  tenderedAmount: z.number().min(0).optional(),
  changeAmount: z.number().min(0).optional(),
  tipAmount: z.number().min(0).optional(),
  cashOutAmount: z.number().min(0).optional(),
  pointsDiscount: z.number().min(0).optional(),
  status: z.enum(['pending', 'completed', 'failed', 'open', 'kitchen']).optional(),
  customerId: z.string().optional(),
  staffId: z.string().optional(),
  tableNumber: z.string().optional(),
  isTab: z.boolean().optional(),
  tabName: z.string().optional()
});

export const WorkstationSchema = z.object({
  name: z.string().min(1, { message: 'Workstation name is required' }),
  type: z.enum(['kitchen', 'bar', 'other']).optional(),
  status: z.enum(['active', 'inactive']).optional()
});

export const TableSectionSchema = z.object({
  name: z.string().min(1, { message: 'Section name is required' }),
  color: z.string().optional(),
  order: z.number().min(0).optional()
});

export const RestaurantTableSchema = z.object({
  label: z.string().min(1, { message: 'Table label is required' }),
  sectionId: z.string().optional(),
  capacity: z.number().min(1).optional(),
  status: z.enum(['active', 'inactive']).optional()
});

// ── Type Inference ───────────────────────────────────────────────────────────

export type LoginInput = z.infer<typeof LoginSchema>;
export type PasswordSetupInput = z.infer<typeof PasswordSetupSchema>;
export type ProductInput = z.infer<typeof ProductSchema>;
export type CustomerInput = z.infer<typeof CustomerSchema>;
export type StaffInput = z.infer<typeof StaffSchema>;
export type SaleInput = z.infer<typeof SaleSchema>;
export type WorkstationInput = z.infer<typeof WorkstationSchema>;
export type TableSectionInput = z.infer<typeof TableSectionSchema>;
export type RestaurantTableInput = z.infer<typeof RestaurantTableSchema>;
