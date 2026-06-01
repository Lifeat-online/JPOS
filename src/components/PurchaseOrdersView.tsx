import React, { useState, useEffect } from 'react';
import { PurchaseOrder, Vendor, Product } from '../types';
import { ClipboardCheck, Plus, Loader2, Save, X, ShoppingBag } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { usePosStore } from '../store/usePosStore';
import { apiGet, apiPost, apiPut } from '../api';

export function PurchaseOrdersView() {
  const tenantId = usePosStore(s => s.tenantId);
  const [orders, setOrders] = useState<PurchaseOrder[]>([]);
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [currentOrder, setCurrentOrder] = useState<Partial<PurchaseOrder>>({ items: [], type: 'once_off' });
  const [isProcessing, setIsProcessing] = useState(false);
  const [receivingOrder, setReceivingOrder] = useState<PurchaseOrder | null>(null);
  const [receivingLines, setReceivingLines] = useState<Array<{
    lineIndex: number;
    productId: string;
    productName: string;
    orderedQuantity: number;
    receivedQuantity: number;
    receivedPrice: number;
    expiryDate: string;
    batchNumber: string;
    note: string;
  }>>([]);
  const [receivingInvoiceNumber, setReceivingInvoiceNumber] = useState('');
  const [receivingInvoiceDate, setReceivingInvoiceDate] = useState('');
  const [receivingInvoiceStatus, setReceivingInvoiceStatus] = useState<'unpaid' | 'paid'>('unpaid');
  const [receivingNote, setReceivingNote] = useState('');
  const [receivingError, setReceivingError] = useState('');

  const fetchData = async () => {
    if (!tenantId) return;
    try {
      const [pos, vends, prods] = await Promise.all([
        apiGet<PurchaseOrder[]>(`/api/mariadb/tenants/${tenantId}/purchase-orders`),
        apiGet<Vendor[]>(`/api/mariadb/tenants/${tenantId}/vendors`),
        apiGet<Product[]>(`/api/mariadb/tenants/${tenantId}/products`),
      ]);
      setOrders(pos || []);
      setVendors(vends || []);
      setProducts(prods || []);
    } catch (err) {
      console.error('PO fetch error:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 30000);
    return () => clearInterval(interval);
  }, [tenantId]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentOrder.vendorId || !tenantId) return;
    if (currentOrder.status === 'received') {
      setModalOpen(false);
      return;
    }
    setIsProcessing(true);
    try {
      const total = (currentOrder.items || []).reduce((acc, item) => acc + item.quantity * item.expectedPrice, 0);
      const data = {
        vendorId: currentOrder.vendorId,
        status: currentOrder.status || 'draft',
        type: currentOrder.type || 'once_off',
        recurringFrequency: currentOrder.recurringFrequency || null,
        items: currentOrder.items || [],
        totalAmount: total,
        expectedDeliveryDate: currentOrder.expectedDeliveryDate || null,
      };
      if (currentOrder.id) {
        await apiPut(`/api/mariadb/tenants/${tenantId}/purchase-orders/${currentOrder.id}`, data);
      } else {
        await apiPost(`/api/mariadb/tenants/${tenantId}/purchase-orders`, data);
      }
      await fetchData();
      setModalOpen(false);
    } catch (err) {
      console.error(err);
    }
    setIsProcessing(false);
  };

  const markReceived = async (orderId: string) => {
    const order = orders.find(po => po.id === orderId);
    if (!order) return;
    setReceivingOrder(order);
    setReceivingLines(order.items.map((item, index) => ({
      lineIndex: index,
      productId: item.productId,
      productName: item.productName,
      orderedQuantity: Number(item.quantity || 0),
      receivedQuantity: Number(item.receivedQuantity ?? item.quantity ?? 0),
      receivedPrice: Number(item.receivedPrice ?? item.expectedPrice ?? 0),
      expiryDate: item.expiryDate ? String(item.expiryDate).slice(0, 10) : '',
      batchNumber: item.batchNumber || '',
      note: '',
    })));
    setReceivingInvoiceNumber(order.invoiceNumber || '');
    setReceivingInvoiceDate(order.invoiceDate ? String(order.invoiceDate).slice(0, 10) : '');
    setReceivingInvoiceStatus(order.invoiceStatus || 'unpaid');
    setReceivingNote(order.receivingNote || '');
    setReceivingError('');
  };

  const submitReceiving = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!tenantId || !receivingOrder) return;
    setIsProcessing(true);
    setReceivingError('');
    try {
      await apiPost(`/api/mariadb/tenants/${tenantId}/purchase-orders/${receivingOrder.id}/receive`, {
        invoiceNumber: receivingInvoiceNumber || null,
        invoiceDate: receivingInvoiceDate || null,
        note: receivingNote || null,
        invoiceStatus: receivingInvoiceStatus,
        items: receivingLines.map(line => ({
          lineIndex: line.lineIndex,
          productId: line.productId,
          receivedQuantity: line.receivedQuantity,
          receivedPrice: line.receivedPrice,
          expiryDate: line.expiryDate || null,
          batchNumber: line.batchNumber || null,
          note: line.note || null,
        })),
      });
      await fetchData();
      setReceivingOrder(null);
    } catch (err) {
      console.error(err);
      setReceivingError(err instanceof Error ? err.message : 'Could not receive this purchase order.');
    }
    setIsProcessing(false);
  };

  const statusColor = (s: string) => ({
    draft: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400',
    sent: 'bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400',
    received: 'bg-emerald-100 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-400',
    cancelled: 'bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400',
  }[s] || 'bg-slate-100 text-slate-600');

  if (loading) return <div className="p-8 flex justify-center"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>;

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center bg-white dark:bg-slate-900 p-6 rounded-[24px] border border-slate-100 dark:border-slate-800/60 shadow-sm">
        <div>
          <h2 className="text-2xl font-black text-slate-800 dark:text-white">Purchase Orders</h2>
          <p className="text-sm font-medium text-slate-500">Create, track and manage POs to vendors</p>
        </div>
        <button
          onClick={() => { setCurrentOrder({ status: 'draft', type: 'once_off', items: [] }); setModalOpen(true); }}
          className="px-6 py-3 bg-primary text-white rounded-xl font-bold flex items-center gap-2 shadow-lg shadow-primary/30 active:scale-95 transition-all"
        >
          <Plus className="w-5 h-5" /> Create PO
        </button>
      </div>

      {orders.length === 0 && (
        <div className="py-20 text-center bg-white dark:bg-slate-900 rounded-[24px] border border-dashed border-slate-200 dark:border-slate-700/60">
          <ShoppingBag className="w-12 h-12 text-slate-300 dark:text-slate-600 mx-auto mb-4" />
          <p className="text-sm font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest">No purchase orders yet</p>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {orders.map(order => {
          const vendor = vendors.find(v => v.id === order.vendorId);
          return (
            <div key={order.id} className="bg-white dark:bg-slate-900 rounded-[24px] border border-slate-100 dark:border-slate-800/60 p-6 shadow-sm hover:shadow-xl transition-all flex flex-col justify-between">
              <div>
                <div className="flex justify-between items-start mb-4">
                  <span className={`px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest ${statusColor(order.status)}`}>{order.status}</span>
                  <span className="text-[10px] font-bold bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 px-2 py-1 rounded-md uppercase tracking-widest">{order.type}</span>
                </div>
                <h3 className="text-lg font-black text-slate-800 dark:text-white mb-1">
                  <span className="text-slate-400 font-medium">To: </span>{vendor?.name ?? 'Unknown Vendor'}
                </h3>
                {order.status === 'received' && (
                  <div className="text-xs font-semibold text-slate-500 dark:text-slate-400 space-y-1 mb-4">
                    {order.invoiceNumber && <p>Invoice {order.invoiceNumber}</p>}
                    {order.receivedTotalAmount !== undefined && <p>Received total R{Number(order.receivedTotalAmount || 0).toFixed(2)}</p>}
                    {order.receivedByName && <p>Received by {order.receivedByName}</p>}
                  </div>
                )}
                <p className="text-sm text-slate-500 font-medium mb-4">{order.items.length} items • R{order.totalAmount.toFixed(2)}</p>
              </div>
              <div className="flex gap-2 border-t border-slate-100 dark:border-slate-800/60 pt-4 mt-4">
                <button
                  onClick={() => { setCurrentOrder(order); setModalOpen(true); }}
                  className="flex-1 py-2 bg-slate-50 dark:bg-slate-800 rounded-lg text-xs font-bold text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 transition"
                >
                  {order.status === 'received' ? 'View' : 'View / Edit'}
                </button>
                {order.status === 'sent' && (
                  <button
                    onClick={() => markReceived(order.id)}
                    className="flex-1 py-2 bg-emerald-100 text-emerald-700 rounded-lg text-xs font-bold hover:bg-emerald-200 transition flex items-center justify-center gap-1.5"
                  >
                    <ClipboardCheck className="w-4 h-4" /> Receive
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <AnimatePresence>
        {modalOpen && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-50 bg-[#1e293b]/60 backdrop-blur-sm flex items-center justify-center p-4">
            <motion.div initial={{ scale: 0.9 }} animate={{ scale: 1 }} exit={{ scale: 0.9 }} className="bg-white dark:bg-slate-900 rounded-3xl p-8 max-w-2xl w-full shadow-2xl relative max-h-[90vh] overflow-y-auto">
              <div className="flex justify-between items-center mb-6">
                <h3 className="text-2xl font-black text-slate-900 dark:text-white">{currentOrder.id ? 'Edit Purchase Order' : 'New Purchase Order'}</h3>
                <button onClick={() => setModalOpen(false)} className="p-2 text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800 rounded-full transition-all"><X className="w-5 h-5" /></button>
              </div>

              <form onSubmit={handleSave} className="space-y-6">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-[10px] font-black uppercase text-slate-400 px-1">Vendor</label>
                    <select required value={currentOrder.vendorId || ''} onChange={e => setCurrentOrder({ ...currentOrder, vendorId: e.target.value })} className="w-full px-4 py-3 bg-slate-50 dark:bg-[#0B1120] border border-slate-200 dark:border-slate-700/60 rounded-xl focus:outline-none focus:border-primary/50 text-sm font-semibold mt-1 dark:text-white">
                      <option value="">Select a vendor...</option>
                      {vendors.filter(v => v.status === 'active').map(v => <option key={v.id} value={v.id}>{v.name}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="text-[10px] font-black uppercase text-slate-400 px-1">Status</label>
                    <select disabled={currentOrder.status === 'received'} value={currentOrder.status || 'draft'} onChange={e => setCurrentOrder({ ...currentOrder, status: e.target.value as any })} className="w-full px-4 py-3 bg-slate-50 dark:bg-[#0B1120] border border-slate-200 dark:border-slate-700/60 rounded-xl focus:outline-none focus:border-primary/50 text-sm font-semibold mt-1 dark:text-white disabled:opacity-60">
                      <option value="draft">Draft</option>
                      <option value="sent">Sent</option>
                      {currentOrder.status === 'received' && <option value="received">Received</option>}
                      <option value="cancelled">Cancelled</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-[10px] font-black uppercase text-slate-400 px-1">Order Type</label>
                    <select value={currentOrder.type || 'once_off'} onChange={e => setCurrentOrder({ ...currentOrder, type: e.target.value as any })} className="w-full px-4 py-3 bg-slate-50 dark:bg-[#0B1120] border border-slate-200 dark:border-slate-700/60 rounded-xl focus:outline-none focus:border-primary/50 text-sm font-semibold mt-1 dark:text-white">
                      <option value="once_off">Once-Off</option>
                      <option value="recurring">Recurring</option>
                    </select>
                  </div>
                  {currentOrder.type === 'recurring' && (
                    <div>
                      <label className="text-[10px] font-black uppercase text-slate-400 px-1">Frequency</label>
                      <select value={currentOrder.recurringFrequency || 'monthly'} onChange={e => setCurrentOrder({ ...currentOrder, recurringFrequency: e.target.value as any })} className="w-full px-4 py-3 bg-slate-50 dark:bg-[#0B1120] border border-slate-200 dark:border-slate-700/60 rounded-xl focus:outline-none focus:border-primary/50 text-sm font-semibold mt-1 dark:text-white">
                        <option value="weekly">Weekly</option>
                        <option value="monthly">Monthly</option>
                      </select>
                    </div>
                  )}
                </div>

                <div className="bg-slate-50 dark:bg-[#0B1120] rounded-2xl p-4 border border-slate-100 dark:border-slate-800/60">
                  <div className="flex justify-between items-center mb-4">
                    <label className="text-sm font-black text-slate-700 dark:text-slate-300">Order Items</label>
                    <button type="button" onClick={() => setCurrentOrder({ ...currentOrder, items: [...(currentOrder.items || []), { productId: '', productName: '', quantity: 1, expectedPrice: 0 }] })} className="text-xs font-bold text-primary hover:underline">
                      + Add Item
                    </button>
                  </div>
                  <div className="space-y-3">
                    {(currentOrder.items || []).map((item, idx) => (
                      <div key={idx} className="flex gap-2">
                        <select
                          className="flex-1 px-3 py-2 bg-white dark:bg-slate-900 rounded-lg text-sm font-medium border border-slate-200 dark:border-slate-700 dark:text-white"
                          value={item.productId}
                          onChange={e => {
                            const p = products.find(p => p.id === e.target.value);
                            const newItems = [...(currentOrder.items || [])];
                            if (p) newItems[idx] = { ...item, productId: p.id, productName: p.name, expectedPrice: p.costPrice || p.price };
                            setCurrentOrder({ ...currentOrder, items: newItems });
                          }}
                        >
                          <option value="">Select product...</option>
                          {products.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                        </select>
                        <input type="number" min="1" placeholder="Qty" value={item.quantity} onChange={e => {
                          const newItems = [...(currentOrder.items || [])];
                          newItems[idx] = { ...newItems[idx], quantity: parseInt(e.target.value) || 1 };
                          setCurrentOrder({ ...currentOrder, items: newItems });
                        }} className="w-20 px-3 py-2 bg-white dark:bg-slate-900 rounded-lg text-sm text-center border border-slate-200 dark:border-slate-700 dark:text-white" />
                        <input type="number" step="0.01" placeholder="Price" value={item.expectedPrice} onChange={e => {
                          const newItems = [...(currentOrder.items || [])];
                          newItems[idx] = { ...newItems[idx], expectedPrice: parseFloat(e.target.value) || 0 };
                          setCurrentOrder({ ...currentOrder, items: newItems });
                        }} className="w-24 px-3 py-2 bg-white dark:bg-slate-900 rounded-lg text-sm border border-slate-200 dark:border-slate-700 dark:text-white" />
                        <button type="button" onClick={() => {
                          const newItems = [...(currentOrder.items || [])];
                          newItems.splice(idx, 1);
                          setCurrentOrder({ ...currentOrder, items: newItems });
                        }} className="p-2 text-red-500 hover:bg-red-50 rounded-lg"><X className="w-4 h-4" /></button>
                      </div>
                    ))}
                    {(!currentOrder.items || currentOrder.items.length === 0) && (
                      <p className="text-xs text-center text-slate-400 py-4">No items added to this order.</p>
                    )}
                  </div>
                </div>

                <div className="pt-4 flex gap-3">
                  <button type="button" onClick={() => setModalOpen(false)} className="flex-1 py-3.5 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 rounded-xl text-xs font-black uppercase tracking-widest hover:bg-slate-200 transition-all">Cancel</button>
                  <button type="submit" disabled={isProcessing || !currentOrder.items?.length || currentOrder.status === 'received'} className="flex-1 py-3.5 bg-primary text-white rounded-xl text-xs font-black uppercase tracking-widest shadow-xl shadow-primary/20 flex items-center justify-center gap-2 active:scale-95 transition-all disabled:opacity-50">
                    {isProcessing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />} Save PO
                  </button>
                </div>
              </form>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {receivingOrder && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-50 bg-[#1e293b]/60 backdrop-blur-sm flex items-center justify-center p-4">
            <motion.div initial={{ scale: 0.9 }} animate={{ scale: 1 }} exit={{ scale: 0.9 }} className="bg-white dark:bg-slate-900 rounded-3xl p-8 max-w-3xl w-full shadow-2xl relative max-h-[90vh] overflow-y-auto">
              <div className="flex justify-between items-center mb-6">
                <div>
                  <h3 className="text-2xl font-black text-slate-900 dark:text-white">Receive Purchase Order</h3>
                  <p className="text-sm font-semibold text-slate-500 dark:text-slate-400">Stock is booked when this receipt is saved.</p>
                </div>
                <button onClick={() => setReceivingOrder(null)} className="p-2 text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800 rounded-full transition-all"><X className="w-5 h-5" /></button>
              </div>

              <form onSubmit={submitReceiving} className="space-y-5">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div>
                    <label className="text-[10px] font-black uppercase text-slate-400 px-1">Invoice / Ref</label>
                    <input value={receivingInvoiceNumber} onChange={e => setReceivingInvoiceNumber(e.target.value)} className="w-full px-4 py-3 bg-slate-50 dark:bg-[#0B1120] border border-slate-200 dark:border-slate-700/60 rounded-xl focus:outline-none focus:border-primary/50 text-sm font-semibold mt-1 dark:text-white" placeholder="INV-001" />
                  </div>
                  <div>
                    <label className="text-[10px] font-black uppercase text-slate-400 px-1">Invoice Date</label>
                    <input type="date" value={receivingInvoiceDate} onChange={e => setReceivingInvoiceDate(e.target.value)} className="w-full px-4 py-3 bg-slate-50 dark:bg-[#0B1120] border border-slate-200 dark:border-slate-700/60 rounded-xl focus:outline-none focus:border-primary/50 text-sm font-semibold mt-1 dark:text-white" />
                  </div>
                  <div>
                    <label className="text-[10px] font-black uppercase text-slate-400 px-1">Invoice Status</label>
                    <select value={receivingInvoiceStatus} onChange={e => setReceivingInvoiceStatus(e.target.value as 'unpaid' | 'paid')} className="w-full px-4 py-3 bg-slate-50 dark:bg-[#0B1120] border border-slate-200 dark:border-slate-700/60 rounded-xl focus:outline-none focus:border-primary/50 text-sm font-semibold mt-1 dark:text-white">
                      <option value="unpaid">Unpaid</option>
                      <option value="paid">Paid</option>
                    </select>
                  </div>
                </div>

                <div className="bg-slate-50 dark:bg-[#0B1120] rounded-2xl border border-slate-100 dark:border-slate-800/60 overflow-hidden">
                  <div className="grid grid-cols-12 gap-2 px-4 py-3 text-[10px] font-black uppercase tracking-widest text-slate-400 border-b border-slate-100 dark:border-slate-800/60">
                    <span className="col-span-4">Item</span>
                    <span className="col-span-2 text-right">Ordered</span>
                    <span className="col-span-2 text-right">Received</span>
                    <span className="col-span-2 text-right">Cost</span>
                    <span className="col-span-2 text-right">Variance</span>
                  </div>
                  <div className="divide-y divide-slate-100 dark:divide-slate-800/60">
                    {receivingLines.map((line, idx) => {
                      const variance = Number(line.receivedQuantity || 0) - Number(line.orderedQuantity || 0);
                      return (
                        <div key={`${line.productId}-${line.lineIndex}`} className="grid grid-cols-12 gap-2 px-4 py-3 items-center">
                          <div className="col-span-4 min-w-0">
                            <p className="text-sm font-black text-slate-800 dark:text-white truncate">{line.productName}</p>
                            <input value={line.note} onChange={e => {
                              const next = [...receivingLines];
                              next[idx] = { ...line, note: e.target.value };
                              setReceivingLines(next);
                            }} className="mt-2 w-full px-3 py-2 bg-white dark:bg-slate-900 rounded-lg text-xs border border-slate-200 dark:border-slate-700 dark:text-white" placeholder="Line note" />
                          </div>
                          <p className="col-span-2 text-right text-sm font-bold text-slate-500 dark:text-slate-400">{line.orderedQuantity}</p>
                          <input type="number" min="0" step="0.001" value={line.receivedQuantity} onChange={e => {
                            const next = [...receivingLines];
                            next[idx] = { ...line, receivedQuantity: parseFloat(e.target.value) || 0 };
                            setReceivingLines(next);
                          }} className="col-span-2 px-3 py-2 bg-white dark:bg-slate-900 rounded-lg text-sm text-right border border-slate-200 dark:border-slate-700 dark:text-white" />
                          <input type="number" min="0" step="0.01" value={line.receivedPrice} onChange={e => {
                            const next = [...receivingLines];
                            next[idx] = { ...line, receivedPrice: parseFloat(e.target.value) || 0 };
                            setReceivingLines(next);
                          }} className="col-span-2 px-3 py-2 bg-white dark:bg-slate-900 rounded-lg text-sm text-right border border-slate-200 dark:border-slate-700 dark:text-white" />
                          <p className={`col-span-2 text-right text-sm font-black ${variance === 0 ? 'text-slate-400' : variance > 0 ? 'text-emerald-600' : 'text-red-500'}`}>{variance > 0 ? '+' : ''}{variance.toFixed(3)}</p>
                          <div className="col-span-12 grid grid-cols-1 md:grid-cols-2 gap-2">
                            <input value={line.batchNumber} onChange={e => {
                              const next = [...receivingLines];
                              next[idx] = { ...line, batchNumber: e.target.value };
                              setReceivingLines(next);
                            }} className="px-3 py-2 bg-white dark:bg-slate-900 rounded-lg text-xs border border-slate-200 dark:border-slate-700 dark:text-white" placeholder="Batch or lot reference" />
                            <input type="date" value={line.expiryDate} onChange={e => {
                              const next = [...receivingLines];
                              next[idx] = { ...line, expiryDate: e.target.value };
                              setReceivingLines(next);
                            }} className="px-3 py-2 bg-white dark:bg-slate-900 rounded-lg text-xs border border-slate-200 dark:border-slate-700 dark:text-white" />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                <textarea value={receivingNote} onChange={e => setReceivingNote(e.target.value)} className="w-full px-4 py-3 bg-slate-50 dark:bg-[#0B1120] border border-slate-200 dark:border-slate-700/60 rounded-xl focus:outline-none focus:border-primary/50 text-sm font-semibold dark:text-white min-h-[92px]" placeholder="Receiving note, variance explanation, or supplier delivery reference" />

                {receivingError && (
                  <p className="text-sm font-bold text-red-600 bg-red-50 dark:bg-red-950/30 border border-red-100 dark:border-red-900/40 rounded-xl px-4 py-3">{receivingError}</p>
                )}

                <div className="flex justify-between items-center gap-4 pt-2">
                  <div className="text-sm font-black text-slate-600 dark:text-slate-300">
                    Total received R{receivingLines.reduce((sum, line) => sum + Number(line.receivedQuantity || 0) * Number(line.receivedPrice || 0), 0).toFixed(2)}
                  </div>
                  <div className="flex gap-3">
                    <button type="button" onClick={() => setReceivingOrder(null)} className="px-6 py-3.5 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 rounded-xl text-xs font-black uppercase tracking-widest hover:bg-slate-200 transition-all">Cancel</button>
                    <button type="submit" disabled={isProcessing || !receivingLines.some(line => Number(line.receivedQuantity || 0) > 0)} className="px-6 py-3.5 bg-emerald-600 text-white rounded-xl text-xs font-black uppercase tracking-widest shadow-xl shadow-emerald-600/20 flex items-center justify-center gap-2 active:scale-95 transition-all disabled:opacity-50">
                      {isProcessing ? <Loader2 className="w-4 h-4 animate-spin" /> : <ClipboardCheck className="w-4 h-4" />} Save Receipt
                    </button>
                  </div>
                </div>
              </form>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
