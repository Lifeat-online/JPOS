import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, screen, within } from '@testing-library/react';
import { renderWithRouter } from './test-utils.tsx';
import { PointOfSaleView } from '../../src/views/PointOfSaleView.tsx';
import { usePosStore } from '../../src/store/usePosStore.ts';
import type { AppConfig, Customer, Product, RestaurantTable, Sale, Staff, Workstation } from '../../src/types.ts';

vi.mock('../../src/api.js', () => ({
  getCompanionDeviceAssignment: vi.fn(() => Promise.resolve(null)),
  recordCashMovement: vi.fn(() => Promise.resolve({})),
  recordRegisterWalletCashMovement: vi.fn(() => Promise.resolve({ nextBalance: 0 })),
}));

const staff: Staff = {
  id: 'staff_1',
  name: 'Cashier One',
  role: 'cashier',
  email: 'cashier@example.com',
  status: 'active',
  createdAt: '2026-06-04',
};

const config: AppConfig = {
  payfastMerchantId: '',
  payfastMerchantKey: '',
  payfastPassphrase: '',
  payfastSandbox: true,
  business: {
    name: 'Jimmy Test Store',
    currency: 'R',
    isRestaurantMode: true,
  },
};

const products: Product[] = [
  {
    id: 'prod_1',
    name: 'Burger',
    price: 95,
    category: 'Meals',
    section: 'Food',
    stock: 20,
    minStock: 5,
    workstationId: 'ws_1',
  },
];

const dessertProduct: Product = {
  id: 'prod_2',
  name: 'Cake Slice',
  price: 40,
  costPrice: 12,
  category: 'Meals',
  section: 'Food',
  stock: 12,
  minStock: 3,
  workstationId: 'ws_1',
};

const customers: Customer[] = [
  {
    id: 'cust_1',
    name: 'Regular Customer',
    email: 'regular@example.com',
    loyaltyPoints: 160,
  },
];

const workstations: Workstation[] = [
  { id: 'ws_1', name: 'Kitchen', type: 'kitchen', status: 'active' },
];

const restaurantTables: RestaurantTable[] = [
  { id: 'T1', label: 'Table 1', sectionId: 'main', status: 'active' },
  { id: 'T2', label: 'Table 2', sectionId: 'main', status: 'active' },
];

const sales: Sale[] = [
  {
    id: 'parked_sale_1',
    items: [{ ...products[0], quantity: 1 }],
    total: 95,
    paymentMethod: 'pending',
    status: 'open',
    createdAt: '2026-06-04T08:00:00.000Z',
  },
  {
    id: 'table_sale_1',
    items: [{ ...products[0], quantity: 1, status: 'pending', workstationId: 'ws_1' } as any],
    total: 95,
    paymentMethod: 'pending',
    status: 'open',
    tableNumber: 'T1',
    createdAt: '2026-06-04T08:05:00.000Z',
  },
  {
    id: 'table_sale_2',
    items: [{ ...products[0], quantity: 1, status: 'accepted', workstationId: 'ws_1' } as any],
    total: 95,
    paymentMethod: 'pending',
    status: 'kitchen',
    tableNumber: 'T2',
    createdAt: '2026-06-04T08:10:00.000Z',
  },
  {
    id: 'tab_sale_1',
    items: [{ ...products[0], quantity: 1 }],
    total: 95,
    paymentMethod: 'pending',
    status: 'open',
    isTab: true,
    tabName: 'Regular Customer',
    customerId: 'cust_1',
    createdAt: '2026-06-04T08:15:00.000Z',
  },
];

function renderPos(options: {
  products?: Product[];
  cart?: any[];
  activeSession?: any;
  checkoutRecovery?: { message: string; method?: any; createdAt?: string } | null;
  offlineStatus?: any;
  selectedCustomerId?: string | null;
  appliedPromotion?: any;
  promotionDiscount?: number;
} = {}) {
  const viewProducts = options.products || products;
  const activeSession = Object.prototype.hasOwnProperty.call(options, 'activeSession')
    ? options.activeSession
    : {
        id: 'cash_1',
        staffId: staff.id,
        staffName: staff.name,
        expectedCash: 1250,
        status: 'open',
      };
  usePosStore.setState({
    cart: options.cart || [],
    currentUserStaff: staff,
    activeSession,
    config,
    tenantId: 'tenant_1',
    workstations,
    activeSection: 'All',
    activeCategory: 'All',
    searchQuery: '',
    selectedCustomerId: options.selectedCustomerId ?? null,
    activeTableNumber: null,
    activeOrderId: null,
    isCartOpen: false,
  });

  return renderWithRouter(
    <PointOfSaleView
      products={viewProducts}
      user={{ id: 'user_1', email: 'cashier@example.com', role: 'cashier' } as any}
      customers={customers}
      sales={sales}
      workstations={workstations}
      isProcessing={false}
      setIsProcessing={vi.fn()}
      handleSaveOrder={vi.fn(() => Promise.resolve())}
      handleParkSale={vi.fn(() => Promise.resolve(null))}
      handleCheckout={vi.fn(() => Promise.resolve())}
      handleWalletCheckout={vi.fn(() => Promise.resolve())}
      handleAccountCheckout={vi.fn(() => Promise.resolve())}
      handleOpenTab={vi.fn(() => Promise.resolve())}
      handleOpenTable={vi.fn(() => Promise.resolve())}
      setTenderModal={vi.fn()}
      setTenderedAmount={vi.fn()}
      setSplitPaymentModal={vi.fn()}
      categoryTree={{ Food: { Meals: true } }}
      CATEGORIES={['Meals']}
      getCategoryIcon={() => 'Food'}
      getProductImage={() => ''}
      openCashDrawer={vi.fn()}
      pointsDiscount={0}
      pricingDiscount={{ amount: 0, percent: 0, label: '', source: 'none' }}
      totalDiscount={0}
      promotionCode=""
      setPromotionCode={vi.fn()}
      appliedPromotion={options.appliedPromotion || null}
      promotionDiscount={options.promotionDiscount ?? 0}
      promotionError={null}
      promotionLoading={false}
      onApplyPromotionCode={vi.fn(() => Promise.resolve())}
      onClearPromotion={vi.fn()}
      onRedeemPoints={vi.fn()}
      onClearPointsDiscount={vi.fn()}
      restaurantTables={restaurantTables}
      lastReceiptSale={{
        id: 'last_sale_87654321',
        items: [{ ...products[0], quantity: 1 }],
        total: 95,
        paymentMethod: 'cash',
        status: 'completed',
        createdAt: '2026-06-04T07:55:00.000Z',
      }}
      onPrintLastReceipt={vi.fn()}
      checkoutRecovery={options.checkoutRecovery || null}
      onDismissCheckoutRecovery={vi.fn()}
      offlineStatus={options.offlineStatus}
    />,
    { route: '/pos' }
  );
}

