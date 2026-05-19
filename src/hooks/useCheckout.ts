/**
 * useCheckout — MariaDB REST edition.
 * Replaces all Firestore addDoc/updateDoc calls with REST API calls.
 */
import { useState, useMemo } from 'react';
import { JwtUser } from './useAuth';
import { Customer, Staff, AppConfig } from '../types';
import { usePosStore } from '../store/usePosStore';
import { apiPost, apiPut, createSale, updateCustomer, updateStaff, getSaleById } from '../api';
import { useSocket } from './useSocket';

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

  // Keep live order sockets off until a register is open.
  useSocket({
    user,
    tenantId,
    enabled: Boolean(activeSession?.id && activeOrderId),
    tabId: activeOrderId,
  });

  const [isProcessing, setIsProcessing] = useState(false);
  const [tenderedAmount, setTenderedAmount] = useState<number | string>('');
  const [cardOverageAction, setCardOverageAction] = useState<'tip' | 'cashout'>('tip');
  const [pointsDiscount, setPointsDiscount] = useState(0);
  const [tenderModal, setTenderModal] = useState<{ isOpen: boolean; method: 'cash' | 'card' | null }>({
    isOpen: false, method: null,
  });
  const [checkoutModal, setCheckoutModal] = useState<{
    isOpen: boolean;
    paymentMethod: 'cash' | 'payfast' | 'card' | 'wallet' | 'split' | null;
    saleData?: any;
  }>({ isOpen: false, paymentMethod: null });
  const [splitPaymentModal, setSplitPaymentModal] = useState(false);
  const [payments, setPayments] = useState<any[]>([]);

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

  const handleParkSale = async (label?: string) => {
    if (cart.length === 0 || !tenantId) return null;
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
        isTab: false,
        tabName: label?.trim() || null,
        customerId: selectedCustomerId || null,
        staffId: currentUserStaff?.id || null,
        ...(pointsDiscount > 0 ? { pointsDiscount } : {}),
      };

      let saleId = activeOrderId;
      if (activeOrderId) {
        await apiPut(`/api/mariadb/tenants/${tenantId}/sales/${activeOrderId}`, saleData);
      } else {
        const created = await createSale(tenantId, saleData);
        saleId = created.id;
      }

      await refreshSales();
      resetAfterCheckout();
      return saleId;
    } catch (error) {
      console.error('Failed to park sale:', error);
      alert('Could not park this sale. Please try again.');
      return null;
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

  // ── Open / update a table order ──────────────────────────────────────────────
  const handleOpenTable = async (tableNumber: string) => {
    if (cart.length === 0 || !tableNumber || !tenantId) return;
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
        tableNumber,
        isTab: false,
        tabName: null,
        customerId: selectedCustomerId || null,
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

      setActiveTableNumber(tableNumber);
      await refreshSales();

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
      console.error('Failed to open table:', err);
      alert('Error saving table');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleCheckout = async (method: 'cash' | 'payfast' | 'card' | 'wallet' | 'split', splitPayments?: any[]) => {
    if (cart.length === 0 || !tenantId) return;
    const selectedCustomer = selectedCustomerId
      ? customers.find(c => c.id === selectedCustomerId) || null
      : null;
    const walletAmount = method === 'wallet'
      ? cartTotalAfterDiscount
      : (splitPayments || []).reduce((sum, p) => sum + (p.method === 'wallet' ? Number(p.amount || 0) : 0), 0);

    if (walletAmount > 0) {
      const walletBalance = Number(selectedCustomer?.walletBalance || 0);
      if (!selectedCustomer || walletBalance <= 0) {
        alert('Select a client with a positive wallet balance before using wallet payment.');
        return;
      }
      if (walletBalance < walletAmount) {
        alert(`Client wallet balance is R${walletBalance.toFixed(2)}, which is not enough for this wallet payment.`);
        return;
      }
    }

    setIsProcessing(true);

    try {
      const saleData: any = {
        items: stampOrderItems(cart, true),
        total: Number(cartTotalAfterDiscount) || 0,
        subtotal: Number(cartSubtotal) || 0,
        taxAmount: Number(taxAmount) || 0,
        taxRate: taxRate || null,
        taxInclusive,
        paymentMethod: method === 'split' ? 'pending' : method, // Fallback for legacy
        status: method === 'payfast' ? 'pending' : 'completed',
        customerId: selectedCustomerId || null,
        staffId: currentUserStaff?.id || null,
        ...(pointsDiscount > 0 ? { pointsDiscount } : {}),
        ...(activeTableNumber ? { tableNumber: activeTableNumber } : {}),
      };

      if (method === 'split' && splitPayments) {
        saleData.payments = splitPayments;
        // Logic to determine primary payment method for legacy field if needed
        saleData.paymentMethod = splitPayments.length > 1 ? 'cash' : (splitPayments[0]?.method || 'cash');
      } else if (method === 'cash' || method === 'card' || method === 'wallet') {
        const overage = method === 'wallet' ? 0 : Math.max(0, Number(tenderedAmount || 0) - cartTotalAfterDiscount);
        const p: any = {
          method: method,
          amount: cartTotalAfterDiscount,
          tenderedAmount: Number(tenderedAmount || cartTotalAfterDiscount),
          changeAmount: method === 'cash' ? overage : 0,
          tipAmount: (method === 'card' && cardOverageAction === 'tip') ? overage : 0,
          cashOutAmount: (method === 'card' && cardOverageAction === 'cashout') ? overage : 0,
        };
        saleData.payments = [p];
        
        // Legacy fields
        saleData.tenderedAmount = p.tenderedAmount;
        saleData.changeAmount = p.changeAmount;
        saleData.tipAmount = p.tipAmount;
        saleData.cashOutAmount = p.cashOutAmount;
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

      if (method !== 'payfast') {
        // Update loyalty points
        await updateLoyaltyPoints(cartTotalAfterDiscount);

        // Update cash session totals for each payment
        if (activeSession?.id && saleData.payments) {
          for (const payment of saleData.payments) {
            const sessionUpdates: any = {};
            const movements: any[] = [];
            if (payment.method === 'cash') {
              sessionUpdates.expectedCashDelta = payment.amount;
              movements.push({
                type: 'cash_sale',
                direction: 'in',
                amount: payment.amount,
                saleId,
                staffId: currentUserStaff?.id || null,
                staffName: currentUserStaff?.name || null,
                note: 'Cash sale recorded from checkout',
              });
            } else if (payment.method === 'card') {
              if (payment.cashOutAmount > 0) {
                sessionUpdates.expectedCashDelta = -(payment.cashOutAmount);
                movements.push({
                  type: 'cash_out',
                  direction: 'out',
                  amount: payment.cashOutAmount,
                  saleId,
                  staffId: currentUserStaff?.id || null,
                  staffName: currentUserStaff?.name || null,
                  note: 'Cash paid out against card overage',
                });
              } else if (payment.tipAmount > 0) {
                sessionUpdates.tipsDelta = payment.tipAmount;
                movements.push({
                  type: 'tip',
                  direction: 'neutral',
                  amount: payment.tipAmount,
                  saleId,
                  staffId: currentUserStaff?.id || null,
                  staffName: currentUserStaff?.name || null,
                  note: 'Card tip recorded',
                });
              }
            }
            if (Object.keys(sessionUpdates).length > 0) {
              await apiPut(`/api/mariadb/tenants/${tenantId}/cash-sessions/${activeSession.id}`, sessionUpdates)
                .catch(e => console.warn('Failed to update session:', e));
            }
            for (const movement of movements) {
              await apiPost(`/api/mariadb/tenants/${tenantId}/cash-sessions/${activeSession.id}/movements`, movement)
                .catch(e => console.warn('Failed to record cash movement:', e));
            }
          }
        }

        // Update staff metrics (aggregated tips)
        if (currentUserStaff?.id && saleData.payments) {
          const totalTips = saleData.payments.reduce((sum: number, p: any) => sum + (p.tipAmount || 0), 0);
          const metricsUpdate: any = { metricsOrdersDelta: 1 };
          if (totalTips > 0) metricsUpdate.metricsTipsDelta = totalTips;
          await updateStaff(tenantId, currentUserStaff.id, metricsUpdate)
            .catch(e => console.warn('Failed to update staff metrics:', e));
        }
        
        // Handle client wallet deduction if split contains wallet or wallet checkout is used
        if (method === 'split' || method === 'wallet') {
          const walletPayment = saleData.payments.find((p: any) => p.method === 'wallet');
          if (walletPayment && selectedCustomer) {
            await updateCustomer(tenantId, selectedCustomer.id, {
              walletBalance: Number(selectedCustomer.walletBalance || 0) - Number(walletPayment.amount || 0)
            }).catch(e => console.warn('Failed to update wallet balance:', e));
          }
        }

        resetAfterCheckout();
        setTenderModal({ isOpen: false, method: null });
        setSplitPaymentModal(false);
        setCheckoutModal({ isOpen: true, paymentMethod: method, saleData: { ...saleData, id: saleId } });
        setIsProcessing(false);
      } else {
        // PayFast redirect (PayFast currently doesn't support being part of a split in this implementation)
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
    await handleCheckout('wallet');
  };

  return {
    isProcessing, setIsProcessing,
    tenderedAmount, setTenderedAmount,
    cardOverageAction, setCardOverageAction,
    pointsDiscount, redeemPoints, clearPointsDiscount,
    tenderModal, setTenderModal,
    checkoutModal, setCheckoutModal,
    splitPaymentModal, setSplitPaymentModal,
    payments, setPayments,
    cartSubtotal, taxAmount,
    cartTotal: cartTotalAfterDiscount,
    cartTotalBeforeDiscount: cartTotal,
    activeOrderId,
    handleParkSale,
    handleSaveOrder,
    handleOpenTab,
    handleOpenTable,
    handleCheckout,
    handleWalletCheckout,
  };
}
