import React from 'react';
import { Sale, AppConfig, Customer } from '../types';

interface ReceiptProps {
  sale: Sale;
  config: AppConfig | null;
  customer?: Customer | null;
}

export function Receipt({ sale, config, customer }: ReceiptProps) {
  // We apply @media print styles natively in css or tailwind
  // For Tailwind, 'print:' variants work nicely.
  
  return (
    <div className="w-[80mm] max-w-full bg-white text-black p-4 text-xs font-mono mx-auto print:block hidden" id="print-receipt">
      <div className="text-center mb-4">
        <h1 className="font-bold text-lg uppercase">{config?.business?.name || 'JIMMY POS'}</h1>
        {config?.business?.address && <p>{config.business.address}</p>}
        {config?.business?.receiptHeader && <p className="mt-2 whitespace-pre-wrap">{config.business.receiptHeader}</p>}
      </div>
      
      <div className="border-b border-black border-dashed pb-2 mb-2 flex justify-between">
        <span>Receipt #{sale.id.slice(-6).toUpperCase()}</span>
        <span>{new Date().toLocaleDateString()}</span>
      </div>
      
      {customer && (
        <div className="border-b border-black border-dashed pb-2 mb-2">
          Customer: {customer.name}<br/>
          {customer.loyaltyPoints !== undefined && <span>Loyalty Points: {customer.loyaltyPoints}</span>}
        </div>
      )}
      
      <div className="mb-4">
        {sale.items.map((item, i) => (
          <div key={i} className="mb-1">
            <div className="flex justify-between">
              <span>{item.quantity}x {item.name}</span>
              <span>R{(item.price * item.quantity).toFixed(2)}</span>
            </div>
          </div>
        ))}
      </div>
      
      <div className="border-t border-black border-dashed pt-2 mb-2">
        <div className="flex justify-between font-bold text-sm">
          <span>TOTAL</span>
          <span>R{sale.total.toFixed(2)}</span>
        </div>
      </div>
      
      <div className="mb-4">
        <div className="flex justify-between">
          <span>Tendered ({sale.paymentMethod})</span>
          <span>R{sale.tenderedAmount?.toFixed(2) || sale.total.toFixed(2)}</span>
        </div>
        <div className="flex justify-between">
          <span>Change</span>
          <span>R{sale.changeAmount?.toFixed(2) || '0.00'}</span>
        </div>
      </div>
      
      <div className="text-center mt-6">
        {config?.business?.receiptFooter && <p className="mb-2 whitespace-pre-wrap">{config.business.receiptFooter}</p>}
        <p>Thank you for your business!</p>
        <p className="mt-4 text-[10px]">Powered by Jimmy POS</p>
      </div>
    </div>
  );
}
