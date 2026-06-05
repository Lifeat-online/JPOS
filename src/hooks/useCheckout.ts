/**
 * useCheckout — MariaDB REST edition.
 * Replaces all Firestore addDoc/updateDoc calls with REST API calls.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { JwtUser } from './useAuth';
import { Customer, Staff, AppConfig, Promotion } from '../types';
import { usePosStore } from '../store/usePosStore';
import { apiPut, createSale, getSaleById, validatePromotionCode } from '../api';
import { useSocket } from './useSocket';
import { getApplicablePricingDiscount } from '../utils/discounts';
import { toast } from '../utils/toast';
import {
  CheckoutMethod,
  dismissOfflineSale,
  countPendingOfflineSales,
  enqueueOfflineSale,
  getOfflineCheckoutBlock,
  isOfflineLikeError,
  listOfflineSales,
  OfflineSaleQueueItem,
  OfflineSyncBatchSummary,
  offlineSaleToReceiptSale,
  offlineSalesChangedEventName,
  retryOfflineSale,
  syncQueuedOfflineSales,
} from '../utils/offlineSales';
import { isStaffCustomerProfile } from '../utils/customerProfiles';

interface CheckoutDeps {
  user: JwtUser | null;
  tenantId: string | null;
  currentUserStaff: Staff | null;
  customers: Customer[];
  activeSession: any | null;
  config: AppConfig;
  refreshSales: () => Promise<void>;
  refreshCustomers?: () => Promise<void>;
}

export interface CheckoutRecoveryNotice {
  message: string;
  method?: CheckoutMethod;
  createdAt: string;
}

export interface QrPaymentDetails {
  provider: string;
  providerReference: string;
  providerStatus?: 'pending' | 'confirmed' | 'approved' | 'settled' | 'failed' | 'reversed' | 'refunded' | 'partial_refund';
  providerNote?: string | null;
  qrPayload?: string | null;
}

export interface BnplPaymentDetails {
  provider: 'payjustnow' | 'mobicred' | 'payflex' | string;
  providerReference: string;
  providerStatus?: 'pending' | 'approved' | 'settled' | 'failed' | 'reversed';
  providerNote?: string | null;
}

export interface CardTerminalDetails {
  provider: string;
  providerDeviceId: string;
  providerReference?: string | null;
  authorizationCode?: string | null;
  providerStatus?: 'approved' | 'settled' | 'pending';
  providerNote?: string | null;
}

export function useCheckout({ user, tenantId, currentUserStaff, customers, activeSession, config, refreshSales, refreshCustomers }: CheckoutDeps) {
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
  const [promotionCode, setPromotionCode] = useState('');
  const [appliedPromotion, setAppliedPromotion] = useState<Promotion | null>(null);
  const [promotionDiscount, setPromotionDiscount] = useState(0);
  const [promotionError, setPromotionError] = useState<string | null>(null);
  const [promotionLoading, setPromotionLoading] = useState(false);
  const appliedPromotionSignatureRef = useRef<string | null>(null);
  const [tenderModal, setTenderModal] = useState<{ isOpen: boolean; method: 'cash' | 'card' | null }>({
    isOpen: false, method: null,
  });
  const [checkoutModal, setCheckoutModal] = useState<{
    isOpen: boolean;
    paymentMethod: CheckoutMethod | null;
    saleData?: any;
  }>({ isOpen: false, paymentMethod: null });
  const [splitPaymentModal, setSplitPaymentModal] = useState(false);
  const [payments, setPayments] = useState<any[]>([]);
  const [isBrowserOffline, setIsBrowserOffline] = useState(() => (
    typeof navigator !== 'undefined' ? navigator.onLine === false : false
  ));
  const [offlineQueueCount, setOfflineQueueCount] = useState(() => (
    tenantId ? countPendingOfflineSales(tenantId) : 0
  ));
  const [offlineQueueItems, setOfflineQueueItems] = useState<OfflineSaleQueueItem[]>(() => (
    tenantId ? listOfflineSales(tenantId) : []
  ));
  const [offlineSyncStatus, setOfflineSyncStatus] = useState<'idle' | 'syncing' | 'error'>('idle');
  const [offlineSyncError, setOfflineSyncError] = useState<string | null>(null);
  const [offlineSyncSummary, setOfflineSyncSummary] = useState<OfflineSyncBatchSummary | null>(null);
  const [checkoutRecovery, setCheckoutRecovery] = useState<CheckoutRecoveryNotice | null>(null);

  const recordCheckoutRecovery = useCallback((message: string, method?: CheckoutMethod) => {
    setCheckoutRecovery({
      message,
      method,
      createdAt: new Date().toISOString(),
    });
  }, []);

  const clearCheckoutRecovery = useCallback(() => setCheckoutRecovery(null), []);

  const refreshOfflineQueue = useCallback(() => {
    if (!tenantId) {
      setOfflineQueueItems([]);
      setOfflineQueueCount(0);
      return;
    }
    setOfflineQueueItems(listOfflineSales(tenantId));
    setOfflineQueueCount(countPendingOfflineSales(tenantId));
  }, [tenantId]);

  useEffect(() => {
    const updateOnlineState = () => setIsBrowserOffline(typeof navigator !== 'undefined' ? navigator.onLine === false : false);
    window.addEventListener('online', updateOnlineState);
    window.addEventListener('offline', updateOnlineState);
    updateOnlineState();
    return () => {
      window.removeEventListener('online', updateOnlineState);
      window.removeEventListener('offline', updateOnlineState);
    };
  }, []);

  useEffect(() => {
    if (!tenantId) {
      refreshOfflineQueue();
      return;
    }

    refreshOfflineQueue();
    window.addEventListener(offlineSalesChangedEventName(), refreshOfflineQueue);
    return () => window.removeEventListener(offlineSalesChangedEventName(), refreshOfflineQueue);
  }, [tenantId, refreshOfflineQueue]);

  const runOfflineSync = useCallback(async (force = false) => {
    if (!tenantId || isBrowserOffline || offlineSyncStatus === 'syncing') return;
    const hasSyncCandidates = listOfflineSales(tenantId).some(item => item.status === 'pending' || item.status === 'syncing' || item.status === 'failed');
    if (!hasSyncCandidates) return;
    setOfflineSyncStatus('syncing');
    setOfflineSyncError(null);

    try {
      const result = await syncQueuedOfflineSales(tenantId, { force });
      refreshOfflineQueue();
      setOfflineSyncSummary(result.summary);
      setOfflineSyncStatus(result.failed.length > 0 ? 'error' : 'idle');
      setOfflineSyncError(result.failed[0]?.lastError || (result.skipped > 0 ? result.summary.message : null));
      if (result.synced.length > 0) {
        await refreshSales().catch(e => console.warn('Failed to refresh sales after offline sync:', e));
        await refreshCustomers?.().catch(e => console.warn('Failed to refresh customers after offline sync:', e));
      }
    } catch (error) {
      refreshOfflineQueue();
      setOfflineSyncStatus('error');
      setOfflineSyncError(error instanceof Error ? error.message : String(error || 'Offline sync failed'));
      setOfflineSyncSummary(null);
    }
  }, [tenantId, isBrowserOffline, offlineSyncStatus, refreshOfflineQueue, refreshSales, refreshCustomers]);

  useEffect(() => {
    if (!tenantId || isBrowserOffline || offlineSyncStatus !== 'idle') return;
    const hasPendingSync = offlineQueueItems.some(item => item.status === 'pending' || item.status === 'syncing');
    if (!hasPendingSync) return;

    let cancelled = false;
    runOfflineSync(false).catch((error) => {
      if (cancelled) return;
      setOfflineSyncStatus('error');
      setOfflineSyncError(error instanceof Error ? error.message : String(error || 'Offline sync failed'));
    });
    return () => {
      cancelled = true;
    };
  }, [tenantId, isBrowserOffline, offlineQueueItems, offlineSyncStatus, runOfflineSync]);

  const retryQueuedOfflineSale = useCallback((itemId: string) => {
    if (!tenantId) return;
    retryOfflineSale(tenantId, itemId);
    setOfflineSyncStatus('idle');
    setOfflineSyncError(null);
    setOfflineSyncSummary(null);
    refreshOfflineQueue();
  }, [tenantId, refreshOfflineQueue]);

  const dismissQueuedOfflineSale = useCallback((itemId: string) => {
    if (!tenantId) return;
    dismissOfflineSale(tenantId, itemId);
    refreshOfflineQueue();
    if (countPendingOfflineSales(tenantId) === 0) {
      setOfflineSyncStatus('idle');
      setOfflineSyncError(null);
      setOfflineSyncSummary(null);
    }
  }, [tenantId, refreshOfflineQueue]);

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
  const selectedCustomer = selectedCustomerId
    ? customers.find(c => c.id === selectedCustomerId) || null
    : null;
  const pricingDiscount = useMemo(
    () => getApplicablePricingDiscount(cartTotal, selectedCustomer, config),
    [cartTotal, selectedCustomer, config]
  );
  const promotionSignature = useMemo(() => [
    selectedCustomerId || 'no-customer',
    ...cart.map(item => [
      (item as any).productId || item.id,
      item.category || '',
      item.section || '',
      item.subCategory || '',
      Number(item.price || 0).toFixed(2),
      Number(item.quantity || 0),
    ].join(':')),
  ].join('|'), [cart, selectedCustomerId]);
  const totalDiscount = Math.min(
    cartTotal,
    Number(pointsDiscount || 0) + Number(pricingDiscount.amount || 0) + Number(promotionDiscount || 0)
  );
  const cartTotalAfterDiscount = Math.max(0, cartTotal - totalDiscount);

  const stampOrderItems = (items: any[], delivered = false) => {
    return items.map(item => ({
      ...item,
      status: delivered ? 'delivered' : (item.status || 'pending'),
      workstationId: item.workstationId,
    }));
  };

  // ── Points redemption ────────────────────────────────────────────────────────
  const redeemPoints = (customerId: string, customerPoints: number) => {
    if (!config?.business?.enableLoyalty) return;
    const customer = customers.find(c => c.id === customerId);
    if ((customer?.loyaltyMemberStatus || 'active') !== 'active') return;
    const { pointsRequiredForDiscount, discountAmountForPoints } = config.business;
    if (!pointsRequiredForDiscount || !discountAmountForPoints) return;
    if (customerPoints < pointsRequiredForDiscount) return;
    const setsOfPoints = Math.floor(customerPoints / pointsRequiredForDiscount);
    const discountableTotal = Math.max(0, cartTotal - Number(pricingDiscount.amount || 0) - Number(promotionDiscount || 0));
    const discount = Math.min(setsOfPoints * discountAmountForPoints, discountableTotal);
    setPointsDiscount(discount);
  };

  const clearPointsDiscount = () => setPointsDiscount(0);

  const clearPromotion = useCallback((message?: string | null) => {
    setAppliedPromotion(null);
    setPromotionDiscount(0);
    appliedPromotionSignatureRef.current = null;
    if (message !== undefined) setPromotionError(message);
  }, []);

  const promotionPayloadItems = useMemo(() => cart.map(item => ({
    id: item.id,
    productId: (item as any).productId || item.id,
    name: item.name,
    category: item.category || null,
    section: item.section || null,
    subCategory: item.subCategory || null,
    price: Number(item.price || 0),
    quantity: Number(item.quantity || 0),
  })), [cart]);

  const applyPromotionCode = useCallback(async () => {
    const code = promotionCode.trim();
    if (!tenantId || !code || cart.length === 0) return;
    if (isBrowserOffline) {
      setPromotionError('Coupon validation needs an online connection.');
      return;
    }
    setPromotionLoading(true);
    setPromotionError(null);
    try {
      const result = await validatePromotionCode(tenantId, {
        code,
        customerId: selectedCustomerId || null,
        items: promotionPayloadItems,
        subtotal: Number(cartSubtotal || 0),
        totalBeforeDiscount: Number(cartTotal || 0),
      });
      if (!result.valid || !result.promotion || Number(result.discountAmount || 0) <= 0) {
        throw new Error(result.reason || 'Coupon could not be applied.');
      }
      setAppliedPromotion(result.promotion);
      setPromotionCode(result.promotion.code);
      setPromotionDiscount(Number(result.discountAmount || 0));
      appliedPromotionSignatureRef.current = promotionSignature;
    } catch (error) {
      setAppliedPromotion(null);
      setPromotionDiscount(0);
      appliedPromotionSignatureRef.current = null;
      setPromotionError(error instanceof Error ? error.message : 'Coupon could not be applied.');
    } finally {
      setPromotionLoading(false);
    }
  }, [promotionCode, tenantId, cart.length, isBrowserOffline, selectedCustomerId, promotionPayloadItems, cartSubtotal, cartTotal, promotionSignature]);

  useEffect(() => {
    if (!appliedPromotion) return;
    if (appliedPromotionSignatureRef.current && appliedPromotionSignatureRef.current !== promotionSignature) {
      clearPromotion('Coupon removed because the cart or customer changed. Apply it again to revalidate.');
    }
  }, [appliedPromotion, promotionSignature, clearPromotion]);

  // ── Reset cart state after checkout ─────────────────────────────────────────
  const resetAfterCheckout = () => {
    clearCart();
    setSelectedCustomerId(null);
    setActiveOrderId(null);
    setActiveTableNumber(null);
    setPointsDiscount(0);
    setPromotionCode('');
    clearPromotion(null);
  };

  const queueOfflineCheckout = (saleData: any, method: CheckoutMethod) => {
    if (!tenantId) return null;
    const queued = enqueueOfflineSale({
      tenantId,
      saleData,
      method,
      targetSaleId: activeOrderId || null,
      cashSessionId: activeSession?.id || null,
      staffId: currentUserStaff?.id || null,
      staffName: currentUserStaff?.name || null,
    });
    refreshOfflineQueue();
    resetAfterCheckout();
    setTenderModal({ isOpen: false, method: null });
    setSplitPaymentModal(false);
    setCheckoutModal({ isOpen: true, paymentMethod: method, saleData: offlineSaleToReceiptSale(queued) });
    return queued;
  };

  const attachCheckoutSideEffects = (saleData: any) => {
    if (saleData.status !== 'completed') return;

    if (selectedCustomerId && config?.business?.enableLoyalty) {
      const customer = customers.find(c => c.id === selectedCustomerId);
      const isActiveMember = (customer?.loyaltyMemberStatus || 'active') === 'active';
      if (!isStaffCustomerProfile(customer) && isActiveMember && pointsDiscount > 0 && config.business.pointsRequiredForDiscount && config.business.discountAmountForPoints) {
        saleData.loyaltyPointsRedeemed = Math.ceil(pointsDiscount / config.business.discountAmountForPoints) * config.business.pointsRequiredForDiscount;
      }
    }

    const totalTips = saleData.payments
      ? saleData.payments.reduce((sum: number, p: any) => sum + Number(p.tipAmount || 0), 0)
      : 0;
    let expectedCashDelta = 0;
    let tipsDelta = 0;
    const cashMovements: any[] = [];

    if (activeSession?.id && saleData.payments) {
      for (const payment of saleData.payments) {
        if (payment.method === 'cash') {
          const amount = Number(payment.amount || 0);
          expectedCashDelta += amount;
          cashMovements.push({
            type: 'cash_sale',
            direction: 'in',
            amount,
            paymentId: null,
            staffId: currentUserStaff?.id || null,
            staffName: currentUserStaff?.name || null,
            note: 'Cash sale recorded from checkout',
          });
        } else if (payment.method === 'card') {
          const cashOutAmount = Number(payment.cashOutAmount || 0);
          const tipAmount = Number(payment.tipAmount || 0);
          if (cashOutAmount > 0) {
            expectedCashDelta -= cashOutAmount;
            cashMovements.push({
              type: 'cash_out',
              direction: 'out',
              amount: cashOutAmount,
              paymentId: null,
              staffId: currentUserStaff?.id || null,
              staffName: currentUserStaff?.name || null,
              note: 'Cash paid out against card overage',
            });
          } else if (tipAmount > 0) {
            tipsDelta += tipAmount;
            cashMovements.push({
              type: 'tip',
              direction: 'neutral',
              amount: tipAmount,
              paymentId: null,
              staffId: currentUserStaff?.id || null,
              staffName: currentUserStaff?.name || null,
              note: 'Card tip recorded',
            });
          }
        }
      }
    }

    saleData.cashSessionId = activeSession?.id || null;
    if (expectedCashDelta !== 0) saleData.expectedCashDelta = expectedCashDelta;
    if (tipsDelta !== 0) saleData.tipsDelta = tipsDelta;
    if (cashMovements.length > 0) saleData.cashMovements = cashMovements;
    if (currentUserStaff?.id) {
      saleData.staffMetrics = { ordersDelta: 1 };
      if (totalTips > 0) saleData.staffMetrics.tipsDelta = totalTips;
    }

    const accountPayment = saleData.payments?.find((p: any) => p.method === 'account');
    if (accountPayment && selectedCustomer) {
      saleData.accountBalanceDelta = Number(accountPayment.amount || 0);
    }
  };

  // ── Save order (restaurant hold/send to workstations) ────────────────────────
  const promotionSaleFields = () => (
    appliedPromotion && promotionDiscount > 0
      ? {
          promotionId: appliedPromotion.id,
          promotionCode: appliedPromotion.code,
          promotionDiscount: Number(promotionDiscount || 0),
        }
      : {}
  );

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
        ...(totalDiscount > 0 ? { pointsDiscount: totalDiscount } : {}),
        ...promotionSaleFields(),
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
      toast.error('Error saving order');
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
        ...(totalDiscount > 0 ? { pointsDiscount: totalDiscount } : {}),
        ...promotionSaleFields(),
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
      toast.error('Could not park this sale. Please try again.');
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
        ...(totalDiscount > 0 ? { pointsDiscount: totalDiscount } : {}),
        ...promotionSaleFields(),
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
      toast.error('Error saving tab');
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
        ...(totalDiscount > 0 ? { pointsDiscount: totalDiscount } : {}),
        ...promotionSaleFields(),
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
      toast.error('Error saving table');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleCheckout = async (method: CheckoutMethod, splitPayments?: any[], paymentDetails?: QrPaymentDetails | BnplPaymentDetails | CardTerminalDetails) => {
    if (cart.length === 0 || !tenantId) return;
    clearCheckoutRecovery();
    const walletAmount = method === 'wallet'
      ? cartTotalAfterDiscount
      : (splitPayments || []).reduce((sum, p) => sum + (p.method === 'wallet' ? Number(p.amount || 0) : 0), 0);
    const accountAmount = method === 'account'
      ? cartTotalAfterDiscount
      : (splitPayments || []).reduce((sum, p) => sum + (p.method === 'account' ? Number(p.amount || 0) : 0), 0);

    const offlineCapability = getOfflineCheckoutBlock(method, splitPayments, isBrowserOffline);
    if (!offlineCapability.allowed) {
      const message = offlineCapability.reason || 'This payment needs an online connection.';
      recordCheckoutRecovery(message, method);
      toast.error(message);
      return;
    }
    if (appliedPromotion && isBrowserOffline) {
      const message = 'Coupon checkout needs an online connection so redemption limits can be verified.';
      recordCheckoutRecovery(message, method);
      toast.error(message);
      return;
    }

    if (walletAmount > 0) {
      const walletBalance = Number(selectedCustomer?.walletBalance || 0);
      if (!selectedCustomer || walletBalance <= 0) {
        const message = 'Select a client with a positive wallet balance before using wallet payment.';
        recordCheckoutRecovery(message, method);
        toast.error(message);
        return;
      }
      if (walletBalance < walletAmount) {
        const message = `Client wallet balance is R${walletBalance.toFixed(2)}, which is not enough for this wallet payment.`;
        recordCheckoutRecovery(message, method);
        toast.error(message);
        return;
      }
    }

    if (accountAmount > 0) {
      const accountLimit = Number(selectedCustomer?.accountLimit || 0);
      const accountBalance = Number(selectedCustomer?.accountBalance || 0);
      const accountRemaining = Math.max(0, accountLimit - accountBalance);
      if (!selectedCustomer || !selectedCustomer.accountEnabled) {
        const message = 'Select a client with an active account before using account payment.';
        recordCheckoutRecovery(message, method);
        toast.error(message);
        return;
      }
      if (accountRemaining < accountAmount) {
        const message = `Client account remaining is R${accountRemaining.toFixed(2)}, which is not enough for this account payment.`;
        recordCheckoutRecovery(message, method);
        toast.error(message);
        return;
      }
    }

    const cardTenderDetails = method === 'card'
      ? [paymentDetails]
      : method === 'split'
        ? (splitPayments || []).filter(payment => payment?.method === 'card')
        : [];
    const missingCardTerminal = cardTenderDetails.some((payment: any) => (
      !String(payment?.provider || '').trim() || !String(payment?.providerDeviceId || payment?.deviceId || payment?.terminalId || '').trim()
    ));
    if (missingCardTerminal) {
      const message = 'Capture the card provider and terminal/device reference before completing a card payment.';
      recordCheckoutRecovery(message, method);
      toast.error(message);
      return;
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
        ...(totalDiscount > 0 ? { pointsDiscount: totalDiscount } : {}),
        ...promotionSaleFields(),
        ...(activeTableNumber ? { tableNumber: activeTableNumber } : {}),
      };

      if (method === 'split' && splitPayments) {
        saleData.payments = splitPayments;
        // Logic to determine primary payment method for legacy field if needed
        saleData.paymentMethod = splitPayments.length > 1 ? 'cash' : (splitPayments[0]?.method || 'cash');
      } else if (method === 'cash' || method === 'card' || method === 'wallet' || method === 'account' || method === 'qr' || method === 'bnpl') {
        const exactTenderOnly = method === 'wallet' || method === 'account' || method === 'qr' || method === 'bnpl';
        const overage = exactTenderOnly ? 0 : Math.max(0, Number(tenderedAmount || 0) - cartTotalAfterDiscount);
        const p: any = {
          method: method,
          amount: cartTotalAfterDiscount,
          tenderedAmount: exactTenderOnly ? cartTotalAfterDiscount : Number(tenderedAmount || cartTotalAfterDiscount),
          changeAmount: method === 'cash' ? overage : 0,
          tipAmount: (method === 'card' && cardOverageAction === 'tip') ? overage : 0,
          cashOutAmount: (method === 'card' && cardOverageAction === 'cashout') ? overage : 0,
        };
        if (method === 'card' && paymentDetails) {
          const cardDetails = paymentDetails as CardTerminalDetails;
          p.provider = cardDetails.provider;
          p.providerDeviceId = cardDetails.providerDeviceId;
          p.providerReference = cardDetails.providerReference || null;
          p.authorizationCode = cardDetails.authorizationCode || cardDetails.providerReference || null;
          p.providerStatus = cardDetails.providerStatus || 'approved';
          p.providerNote = cardDetails.providerNote || null;
        }
        if (method === 'qr' && paymentDetails) {
          const qrDetails = paymentDetails as QrPaymentDetails;
          p.provider = paymentDetails.provider;
          p.providerReference = paymentDetails.providerReference;
          p.providerStatus = paymentDetails.providerStatus || 'confirmed';
          p.providerNote = paymentDetails.providerNote || null;
          p.qrPayload = qrDetails.qrPayload || null;
        }
        if (method === 'bnpl' && paymentDetails) {
          p.provider = paymentDetails.provider;
          p.providerReference = paymentDetails.providerReference;
          p.providerStatus = paymentDetails.providerStatus || 'approved';
          p.providerNote = paymentDetails.providerNote || null;
        }
        saleData.payments = [p];
        
        // Legacy fields
        saleData.tenderedAmount = p.tenderedAmount;
        saleData.changeAmount = p.changeAmount;
        saleData.tipAmount = p.tipAmount;
        saleData.cashOutAmount = p.cashOutAmount;
      }

      if (method !== 'payfast') {
        attachCheckoutSideEffects(saleData);
      }

      if (isBrowserOffline) {
        queueOfflineCheckout(saleData, method);
        setIsProcessing(false);
        return;
      }

      let saleId = '';
      try {
        if (activeOrderId) {
          await apiPut(`/api/mariadb/tenants/${tenantId}/sales/${activeOrderId}`, saleData);
          saleId = activeOrderId;
        } else {
          const created = await createSale(tenantId, saleData);
          saleId = created.id;
        }
      } catch (saleWriteError) {
        const offlineAfterFailure = getOfflineCheckoutBlock(method, splitPayments, true);
        if (isOfflineLikeError(saleWriteError) && offlineAfterFailure.allowed && !appliedPromotion) {
          queueOfflineCheckout(saleData, method);
          setIsProcessing(false);
          return;
        }
        if (isOfflineLikeError(saleWriteError) && appliedPromotion) {
          const message = 'Coupon checkout could not be completed offline. Reconnect and try again.';
          recordCheckoutRecovery(message, method);
          toast.error(message);
          setIsProcessing(false);
          return;
        }
        if (isOfflineLikeError(saleWriteError) && !offlineAfterFailure.allowed) {
          const message = offlineAfterFailure.reason || 'This payment needs an online connection.';
          recordCheckoutRecovery(message, method);
          toast.error(message);
          setIsProcessing(false);
          return;
        }
        throw saleWriteError;
      }

      await refreshSales();

      if (method !== 'payfast') {
        resetAfterCheckout();
        clearCheckoutRecovery();
        setTenderModal({ isOpen: false, method: null });
        setSplitPaymentModal(false);
        setCheckoutModal({ isOpen: true, paymentMethod: method, saleData: { ...saleData, id: saleId } });
        setIsProcessing(false);

        // Refresh customer balances in the background
        if (method === 'wallet' || method === 'account' || method === 'split') {
          refreshCustomers?.();
        }
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
      const message = err instanceof Error ? err.message : 'Checkout failed. Please try again.';
      recordCheckoutRecovery(message, method);
      toast.error(message);
      setIsProcessing(false);
    }
  };

  // ── Wallet checkout ──────────────────────────────────────────────────────────
  const handleWalletCheckout = async () => {
    await handleCheckout('wallet');
  };

  const handleAccountCheckout = async () => {
    await handleCheckout('account');
  };

  return {
    isProcessing, setIsProcessing,
    tenderedAmount, setTenderedAmount,
    cardOverageAction, setCardOverageAction,
    pointsDiscount, pricingDiscount, totalDiscount, redeemPoints, clearPointsDiscount,
    promotionCode, setPromotionCode,
    appliedPromotion, promotionDiscount, promotionError, promotionLoading,
    applyPromotionCode, clearPromotion,
    tenderModal, setTenderModal,
    checkoutModal, setCheckoutModal,
    splitPaymentModal, setSplitPaymentModal,
    payments, setPayments,
    cartSubtotal, taxAmount,
    cartTotal: cartTotalAfterDiscount,
    cartTotalBeforeDiscount: cartTotal,
    checkoutRecovery,
    clearCheckoutRecovery,
    offlineStatus: {
      isOffline: isBrowserOffline,
      pendingCount: offlineQueueCount,
      syncStatus: offlineSyncStatus,
      lastError: offlineSyncError,
      lastSummary: offlineSyncSummary,
      queueItems: offlineQueueItems,
      syncNow: () => runOfflineSync(true),
      retryItem: retryQueuedOfflineSale,
      dismissItem: dismissQueuedOfflineSale,
    },
    activeOrderId,
    handleParkSale,
    handleSaveOrder,
    handleOpenTab,
    handleOpenTable,
    handleCheckout,
    handleWalletCheckout,
    handleAccountCheckout,
  };
}
