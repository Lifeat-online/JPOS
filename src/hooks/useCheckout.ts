import { useState, useMemo } from 'react';
import { User } from 'firebase/auth';
import {
  addDoc, updateDoc,
  serverTimestamp, increment,
} from 'firebase/firestore';
import { db } from '../firebase';
import { Customer, Staff, AppConfig } from '../types';
import { usePosStore } from '../store/usePosStore';
import { getTenantCollection, getTenantDoc } from '../tenantHelper';

interface CheckoutDeps {
  user: User | null;
  tenantId: string | null;
  currentUserStaff: Staff | null;
  customers: Customer[];
  activeSession: any | null;
  config: AppConfig;
}

export function useCheckout({ user, tenantId, currentUserStaff, customers, activeSession, config }: CheckoutDeps) {
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
    return items.map(item => {
      const orderItem = {
        ...item,
        status: item.status || 'pending',
        workstationId: item.workstationId,
        orderedAt: item.orderedAt || serverTimestamp(),
      } as any;

      if (delivered) {
        orderItem.status = 'delivered';
        orderItem.deliveredAt = serverTimestamp();
      }

      return orderItem;
    });
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
    if (!selectedCustomerId || !config?.business?.enableLoyalty || !config?.business?.pointsEarnedPerCurrency) return;
    const pointsEarned = Math.floor(amountPaid / config.business.pointsEarnedPerCurrency);
    const customer = customers.find(c => c.id === selectedCustomerId);
    const currentPoints = customer?.loyaltyPoints || customer?.points || 0;
    let pointsConsumed = 0;
    if (pointsDiscount > 0 && config.business.pointsRequiredForDiscount && config.business.discountAmountForPoints) {
      pointsConsumed = Math.ceil(pointsDiscount / config.business.discountAmountForPoints) * config.business.pointsRequiredForDiscount;
    }
    await updateDoc(getTenantDoc(db, tenantId, 'customers', selectedCustomerId), {
      loyaltyPoints: Math.max(0, currentPoints - pointsConsumed) + pointsEarned,
    });
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
    if (cart.length === 0) return;
    setIsProcessing(true);
    try {
      const saleData: any = {
        items: stampOrderItems(cart),
        total: cartTotal,
        paymentMethod: 'pending',
        status: sendToWorkstations ? 'kitchen' : 'open',
        customerId: selectedCustomerId || null,
        userId: user?.uid || null,
        staffId: currentUserStaff?.id || null,
      };
      if (activeTableNumber) saleData.tableNumber = activeTableNumber;

      let savedId = activeOrderId;
      if (activeOrderId) {
        await updateDoc(getTenantDoc(db, tenantId, 'sales', activeOrderId), saleData);
      } else {
        saleData.createdAt = serverTimestamp();
        const ref = await addDoc(getTenantCollection(db, tenantId, 'sales'), saleData);
        savedId = ref.id;
        // Store the new order ID so subsequent sends update the same doc
        setActiveOrderId(savedId);
      }

      // Keep the cart loaded — the waiter may want to add more items or checkout.
      // Only navigate away if it was a Hold (not a Send).
      if (!sendToWorkstations) {
        // Hold: go back to tables
        resetAfterCheckout();
        navigate('/tables');
      }
      // Send to workstations: stay on POS, cart remains, order ID is set
    } catch (error) {
      console.error(error);
      alert('Error saving order');
    } finally {
      setIsProcessing(false);
    }
  };

  // ── Open / update a bar tab ──────────────────────────────────────────────────
  const handleOpenTab = async (tabName?: string) => {
    if (cart.length === 0 || !selectedCustomerId) return;
    setIsProcessing(true);
    try {
      const saleData: any = {
        items: stampOrderItems(cart),
        total: cartTotalAfterDiscount,
        subtotal: cartSubtotal,
        taxAmount: taxAmount || null,
        taxRate: taxRate || null,
        taxInclusive,
        paymentMethod: 'pending',
        status: 'open',
        isTab: true,
        tabName: tabName || null,
        customerId: selectedCustomerId,
        userId: user?.uid || null,
        staffId: currentUserStaff?.id || null,
        updatedAt: serverTimestamp(),
      };
      if (pointsDiscount > 0) saleData.pointsDiscount = pointsDiscount;

      let savedId = activeOrderId;
      if (activeOrderId) {
        await updateDoc(getTenantDoc(db, tenantId, 'sales', activeOrderId), saleData);
      } else {
        saleData.createdAt = serverTimestamp();
        const ref = await addDoc(getTenantCollection(db, tenantId, 'sales'), saleData);
        savedId = ref.id;
        setActiveOrderId(savedId);
      }
      // Stay on POS — tab is saved, cart remains for adding more items
    } catch (err) {
      console.error('Failed to open tab:', err);
      alert('Error saving tab');
    } finally {
      setIsProcessing(false);
    }
  };
  const handleCheckout = async (method: 'cash' | 'payfast' | 'card') => {
    if (cart.length === 0) return;
    setIsProcessing(true);

    try {
      const saleData: any = {
        items: stampOrderItems(cart, true),
        total: cartTotalAfterDiscount,
        subtotal: cartSubtotal,
        taxAmount: taxAmount || null,
        taxRate: taxRate || null,
        taxInclusive,
        paymentMethod: method,
        status: method === 'payfast' ? 'pending' : 'completed',
        customerId: selectedCustomerId || null,
        userId: user?.uid || null,
        staffId: currentUserStaff?.id || null,
      };
      if (pointsDiscount > 0) saleData.pointsDiscount = pointsDiscount;
      if (!activeOrderId) saleData.createdAt = serverTimestamp();
      if (activeTableNumber) saleData.tableNumber = activeTableNumber;

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
        await updateDoc(getTenantDoc(db, tenantId, 'sales', activeOrderId), saleData);
        saleId = activeOrderId;
      } else {
        const ref = await addDoc(getTenantCollection(db, tenantId, 'sales'), saleData);
        saleId = ref.id;
      }

      if (method === 'cash' || method === 'card') {
        // Update loyalty points
        await updateLoyaltyPoints(cartTotalAfterDiscount);

        // Update cash session
        if (activeSession) {
          const updates: any = {};
          if (method === 'cash') {
            updates.expectedCash = increment(cartTotalAfterDiscount);
          } else if (method === 'card') {
            if (cardOverageAction === 'cashout') updates.expectedCash = increment(-(saleData.cashOutAmount || 0));
            else if (cardOverageAction === 'tip' && saleData.tipAmount > 0) updates.accumulatedTips = increment(saleData.tipAmount);
          }
          if (Object.keys(updates).length > 0) {
            await updateDoc(getTenantDoc(db, tenantId, 'cashSessions', activeSession.id), updates);
          }
        }

        // Update staff metrics
        if (currentUserStaff?.id && tenantId) {
          try {
            const metricsUpdate: any = { 'metrics.totalOrdersHandled': increment(1) };
            if (saleData.tipAmount > 0) {
              metricsUpdate['metrics.totalTips'] = increment(saleData.tipAmount);
              metricsUpdate['metrics.totalTipsRounded'] = increment(Math.round(saleData.tipAmount));
            }
            await updateDoc(getTenantDoc(db, tenantId, 'staff', currentUserStaff.id), metricsUpdate);
          } catch (e) {
            console.warn('Failed to update staff metrics:', e);
          }
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
        total: cartTotalAfterDiscount,
        subtotal: cartSubtotal,
        taxAmount: taxAmount || null,
        taxRate: taxRate || null,
        taxInclusive,
        paymentMethod: 'wallet',
        status: 'completed',
        customerId: selectedCustomerId || null,
        userId: user?.uid || null,
        staffId: currentUserStaff.id,
        tenderedAmount: cartTotalAfterDiscount,
        changeAmount: 0,
      };
      if (pointsDiscount > 0) saleData.pointsDiscount = pointsDiscount;
      if (!activeOrderId) saleData.createdAt = serverTimestamp();
      if (activeTableNumber) saleData.tableNumber = activeTableNumber;

      let saleId = '';
      if (activeOrderId) {
        await updateDoc(getTenantDoc(db, tenantId, 'sales', activeOrderId), saleData);
        saleId = activeOrderId;
      } else {
        const ref = await addDoc(getTenantCollection(db, tenantId, 'sales'), saleData);
        saleId = ref.id;
      }

      // Deduct from staff wallet + update metrics
      await updateDoc(getTenantDoc(db, tenantId, 'staff', currentUserStaff.id), {
        walletBalance: balance - cartTotalAfterDiscount,
        'metrics.totalOrdersHandled': increment(1),
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
