import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, screen } from '@testing-library/react';
import { renderWithRouter } from './test-utils.tsx';
import { LoginModal } from '../../src/components/LoginModal.tsx';
import { TenderModal } from '../../src/components/modals/TenderModal.tsx';
import { PointOfSaleView } from '../../src/views/PointOfSaleView.tsx';
import { usePosStore } from '../../src/store/usePosStore.ts';
import type { AppConfig, Product, Staff, Workstation } from '../../src/types.ts';

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
  createdAt: '2026-06-05',
};

const config: AppConfig = {
  payfastMerchantId: '',
  payfastMerchantKey: '',
  payfastPassphrase: '',
  payfastSandbox: true,
  business: {
    name: 'Jimmy Test Store',
    currency: 'R',
    isRestaurantMode: false,
  },
};

const product: Product = {
  id: 'prod_1',
  name: 'Burger',
  price: 95,
  costPrice: 50,
  category: 'Meals',
  section: 'Food',
  stock: 20,
  minStock: 5,
};

const workstations: Workstation[] = [];

function LoginToCheckoutHarness({
  onLogin,
  onCheckout,
}: {
  onLogin: (email: string, password: string) => void;
  onCheckout: (payload: { method: string; total: number }) => void;
}) {
  const [loggedIn, setLoggedIn] = React.useState(false);
  const [isProcessing, setIsProcessing] = React.useState(false);
  const [tenderModal, setTenderModal] = React.useState<{ isOpen: boolean; method: 'cash' | 'card' | null }>({ isOpen: false, method: null });
  const [tenderedAmount, setTenderedAmount] = React.useState('');
  const [cardOverageAction, setCardOverageAction] = React.useState<'tip' | 'cashout'>('tip');
  const cart = usePosStore(state => state.cart);
  const cartTotal = cart.reduce((sum, item) => sum + Number(item.price || 0) * Number(item.quantity || 0), 0);

  if (!loggedIn) {
    return (
      <LoginModal
        isOpen
        error={null}
        isLoading={false}
        onClose={vi.fn()}
        onSubmit={async (email, password) => {
          onLogin(email, password);
          setLoggedIn(true);
        }}
      />
    );
  }

  return (
    <>
      <PointOfSaleView
        products={[product]}
        user={{ id: 'user_1', email: 'cashier@example.com', role: 'cashier' } as any}
        customers={[]}
        sales={[]}
        workstations={workstations}
        isProcessing={isProcessing}
        setIsProcessing={setIsProcessing}
        handleSaveOrder={vi.fn(() => Promise.resolve())}
        handleParkSale={vi.fn(() => Promise.resolve(null))}
        handleCheckout={async (method) => {
          onCheckout({ method, total: cartTotal });
          usePosStore.getState().clearCart();
        }}
        handleWalletCheckout={vi.fn(() => Promise.resolve())}
        handleAccountCheckout={vi.fn(() => Promise.resolve())}
        handleOpenTab={vi.fn(() => Promise.resolve())}
        handleOpenTable={vi.fn(() => Promise.resolve())}
        setTenderModal={setTenderModal}
        setTenderedAmount={setTenderedAmount}
        setSplitPaymentModal={vi.fn()}
        categoryTree={{ Food: { Meals: true } }}
        CATEGORIES={['Meals']}
        getCategoryIcon={() => 'Food'}
        getProductImage={() => 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw=='}
        openCashDrawer={vi.fn()}
        pointsDiscount={0}
        pricingDiscount={{ amount: 0, percent: 0, label: '', source: 'none' }}
        totalDiscount={0}
        promotionCode=""
        setPromotionCode={vi.fn()}
        appliedPromotion={null}
        promotionDiscount={0}
        promotionError={null}
        promotionLoading={false}
        onApplyPromotionCode={vi.fn(() => Promise.resolve())}
        onClearPromotion={vi.fn()}
        onRedeemPoints={vi.fn()}
        onClearPointsDiscount={vi.fn()}
        restaurantTables={[]}
        suppressBillPrint
        offlineStatus={{ isOffline: false, pendingCount: 0, syncStatus: 'idle' }}
      />
      {tenderModal.isOpen && tenderModal.method && (
        <TenderModal
          method={tenderModal.method}
          cartTotal={cartTotal}
          tenderedAmount={tenderedAmount}
          cardOverageAction={cardOverageAction}
          isProcessing={isProcessing}
          onTenderedChange={setTenderedAmount}
          onCardOverageChange={setCardOverageAction}
          onClose={() => setTenderModal({ isOpen: false, method: null })}
          onConfirm={() => {
            setIsProcessing(true);
            onCheckout({ method: tenderModal.method!, total: cartTotal });
            usePosStore.getState().clearCart();
            setTenderModal({ isOpen: false, method: null });
            setIsProcessing(false);
          }}
        />
      )}
    </>
  );
}

describe('login through checkout UI flow', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.localStorage.clear();
    usePosStore.setState({
      cart: [],
      currentUserStaff: staff,
      activeSession: {
        id: 'cash_1',
        staffId: staff.id,
        staffName: staff.name,
        expectedCash: 250,
        status: 'open',
      },
      config,
      tenantId: 'tenant_1',
      workstations,
      activeSection: 'All',
      activeCategory: 'All',
      searchQuery: '',
      selectedCustomerId: null,
      activeTableNumber: null,
      activeOrderId: null,
      isCartOpen: false,
    });
  });

  it('logs in, adds a product, tenders cash, and confirms checkout', async () => {
    const onLogin = vi.fn();
    const onCheckout = vi.fn();

    renderWithRouter(<LoginToCheckoutHarness onLogin={onLogin} onCheckout={onCheckout} />, { route: '/' });

    fireEvent.change(screen.getByLabelText(/Email Address/i), { target: { value: 'cashier@example.com' } });
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'secret123' } });
    fireEvent.click(screen.getByRole('button', { name: /sign in/i }));

    expect(onLogin).toHaveBeenCalledWith('cashier@example.com', 'secret123');

    fireEvent.click(await screen.findByText('Burger'));
    expect(screen.getByText(/Grand Total/i)).toBeInTheDocument();
    expect(screen.getAllByText('R95.00').length).toBeGreaterThan(0);

    fireEvent.click(screen.getByRole('button', { name: /^cash$/i }));
    expect(await screen.findByText(/Cash Payment/i)).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText(/Amount Tendered/i), { target: { value: '100' } });
    fireEvent.click(screen.getByRole('button', { name: /confirm/i }));

    expect(onCheckout).toHaveBeenCalledWith({ method: 'cash', total: 95 });
  });
});
