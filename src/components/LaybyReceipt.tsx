import React from 'react';
import { AppConfig, LaybyOrder } from '../types';
import { buildReceiptPrintCss, getReceiptPaperProfile } from '../utils/receiptPrinting';

interface LaybyReceiptProps {
  order: LaybyOrder;
  config: AppConfig | null;
}

function formatDate(value: any) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleString();
}

export const LaybyReceipt: React.FC<LaybyReceiptProps> = ({ order, config }) => {
  const currency = config?.business?.currency || 'R';
  const printProfile = getReceiptPaperProfile(config?.business?.receiptPrint);
  const showLogo = Boolean(config?.business?.logoUrl && printProfile.showLogo && printProfile.logoMode !== 'none');
  const itemNameClass = printProfile.itemNameMode === 'truncate' ? 'truncate' : 'receipt-text';
  const title = order.status === 'completed'
    ? 'LAY-BY COLLECTION'
    : order.status === 'cancelled'
      ? 'LAY-BY CANCELLED'
      : 'LAY-BY RECEIPT';

  return (
    <div
      className="layby-receipt-print-only fixed inset-0 bg-white text-black z-[9999] hidden flex-col font-mono leading-tight mx-auto"
      style={{ width: printProfile.contentWidth, maxWidth: printProfile.maxWidth, fontSize: printProfile.fontSizePx }}
    >
      <div className="text-center mb-4">
        {showLogo && config?.business?.logoUrl && (
          <img
            src={config.business.logoUrl}
            alt="Business logo"
            className="mx-auto mb-2 object-contain"
            style={{ maxHeight: printProfile.logoMaxHeight, maxWidth: '80%' }}
          />
        )}
        <h1 className="font-bold text-[1.35em] uppercase mb-1 receipt-text">{config?.business?.name || 'MASEPOS'}</h1>
        {config?.business?.address && <p>{config.business.address}</p>}
        {config?.business?.phone && <p>{config.business.phone}</p>}
        <div className="border-b border-black border-dashed my-2" />
        <p className="font-bold">{title}</p>
        <p>Lay-by #{order.id.slice(-8).toUpperCase()}</p>
        {order.completedSaleId && <p>Sale #{order.completedSaleId.slice(-8).toUpperCase()}</p>}
        <p>{order.customerName}</p>
        {order.dueDate && <p>Due {formatDate(order.dueDate).split(',')[0]}</p>}
        {order.createdAt && <p>{formatDate(order.createdAt)}</p>}
      </div>

      <div className="w-full mb-2">
        <div className="flex justify-between font-bold mb-1 border-b border-black pb-1">
          <span className="flex-1">Item</span>
          <span className="w-8 text-right">Qty</span>
          <span className="w-20 text-right">Price</span>
        </div>
        {order.items.map(item => (
          <div key={item.id} className="receipt-row flex justify-between mb-1">
            <span className={`flex-1 pr-2 ${itemNameClass}`}>{item.productName || item.name}</span>
            <span className="w-8 text-right">{item.quantity}</span>
            <span className="w-20 text-right">{currency}{(Number(item.price || 0) * Number(item.quantity || 0)).toFixed(2)}</span>
          </div>
        ))}
      </div>

      <div className="border-b border-black border-dashed my-2" />

      <div className="space-y-1 mb-2">
        {order.taxRate > 0 && (
          <>
            <div className="flex justify-between text-[11px]">
              <span>Subtotal</span>
              <span>{currency}{Number(order.subtotal || 0).toFixed(2)}</span>
            </div>
            <div className="flex justify-between text-[11px]">
              <span>Tax ({order.taxRate}%)</span>
              <span>{currency}{Number(order.taxAmount || 0).toFixed(2)}</span>
            </div>
          </>
        )}
        <div className="flex justify-between font-bold text-sm border-t border-black pt-1 mt-1">
          <span>TOTAL</span>
          <span>{currency}{Number(order.totalAmount || 0).toFixed(2)}</span>
        </div>
        <div className="flex justify-between">
          <span>PAID</span>
          <span>{currency}{Number(order.amountPaid || 0).toFixed(2)}</span>
        </div>
        <div className="flex justify-between font-bold">
          <span>BALANCE</span>
          <span>{currency}{Number(order.balanceDue || 0).toFixed(2)}</span>
        </div>
        {order.status === 'cancelled' && (
          <>
            <div className="flex justify-between text-[11px]">
              <span>Refund</span>
              <span>{currency}{Number(order.refundAmount || 0).toFixed(2)}</span>
            </div>
            <div className="flex justify-between text-[11px]">
              <span>Forfeited</span>
              <span>{currency}{Number(order.forfeitedAmount || 0).toFixed(2)}</span>
            </div>
          </>
        )}
      </div>

      {order.payments.length > 0 && (
        <>
          <div className="border-b border-black border-dashed my-2" />
          <div className="space-y-0.5">
            <p className="text-[10px] font-bold border-b border-black border-dotted pb-0.5 mb-1 uppercase">Payments</p>
            {order.payments.map(payment => (
              <div key={payment.id} className="flex justify-between text-[11px]">
                <span className="uppercase">{payment.method}</span>
                <span>{currency}{Number(payment.amount || 0).toFixed(2)}</span>
              </div>
            ))}
          </div>
        </>
      )}

      <div className="border-b border-black border-dashed my-2" />
      <div className="text-center mt-2 text-[11px]">
        {config?.business?.receiptFooter ? (
          <p className="whitespace-pre-line">{config.business.receiptFooter}</p>
        ) : (
          <p>Keep this receipt for collection.</p>
        )}
      </div>

      <style dangerouslySetInnerHTML={{ __html: buildReceiptPrintCss('layby-receipt-print-only', config?.business?.receiptPrint) }} />
    </div>
  );
};
