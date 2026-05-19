import React from 'react';
import { Sale, AppConfig } from '../types';
import { getDate } from '../utils/date';

interface ReceiptProps {
  sale: Sale;
  config: AppConfig | null;
}

export const Receipt: React.FC<ReceiptProps> = ({ sale, config }) => {
  const currency = config?.business?.currency || 'R';
  const taxName = config?.business?.taxName || 'VAT';
  const taxRate = sale.taxRate || config?.business?.taxRate || 0;
  const taxInclusive = sale.taxInclusive !== undefined ? sale.taxInclusive : config?.business?.taxInclusive !== false;
  const subtotal = sale.subtotal ?? sale.total;
  const taxAmount = sale.taxAmount ?? (taxRate ? (taxInclusive ? subtotal - subtotal / (1 + taxRate / 100) : subtotal * (taxRate / 100)) : 0);
  const isRefund = sale.transactionType === 'refund' || Number(sale.total || 0) < 0;

  const createdAt = getDate(sale.createdAt);
  const isValidDate = !isNaN(createdAt.getTime());
  const dateDisplay = isValidDate ? createdAt.toLocaleString() : '';

  return (
    <div className="receipt-print-only fixed inset-0 bg-white text-black z-[9999] hidden p-4 flex-col text-[12px] font-mono leading-tight max-w-[80mm] mx-auto">
      {/* Header */}
      <div className="text-center mb-4">
        {config?.business?.logoUrl && (
          <img src={config.business.logoUrl} alt="logo" className="h-12 mx-auto mb-2 object-contain" />
        )}
        <h1 className="font-bold text-xl uppercase mb-1">{config?.business?.name || "JIMMY'S POS"}</h1>
        {config?.business?.address && <p>{config.business.address}</p>}
        {config?.business?.phone && <p>{config.business.phone}</p>}
        <div className="border-b border-black border-dashed my-2" />
        <p className="font-bold">{isRefund ? 'REFUND RECEIPT' : 'TAX INVOICE'}</p>
        <p>Order #{sale.id.slice(-8).toUpperCase()}</p>
        {sale.parentSaleId && <p>Original #{sale.parentSaleId.slice(-8).toUpperCase()}</p>}
        {dateDisplay && <p>{dateDisplay}</p>}
        {sale.tableNumber && <p className="font-bold mt-1">Table {sale.tableNumber}</p>}
      </div>

      {/* Receipt header text */}
      {config?.business?.receiptHeader && (
        <>
          <div className="text-center text-[11px] whitespace-pre-line mb-2">{config.business.receiptHeader}</div>
          <div className="border-b border-black border-dashed mb-2" />
        </>
      )}

      {/* Items */}
      <div className="w-full mb-2">
        <div className="flex justify-between font-bold mb-1 border-b border-black pb-1">
          <span className="flex-1">Item</span>
          <span className="w-8 text-right">Qty</span>
          <span className="w-20 text-right">Price</span>
        </div>
        {sale.items.map((item, idx) => (
          <div key={idx} className="flex justify-between mb-1">
            <span className="flex-1 pr-2 truncate">{item.name}</span>
            <span className="w-8 text-right">{item.quantity}</span>
            <span className="w-20 text-right">{currency}{(Number(item.price || 0) * Number(item.quantity || 0)).toFixed(2)}</span>
          </div>
        ))}
      </div>

      <div className="border-b border-black border-dashed my-2" />

      {/* Totals */}
      <div className="space-y-1 mb-2">
        {taxRate > 0 && (
          <>
            <div className="flex justify-between text-[11px]">
              <span>Subtotal {taxInclusive ? '(incl. tax)' : ''}</span>
              <span>{currency}{Number(subtotal || 0).toFixed(2)}</span>
            </div>
            <div className="flex justify-between text-[11px]">
              <span>{taxName} ({taxRate}%){taxInclusive ? ' incl.' : ''}</span>
              <span>{currency}{Number(taxAmount || 0).toFixed(2)}</span>
            </div>
          </>
        )}
        {sale.pointsDiscount !== undefined && sale.pointsDiscount > 0 && (
          <div className="flex justify-between text-[11px]">
            <span>Points Discount</span>
            <span>-{currency}{Number(sale.pointsDiscount || 0).toFixed(2)}</span>
          </div>
        )}
        <div className="flex justify-between font-bold text-sm border-t border-black pt-1 mt-1">
          <span>{isRefund ? 'REFUND TOTAL' : 'TOTAL DUE'}</span>
          <span>{currency}{Number(sale.total || 0).toFixed(2)}</span>
        </div>

        {sale.payments && sale.payments.length > 0 ? (
          <div className="space-y-0.5 mt-2">
            <p className="text-[10px] font-bold border-b border-black border-dotted pb-0.5 mb-1 uppercase">Payments</p>
            {sale.payments.map((p, idx) => (
              <div key={idx} className="space-y-0.5">
                <div className="flex justify-between text-[11px]">
                  <span className="uppercase">{p.method} Tendered</span>
                  <span>{currency}{Number(p.tenderedAmount || p.amount).toFixed(2)}</span>
                </div>
                {p.changeAmount > 0 && (
                  <div className="flex justify-between text-[11px] pl-2">
                    <span>- Change</span>
                    <span>{currency}{Number(p.changeAmount).toFixed(2)}</span>
                  </div>
                )}
                {p.tipAmount > 0 && (
                  <div className="flex justify-between text-[11px] pl-2">
                    <span>+ Tip</span>
                    <span>{currency}{Number(p.tipAmount).toFixed(2)}</span>
                  </div>
                )}
                {p.cashOutAmount > 0 && (
                  <div className="flex justify-between text-[11px] pl-2">
                    <span>- Cashout</span>
                    <span>{currency}{Number(p.cashOutAmount).toFixed(2)}</span>
                  </div>
                )}
              </div>
            ))}
          </div>
        ) : (
          <>
            <div className="flex justify-between">
              <span>TENDERED ({sale.paymentMethod.toUpperCase()})</span>
              <span>{currency}{Number(sale.tenderedAmount || sale.total || 0).toFixed(2)}</span>
            </div>
            {sale.changeAmount !== undefined && sale.changeAmount > 0 && (
              <div className="flex justify-between font-bold">
                <span>CHANGE</span>
                <span>{currency}{Number(sale.changeAmount || 0).toFixed(2)}</span>
              </div>
            )}
            {sale.tipAmount != null && Number(sale.tipAmount) > 0 && (
              <div className="flex justify-between">
                <span>TIP</span>
                <span>{currency}{Number(sale.tipAmount || 0).toFixed(2)}</span>
              </div>
            )}
          </>
        )}
      </div>

      <div className="border-b border-black border-dashed my-2" />

      {/* Footer */}
      <div className="text-center mt-2 text-[11px]">
        {config?.business?.receiptFooter ? (
          <p className="whitespace-pre-line">{config.business.receiptFooter}</p>
        ) : (
          <>
            <p>Thank you for your business!</p>
            <p>Please come again.</p>
          </>
        )}
      </div>

      <style dangerouslySetInnerHTML={{__html: `
        @media print {
          body * { visibility: hidden; }
          .receipt-print-only, .receipt-print-only * { visibility: visible; }
          .receipt-print-only {
            display: flex !important;
            position: absolute;
            left: 0; top: 0;
            width: 80mm;
            padding: 4mm;
            margin: 0;
          }
        }
      `}} />
    </div>
  );
};
