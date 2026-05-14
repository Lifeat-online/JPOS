/**
 * useCheckout — MariaDB REST edition.
 * Replaces all Firestore addDoc/updateDoc calls with REST API calls.
 */
import { useState, useMemo } from 'react';
import { JwtUser } from './useAuth';
import { Customer, Staff, AppConfig } from '../types';
import { usePosStore } from '../store/usePosStore';
import { apiPost, apiPut, createSale, updateCustomer, updateStaff, getSaleById } from '../api';

interface CheckoutDeps {
  user: JwtUser | null;
  tenantId: string | null;
  currentUserStaff: Staff | null;
  customers: Customer[];
  activeSession: any | null;
  config: AppConfig;
  refreshSales: () => Promise<void>;
}

export function useCheckout({ user, tenantId, currentUserStaff, customers, activeSession, config, refreshSales }: CheckoutDeps) {
  const {
    cart, clearCart,
    selectedCustomerId, setSelectedCustomerId,
    activeTableNumber, setActiveTableNumber,
    activeOrderId, setActiveOrderId,
  } = usePosStore();

  const [isProcessing, setIsProcessing] = useState(false);
  const [tenderedAmount, setTenderedAmount] = useState<number | string>('');
  const [cardOverageAction, setCardOverageAction] = useState<'tip' | 'cashout'>('tip');
  const [pointsDiscount, setPointsDiscount] = useState(0);
  const [tenderModal, setTenderModal] = useState<{ isOpen: boolean; method: 'cash' | 'card' | null }>({
    isOpen: false, method: null,
  });
  const [checkoutModal, setCheckoutModal] = useState<{
    isOpen: boolean;
    paymentMethod: 'cash' | 'payfast' | 'card' | 'wallet' | null;
    saleData?: any;
  }>({ isOpen: false, paymentMethod: null });

  // ── Tax calculations ─────────────────────────────────────────────────────────
  const taxRate = config?.business?.taxRate || 0;
  const taxInclusive = config?.business?.taxInclusive !== false;

  const cartSubtotal = useMemo(
    () => cart.reduce((total, item) => total + item.price * item.quantity, 0),
    [cart]
  );

  const taxAmount = useMemo(() => {
    if (!taxRate) return 0;
    return taxInclusive
      ? cartSubtotal - cartSubtotal / (1 + taxRate / 100)
      : cartSubtotal * (taxRate / 100);
  }, [cartSubtotal, taxRate, taxInclusive]);

  const cartTotal = taxInclusive ? cartSubtotal : cartSubtotal + taxAmount;
  const cartTotalAfterDiscount = Math.max(0, cartTotal - pointsDiscount);

  const stampOrderItems = (items: any[], delivered = false) => {
    const now = new Date().toISOString();
    return items.map(item => ({
      ...item,
      status: delivered ? 'delivered' : (item.status || 'pending'),
      workstationId: item.workstationId,
      orderedAt: item.orderedAt || now,
      ...(delivered ? { deliveredAt: now } : {}),
    }));
  };

  // ── Points redemption ────────────────────────────────────────────────────────
  const redeemPoints = (customerId: string, customerPoints: number) => {
    if (!config?.business?.enableLoyalty) return;
    const { pointsRequiredForDiscount, discountAmountForPoints } = config.business;
    if (!pointsRequiredForDiscount || !discountAmountForPoints) return;
    if (customerPoints < pointsRequiredForDiscount) return;
    const setsOfPoints = Math.floor(customerPoints / pointsRequiredForDiscount);
    const discount = Math.min(setsOfPoints * discountAmountForPoints, cartTotal);
    setPointsDiscount(discount);
  };

  const clearPointsDiscount = () => setPointsDiscount(0);

  // ── Shared loyalty points update ─────────────────────────────────────────────
  const updateLoyaltyPoints = async (amountPaid: number) => {
    if (!selectedCustomerId || !config?.business?.enableLoyalty || !config?.business?.pointsEarnedPerCurrency || !tenantId) return;
    const pointsEarned = Math.floor(amountPaid / config.business.pointsEarnedPerCurrency);
    const customer = customers.find(c => c.id === selectedCustomerId);
    const currentPoints = customer?.loyaltyPoints || customer?.points || 0;
    let pointsConsumed = 0;
    if (pointsDiscount > 0 && config.business.pointsRequiredForDiscount && config.business.discountAmountForPoints) {
      pointsConsumed = Math.ceil(pointsDiscount / config.business.discountAmountForPoints) * config.business.pointsRequiredForDiscount;
    }
    const newPoints = Math.max(0, currentPoints - pointsConsumed) + pointsEarned;
    await updateCustomer(tenantId, selectedCustomerId, { loyaltyPoints: newPoints }).catch(e =>
      console.warn('Failed to update loyalty points:', e)
    );
  };

  // ── Reset cart state after checkout ─────────────────────────────────────────
  const resetAfterCheckout = () => {
    clearCart();
    setSelectedCustomerId(null);
    setActiveOrderId(null);
    setActiveTableNumber(null);
    setPointsDiscount(0);
  };

  // ── Save order (restaurant hold/send to workstations) ────────────────────────
  const handleSaveOrder = async (sendToWorkstations: boolean, navigate: (path: string) => void) => {
    if (cart.length === 0 || !tenantId) return;
    setIsProcessing(true);
    try {
      const saleData: any = {
        items: stampOrderItems(cart),
        total: Number(cartTotalAfterDiscount) || 0,
        subtotal: Number(cartSubtotal) || 0,
        taxAmount: Number(taxAmount) || 0,
        taxRate: taxRate || null,
        taxInclusive,
        paymentMethod: 'pending',
        status: sendToWorkstations ? 'kitchen' : 'open',
        customerId: selectedCustomerId || null,
        staffId: currentUserStaff?.id || null,
        ...(pointsDiscount > 0 ? { pointsDiscount } : {}),
      };
      if (activeTableNumber) saleData.tableNumber = activeTableNumber;

      let saleId = activeOrderId;
      if (activeOrderId) {
        await apiPut(`/api/mariadb/tenants/${tenantId}/sales/${activeOrderId}`, saleData);
      } else {
        const created = await createSale(tenantId, saleData);
        saleId = created.id;
        setActiveOrderId(saleId);
      }

      await refreshSales();

      if (!sendToWorkstations) {
        resetAfterCheckout();
        navigate('/tables');
      } else if (saleId) {
        // Fetch fresh sale to update the cart with real sale_item IDs and statuses
        // This prevents overwriting workstation progress on subsequent saves
        const freshSale = await getSaleById(tenantId, saleId).catch(() => null);
        if (freshSale && freshSale.items) {
          const sanitizedItems = freshSale.items.map((item: any) => ({
            ...item,
            price: Number(item.price || 0),
            quantity: Number(item.quantity || 0),
          }));
          usePosStore.getState().setCart(sanitizedItems);
        }
      }
    } catch (error) {
      console.error(error);
      alert('Error saving order');
    } finally {
      setIsProcessing(false);
    }
  };

  // ── Open / update a bar tab ──────────────────────────────────────────────────
  const handleOpenTab = async (tabName?: string) => {
    if (cart.length === 0 || !selectedCustomerId || !tenantId) return;
    setIsProcessing(true);
    try {
      const saleData: any = {
        items: stampOrderItems(cart),
        total: Number(cartTotalAfterDiscount) || 0,
        subtotal: Number(cartSubtotal) || 0,
        taxAmount: Number(taxAmount) || 0,
        taxRate: taxRate || null,
        taxInclusive,
        paymentMethod: 'pending',
        status: 'open',
        isTab: true,
        tabName: tabName || null,
        customerId: selectedCustomerId,
        staffId: currentUserStaff?.id || null,
        ...(pointsDiscount > 0 ? { pointsDiscount } : {}),
      };

      let saleId = activeOrderId;
      if (activeOrderId) {
        await apiPut(`/api/mariadb/tenants/${tenantId}/sales/${activeOrderId}`, saleData);
      } else {
        const created = await createSale(tenantId, saleData);
        saleId = created.id;
        setActiveOrderId(saleId);
      }

      await refreshSales();
      
      // Update cart to sync with real sale_item IDs from the DB
      if (saleId) {
        const freshSale = await getSaleById(tenantId, saleId).catch(() => null);
        if (freshSale && freshSale.items) {
          const sanitizedItems = freshSale.items.map((item: any) => ({
            ...item,
            price: Number(item.price || 0),
            quantity: Number(item.quantity || 0),
          }));
          usePosStore.getState().setCart(sanitizedItems);
        }
      }
    } catch (err) {
      console.error('Failed to open tab:', err);
      alert('Error saving tab');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleCheckout = async (method: 'cash' | 'payfast' | 'card') => {
    if (cart.length === 0 || !tenantId) return;
    setIsProcessing(true);

    try {
      const saleData: any = {
        items: stampOrderItems(cart, true),
        total: Number(cartTotalAfterDiscount) || 0,
        subtotal: Number(cartSubtotal) || 0,
        taxAmount: Number(taxAmount) || 0,
        taxRate: taxRate || null,
        taxInclusive,
        paymentMethod: method,
        status: method === 'payfast' ? 'pending' : 'completed',
        customerId: selectedCustomerId || null,
        staffId: currentUserStaff?.id || null,
        ...(pointsDiscount > 0 ? { pointsDiscount } : {}),
        ...(activeTableNumber ? { tableNumber: activeTableNumber } : {}),
      };

      if (method === 'cash' || method === 'card') {
        saleData.tenderedAmount = Number(tenderedAmount || 0);
        const overage = Math.max(0, Number(tenderedAmount || 0) - cartTotalAfterDiscount);
        if (method === 'cash') {
          saleData.changeAmount = overage;
        } else {
          if (cardOverageAction === 'tip') saleData.tipAmount = overage;
          else saleData.cashOutAmount = overage;
        }
      }

      let saleId = '';
      if (activeOrderId) {
        await apiPut(`/api/mariadb/tenants/${tenantId}/sales/${activeOrderId}`, saleData);
        saleId = activeOrderId;
      } else {
        const created = await createSale(tenantId, saleData);
        saleId = created.id;
      }

      await refreshSales();

      if (method === 'cash' || method === 'card') {
        // Update loyalty points
        await updateLoyaltyPoints(cartTotalAfterDiscount);

        // Update cash session totals
        if (activeSession?.id) {
          const sessionUpdates: any = {};
          if (method === 'cash') {
            sessionUpdates.expectedCashDelta = cartTotalAfterDiscount;
          } else if (method === 'card') {
            if (cardOverageAction === 'cashout') sessionUpdates.expectedCashDelta = -(saleData.cashOutAmount || 0);
            else if (cardOverageAction === 'tip' && saleData.tipAmount > 0) sessionUpdates.tipsDelta = saleData.tipAmount;
          }
          if (Object.keys(sessionUpdates).length > 0) {
            await apiPut(`/api/mariadb/tenants/${tenantId}/cash-sessions/${activeSession.id}`, sessionUpdates)
              .catch(e => console.warn('Failed to update session:', e));
          }
        }

        // Update staff metrics
        if (currentUserStaff?.id) {
          const metricsUpdate: any = { metricsOrdersDelta: 1 };
          if (saleData.tipAmount > 0) metricsUpdate.metricsTipsDelta = saleData.tipAmount;
          await updateStaff(tenantId, currentUserStaff.id, metricsUpdate)
            .catch(e => console.warn('Failed to update staff metrics:', e));
        }

        resetAfterCheckout();
        setTenderModal({ isOpen: false, method: null });
        setCheckoutModal({ isOpen: true, paymentMethod: method, saleData: { ...saleData, id: saleId } });
        setIsProcessing(false);
      } else {
        // PayFast redirect
        const response = await fetch('/api/payfast/generate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            amount: cartTotalAfterDiscount,
            item_name: `POS Purchase - ${saleId}`,
            sale_id: saleId,
            return_url: window.location.href + '?payment=success',
            cancel_url: window.location.href + '?payment=cancel',
          }),
        });
        const { url, fields } = await response.json();
        const form = document.createElement('form');
        form.method = 'POST';
        form.action = url;
        Object.keys(fields).forEach(key => {
          const input = document.createElement('input');
          input.type = 'hidden';
          input.name = key;
          input.value = fields[key];
          form.appendChild(input);
        });
        document.body.appendChild(form);
        form.submit();
      }
    } catch (err) {
      console.error('Checkout failed:', err);
      setIsProcessing(false);
    }
  };

  // ── Wallet checkout ──────────────────────────────────────────────────────────
  const handleWalletCheckout = async () => {
    if (cart.length === 0 || !currentUserStaff || !tenantId) return;
    const balance = currentUserStaff.walletBalance || 0;
    if (balance < cartTotalAfterDiscount) return;

    setIsProcessing(true);
    try {
      const saleData: any = {
        items: stampOrderItems(cart, true),
        total: Number(cartTotalAfterDiscount) || 0,
        subtotal: Number(cartSubtotal) || 0,
        taxAmount: Number(taxAmount) || 0,
        taxRate: taxRate || null,
        taxInclusive,
        paymentMethod: 'wallet',
        status: 'completed',
        customerId: selectedCustomerId || null,
        staffId: currentUserStaff.id,
        tenderedAmount: cartTotalAfterDiscount,
        changeAmount: 0,
        ...(pointsDiscount > 0 ? { pointsDiscount } : {}),
        ...(activeTableNumber ? { tableNumber: activeTableNumber } : {}),
      };

      let saleId = '';
      if (activeOrderId) {
        await apiPut(`/api/mariadb/tenants/${tenantId}/sales/${activeOrderId}`, saleData);
        saleId = activeOrderId;
      } else {
        const created = await createSale(tenantId, saleData);
        saleId = created.id;
      }

      await refreshSales();

      // Deduct from staff wallet + update metrics
      await updateStaff(tenantId, currentUserStaff.id, {
        walletBalance: balance - cartTotalAfterDiscount,
        metricsOrdersDelta: 1,
      });

      // Award loyalty points
      await updateLoyaltyPoints(cartTotalAfterDiscount);

      resetAfterCheckout();
      setCheckoutModal({ isOpen: true, paymentMethod: 'wallet', saleData: { ...saleData, id: saleId } });
    } catch (err) {
      console.error('Wallet checkout failed:', err);
    } finally {
      setIsProcessing(false);
    }
  };

  return {
    isProcessing, setIsProcessing,
    tenderedAmount, setTenderedAmount,
    cardOverageAction, setCardOverageAction,
    pointsDiscount, redeemPoints, clearPointsDiscount,
    tenderModal, setTenderModal,
    checkoutModal, setCheckoutModal,
    cartSubtotal, taxAmount,
    cartTotal: cartTotalAfterDiscount,
    cartTotalBeforeDiscount: cartTotal,
    handleSaveOrder,
    handleOpenTab,
    handleCheckout,
    handleWalletCheckout,
  };
}