describe('PointOfSaleView daily action strip', () => {
  beforeEach(() => {
    window.localStorage.clear();
    vi.clearAllMocks();
  });

  it('summarizes the register daily actions on the first POS screen', () => {
    renderPos();

    const strip = within(screen.getByRole('group', { name: /daily pos actions/i }));
    expect(strip.getByRole('button', { name: /Register Cashier One Expected R1250\.00/i })).toBeInTheDocument();
    expect(strip.getByRole('button', { name: /Receipt #87654321 Reprint last/i })).toBeInTheDocument();
    expect(strip.getByRole('button', { name: /Drawer No sale Record reason/i })).toBeInTheDocument();
    expect(strip.getByRole('button', { name: /Parked 1 waiting Resume latest/i })).toBeInTheDocument();
    expect(strip.getByRole('button', { name: /Tables 2 open Floor view/i })).toBeInTheDocument();
    expect(strip.getByRole('button', { name: /Tabs 1 open Review tabs/i })).toBeInTheDocument();
    expect(strip.getByRole('button', { name: /Queue 2 pending Workstations/i })).toBeInTheDocument();
  });

  it('shows workflow recovery actions for common POS blockers', () => {
    renderPos({
      products: [{ ...products[0], stock: 0 }],
      cart: [{ ...products[0], quantity: 1 }],
      checkoutRecovery: {
        message: 'Card terminal declined the payment.',
        method: 'card',
        createdAt: '2026-06-04T09:00:00.000Z',
      },
      offlineStatus: {
        isOffline: true,
        pendingCount: 1,
        syncStatus: 'error',
        lastError: 'Network unavailable',
        queueItems: [{ id: 'offline_1', status: 'failed' }],
        syncNow: vi.fn(),
      },
    });

    const recovery = within(screen.getByRole('region', { name: /pos recovery actions/i }));
    expect(recovery.getByText(/No sellable stock/i)).toBeInTheDocument();
    expect(recovery.getByRole('button', { name: /Open inventory/i })).toBeInTheDocument();
    expect(recovery.getByText(/Customer not selected/i)).toBeInTheDocument();
    expect(recovery.getByRole('button', { name: /Choose customer/i })).toBeInTheDocument();
    expect(recovery.getByText(/Payment needs attention/i)).toBeInTheDocument();
    expect(recovery.getByText(/Card terminal declined the payment/i)).toBeInTheDocument();
    expect(recovery.getByRole('button', { name: /^Retry$/i })).toBeInTheDocument();
    expect(recovery.getByText(/Sync needs review/i)).toBeInTheDocument();
    expect(recovery.getByText(/Network unavailable/i)).toBeInTheDocument();
    expect(recovery.getByText(/Receipt printer: Check printer/i)).toBeInTheDocument();
  });

  it('routes a closed register to the open-register recovery action', () => {
    renderPos({ activeSession: null });

    expect(screen.getByText(/Register Closed/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Open Register/i })).toBeInTheDocument();
  });

  it('shows a cashier-facing AI upsell prompt from cart, customer, stock, margin, and promotions', () => {
    renderPos({
      products: [products[0], dessertProduct],
      cart: [{ ...products[0], quantity: 1 }],
      selectedCustomerId: 'cust_1',
      appliedPromotion: {
        id: 'promo_1',
        code: 'LUNCH',
        name: 'Lunch add-on',
        status: 'active',
        discountType: 'fixed',
        discountValue: 5,
        minSubtotal: 0,
        appliesTo: 'cart',
        targetProductIds: [],
        targetCategories: [],
        customerScope: 'all',
        targetCustomerIds: [],
        redemptionCount: 0,
      },
      promotionDiscount: 5,
    });

    const prompt = within(screen.getByRole('group', { name: /cashier ai upsell prompt/i }));
    expect(prompt.getByText(/Suggested add-on/i)).toBeInTheDocument();
    expect(prompt.getByText(/Cake Slice/i)).toBeInTheDocument();
    expect(prompt.getByText(/R28\.00 margin/i)).toBeInTheDocument();
    expect(prompt.getByText(/12 in stock/i)).toBeInTheDocument();
    expect(prompt.getByText(/160 loyalty pts/i)).toBeInTheDocument();

    fireEvent.click(prompt.getByRole('button', { name: /Add suggested Cake Slice/i }));

    expect(usePosStore.getState().cart.some(item => item.name === 'Cake Slice')).toBe(true);
  });
});
