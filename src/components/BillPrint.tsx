import React from 'react';
import { AppConfig, CartItem, Customer, OrderItem } from '../types';

interface BillPrintProps {
  cart: (CartItem | OrderItem)[];
  customer: Customer | null;
  config: AppConfig | null;
  subtotal: number;
  discount?: number;
}

export const BillPrint: React.FC<BillPrintProps> = ({ cart, customer, config, subtotal, discount = 0 }) => {
  const currency = config?.business?.currency || 'R';
  const taxRate = config?.business?.taxRate || 0;
  const taxInclusive = config?.business?.taxInclusive !== false;
  const taxName = config?.business?.taxName || 'VAT';
  const taxAmount = taxRate
    ? (taxInclusive ? subtotal - subtotal / (1 + taxRate / 100) : subtotal * (taxRate / 100))
    : 0;
  const totalBeforeDiscount = taxInclusive ? subtotal : subtotal + taxAmount;
  const totalDue = Math.max(0, totalBeforeDiscount - discount);

  return (
    <div className="bill-print-only fixed inset-0 bg-white text-black z-[9999] hidden p-4 flex-col text-[12px] font-mono leading-tight max-w-[80mm] mx-auto">
      <div className="text-center mb-4">
        {config?.business?.logoUrl && (
          <img src={config.business.logoUrl} alt="logo" className="h-12 mx-auto mb-2 object-contain" />
        )}
        <h1 className="font-bold text-xl uppercase mb-1">{config?.business?.name || "JIMMY'S POS"}</h1>
        {config?.business?.address && <p>{config.business.address}</p>}
        {config?.business?.phone && <p>{config.business.phone}</p>}
        <div className="border-b border-black border-dashed my-2" />
        <p className="font-bold">CUSTOMER BILL</p>
        <p>Not paid</p>
        <p>{new Date().toLocaleString()}</p>
        <p>{customer?.name || 'Walk-in Customer'}</p>
      </div>

      <div className="w-full mb-2">
        <div className="flex justify-between font-bold mb-1 border-b border-black pb-1">
          <span className="flex-1">Item</span>
          <span className="w-8 text-right">Qty</span>
          <span className="w-20 text-right">Price</span>
        </div>
        {cart.map((item, idx) => (
          <div key={`${item.id}-${idx}`} className="mb-1">
            <div className="flex justify-between">
              <span className="flex-1 pr-2 truncate">{item.name}</span>
              <span className="w-8 text-right">{item.quantity}</span>
              <span className="w-20 text-right">{currency}{(Number(item.price || 0) * Number(item.quantity || 0)).toFixed(2)}</span>
            </div>
            {'selectedModifiers' in item && item.selectedModifiers && item.selectedModifiers.length > 0 && (
              <div className="pl-2 text-[10px]">
                {item.selectedModifiers.map(mod => `+ ${mod.name}`).join(', ')}
              </div>
            )}
          </div>
        ))}
      </div>

      <div className="border-b border-black border-dashed my-2" />

      <div className="space-y-1 mb-2">
        <div className="flex justify-between text-[11px]">
          <span>Subtotal {taxInclusive ? '(incl. tax)' : ''}</span>
          <span>{currency}{Number(subtotal || 0).toFixed(2)}</span>
        </div>
        {taxRate > 0 && (
          <div className="flex justify-between text-[11px]">
            <span>{taxName} ({taxRate}%){taxInclusive ? ' incl.' : ''}</span>
            <span>{currency}{Number(taxAmount || 0).toFixed(2)}</span>
          </div>
        )}
        {discount > 0 && (
          <div className="flex justify-between text-[11px]">
            <span>Discount</span>
            <span>-{currency}{Number(discount || 0).toFixed(2)}</span>
          </div>
        )}
        <div className="flex justify-between font-bold text-sm border-t border-black pt-1 mt-1">
          <span>AMOUNT DUE</span>
          <span>{currency}{Number(totalDue || 0).toFixed(2)}</span>
        </div>
      </div>

      <div className="border-b border-black border-dashed my-2" />
      <p className="text-center text-[11px]">Please check your bill before payment.</p>

      <style dangerouslySetInnerHTML={{__html: `
        @media print {
          body * { visibility: hidden; }
          .bill-print-only, .bill-print-only * { visibility: visible; }
          .bill-print-only {
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
