import React from 'react';
import { UserPlus, Edit, TabletSmartphone, ReceiptText, Download, RefreshCw, Megaphone, ShieldCheck, UserX } from 'lucide-react';
import { deleteCustomer, getCustomerCampaignExport, getCustomerDataExport } from '../api';
import { Customer, CustomerCampaignExport, CustomerConsentStatus, Sale } from '../types';
import { CustomerBatchPanel } from '../components/CustomerBatchPanel';

interface CustomersViewProps {
  tenantId?: string | null;
  customers: Customer[];
  sales: Sale[];
  onEdit: (customer: Customer) => void;
  onAdd: () => void;
  onViewOrders: (customerId: string) => void;
  onResumeTab: (sale: Sale) => void;
  onCustomersUpdated?: () => void | Promise<void>;
}

export const CustomersView: React.FC<CustomersViewProps> = ({
  tenantId, customers, sales, onEdit, onAdd, onViewOrders, onResumeTab, onCustomersUpdated,
}) => {
  const [campaignSegment, setCampaignSegment] = React.useState('all');
  const [campaignExport, setCampaignExport] = React.useState<CustomerCampaignExport | null>(null);
  const [campaignLoading, setCampaignLoading] = React.useState(false);
  const [campaignError, setCampaignError] = React.useState<string | null>(null);
  const [customerExportError, setCustomerExportError] = React.useState<string | null>(null);
  const [exportingCustomerId, setExportingCustomerId] = React.useState<string | null>(null);
  const [anonymizingCustomerId, setAnonymizingCustomerId] = React.useState<string | null>(null);
  const getOpenTab = (customerId: string) =>
    sales.find(s => s.customerId === customerId && s.isTab && s.status === 'open');
  const consentLabel = (status?: CustomerConsentStatus | string | null) => String(status || 'unknown').replace('_', ' ');
  const consentPillClass = (status?: CustomerConsentStatus | string | null) => {
    if (status === 'granted') return 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900/50 dark:bg-emerald-900/20 dark:text-emerald-300';
    if (status === 'denied' || status === 'revoked') return 'border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-900/50 dark:bg-rose-900/20 dark:text-rose-300';
    return 'border-slate-200 bg-slate-50 text-slate-500 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-400';
  };

  const loadCampaignExport = React.useCallback(async () => {
    if (!tenantId) return;
    setCampaignLoading(true);
    setCampaignError(null);
    try {
      setCampaignExport(await getCustomerCampaignExport(tenantId, { segment: campaignSegment, limit: 2000 }));
    } catch (error: any) {
      setCampaignError(error?.message || 'Could not load customer segments.');
    } finally {
      setCampaignLoading(false);
    }
  }, [campaignSegment, tenantId]);

  React.useEffect(() => {
    if (tenantId) void loadCampaignExport();
  }, [loadCampaignExport, tenantId]);

  const downloadCampaignCsv = React.useCallback(() => {
    if (!campaignExport) return;
    const url = URL.createObjectURL(new Blob([campaignExport.csv], { type: campaignExport.mimeType || 'text/csv;charset=utf-8' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = campaignExport.filename || 'customer-campaign-export.csv';
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 0);
  }, [campaignExport]);

  const downloadCustomerData = React.useCallback(async (customer: Customer) => {
    if (!tenantId) return;
    setCustomerExportError(null);
    setExportingCustomerId(customer.id);
    try {
      const exportData = await getCustomerDataExport(tenantId, customer.id);
      const url = URL.createObjectURL(new Blob([
        exportData.fileContents || JSON.stringify(exportData.data, null, 2),
      ], { type: exportData.mimeType || 'application/json;charset=utf-8' }));
      const link = document.createElement('a');
      link.href = url;
      link.download = exportData.filename || `${customer.name || 'customer'}-data-export.json`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 0);
    } catch (error: any) {
      setCustomerExportError(error?.message || 'Could not export customer data.');
    } finally {
      setExportingCustomerId(null);
    }
  }, [tenantId]);

  const anonymizeCustomer = React.useCallback(async (customer: Customer) => {
    if (!tenantId || customer.isAnonymized) return;
    const confirmed = window.confirm(`Anonymize ${customer.name}? This keeps legal transaction records but removes personal contact details and revokes consent.`);
    if (!confirmed) return;
    setCustomerExportError(null);
    setAnonymizingCustomerId(customer.id);
    try {
      await deleteCustomer(tenantId, customer.id, { reason: 'Customer privacy deletion request from Customers view' });
      await onCustomersUpdated?.();
      await loadCampaignExport();
    } catch (error: any) {
      setCustomerExportError(error?.message || 'Could not anonymize customer profile.');
    } finally {
      setAnonymizingCustomerId(null);
    }
  }, [loadCampaignExport, onCustomersUpdated, tenantId]);

  const segmentOptions = [
    { value: 'all', label: 'All customers' },
    { value: 'campaign_ready', label: 'Campaign ready' },
    { value: 'contactable', label: 'Contactable' },
    { value: 'vip', label: 'VIP' },
    { value: 'frequent', label: 'Frequent' },
    { value: 'recent', label: 'Recent' },
    { value: 'new', label: 'New buyers' },
    { value: 'at_risk', label: 'At risk' },
    { value: 'lapsed', label: 'Lapsed' },
    { value: 'no_purchase', label: 'No purchase' },
    { value: 'loyalty_active', label: 'Loyalty active' },
    { value: 'account_customer', label: 'Account customers' },
    { value: 'wallet_credit', label: 'Wallet credit' },
    { value: 'discount_customer', label: 'Discount customers' },
  ];
  return (
    <div className="flex-1 p-4 lg:p-8 overflow-y-auto">
      <div className="max-w-6xl mx-auto space-y-6">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <h2 className="text-xl lg:text-2xl font-black tracking-tight text-slate-900 dark:text-white">Customer Intelligence</h2>
          <button
            onClick={onAdd}
            className="w-full sm:w-auto px-6 py-3.5 bg-primary text-white rounded-2xl font-bold flex items-center justify-center gap-2 shadow-xl shadow-primary/20 active:scale-95 transition-all text-sm"
          >
            <UserPlus className="w-5 h-5" />
            New Customer
          </button>
        </div>

        <CustomerBatchPanel tenantId={tenantId} onCustomersUpdated={onCustomersUpdated} />

        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <div className="flex items-center gap-2 text-slate-900 dark:text-white">
                <Megaphone className="h-5 w-5 text-primary" />
                <h3 className="text-base font-black">Campaign Segments</h3>
              </div>
              <div className="mt-2 flex flex-wrap gap-3 text-xs font-bold text-slate-500">
                <span>{campaignExport?.totalCustomers ?? customers.length} profiles</span>
                <span>{campaignExport?.contactableCount ?? customers.filter(c => c.email || c.phone).length} contactable</span>
                <span>{campaignExport?.campaignReadyCount ?? 0} campaign ready</span>
                <span>{campaignExport?.count ?? 0} in export</span>
              </div>
            </div>
            <div className="flex flex-col gap-2 sm:flex-row">
              <select
                value={campaignSegment}
                onChange={event => setCampaignSegment(event.target.value)}
                className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-bold outline-none focus:ring-4 focus:ring-primary/10 dark:border-slate-700 dark:bg-slate-950 dark:text-white"
              >
                {segmentOptions.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
              </select>
              <button
                type="button"
                onClick={() => void loadCampaignExport()}
                disabled={campaignLoading || !tenantId}
                className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 px-4 py-2 text-sm font-black text-slate-600 disabled:opacity-50 dark:border-slate-700 dark:text-slate-300"
              >
                <RefreshCw className={`h-4 w-4 ${campaignLoading ? 'animate-spin' : ''}`} />
                Refresh
              </button>
              <button
                type="button"
                onClick={downloadCampaignCsv}
                disabled={!campaignExport || campaignExport.count === 0}
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-primary px-4 py-2 text-sm font-black text-white disabled:opacity-50"
              >
                <Download className="h-4 w-4" />
                CSV
              </button>
            </div>
          </div>
          {campaignError && (
            <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-bold text-amber-700 dark:border-amber-900 dark:bg-amber-900/20 dark:text-amber-200">
              {campaignError}
            </div>
          )}
          {customerExportError && (
            <div className="mt-3 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-bold text-rose-700 dark:border-rose-900 dark:bg-rose-900/20 dark:text-rose-200">
              {customerExportError}
            </div>
          )}
          {campaignExport && (
            <div className="mt-4 space-y-4">
              <div className="flex flex-wrap gap-2">
                {campaignExport.summary.slice(0, 10).map(item => (
                  <button
                    type="button"
                    key={item.segment}
                    onClick={() => setCampaignSegment(item.segment)}
                    className="rounded-full bg-slate-100 px-3 py-1 text-[10px] font-black uppercase tracking-widest text-slate-600 dark:bg-slate-800 dark:text-slate-300"
                  >
                    {item.segment.replace('_', ' ')}: {item.count}
                  </button>
                ))}
              </div>
              <div className="grid gap-3 md:grid-cols-3">
                {campaignExport.rows.slice(0, 3).map(row => (
                  <div key={row.customerId} className="rounded-xl border border-slate-100 bg-slate-50 p-3 dark:border-slate-800 dark:bg-slate-950">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-black text-slate-900 dark:text-white">{row.name}</p>
                        <p className="truncate text-[10px] font-bold uppercase tracking-widest text-slate-400">{row.primarySegment.replace('_', ' ')}</p>
                      </div>
                      <span className="text-xs font-black text-primary">R{Number(row.totalSpend || 0).toFixed(2)}</span>
                    </div>
                    <div className={`mt-2 inline-flex items-center rounded-full px-2 py-1 text-[9px] font-black uppercase tracking-widest ${row.campaignEligible ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300' : 'bg-slate-200 text-slate-500 dark:bg-slate-800 dark:text-slate-400'}`}>
                      {row.campaignEligible ? 'Campaign ready' : 'Consent needed'}
                    </div>
                    <p className="mt-2 line-clamp-2 text-xs font-semibold text-slate-500 dark:text-slate-400">{row.campaignHint}</p>
                  </div>
                ))}
              </div>
              <p className="text-[11px] font-semibold text-slate-400">{campaignExport.consentNote}</p>
            </div>
          )}
        </div>

        {customers.length === 0 && (
          <div className="bg-white dark:bg-slate-900 rounded-3xl p-8 border border-slate-100 dark:border-slate-800/60 shadow-sm flex flex-col items-center text-center space-y-4">
            <div className="w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center">
              <UserPlus className="w-8 h-8 text-primary" />
            </div>
            <div>
              <h3 className="text-lg font-black text-slate-900 dark:text-white">Add Your First Customer</h3>
              <p className="text-sm text-slate-500 dark:text-slate-400 font-medium max-w-xs mx-auto">
                Build your database to track purchases and offer personalized service.
              </p>
            </div>
            <button
              onClick={onAdd}
              className="px-8 py-3 bg-slate-800 dark:bg-slate-100 text-white dark:text-slate-900 rounded-xl text-xs font-black uppercase tracking-widest hover:scale-105 transition-all"
            >
              Launch Creator
            </button>
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {customers.map(c => {
            const openTab = getOpenTab(c.id);
            return (
              <div
                key={c.id}
                className={`bg-white dark:bg-slate-900 border rounded-2xl p-5 lg:p-6 shadow-sm flex flex-col gap-4 transition-all ${
                  openTab
                    ? 'border-indigo-200 dark:border-indigo-800/50 ring-2 ring-indigo-100 dark:ring-indigo-900/30'
                    : 'border-slate-200 dark:border-slate-700/60 hover:border-primary/20'
                }`}
              >
                <div className="flex justify-between items-start">
                  <div className="flex items-center gap-3">
                    <div className="relative">
                      <div className="w-12 h-12 bg-slate-800 dark:bg-slate-100 text-white dark:text-slate-900 rounded-2xl flex items-center justify-center font-black uppercase text-lg shadow-lg">
                        {c.name.charAt(0)}
                      </div>
                      {openTab && (
                        <div className="absolute -top-1 -right-1 w-4 h-4 bg-indigo-500 rounded-full border-2 border-white dark:border-slate-900" />
                      )}
                    </div>
                    <div className="min-w-0">
                      <h3 className="font-bold text-slate-900 dark:text-white truncate">{c.name}</h3>
                      <p className="text-[10px] text-slate-400 dark:text-slate-500 font-bold uppercase tracking-widest truncate">{c.email}</p>
                      {c.isAnonymized && (
                        <p className="mt-1 text-[9px] font-black uppercase tracking-widest text-rose-500">Anonymized</p>
                      )}
                    </div>
                  </div>
                  <button
                    onClick={() => onEdit(c)}
                    disabled={Boolean(c.isAnonymized)}
                    className="p-2.5 bg-slate-50 dark:bg-[#0B1120] text-slate-400 dark:text-slate-500 hover:text-primary rounded-xl transition-all"
                    aria-label={`Edit ${c.name}`}
                  >
                    <Edit className="w-4 h-4" />
                  </button>
                </div>

                {/* Open tab indicator */}
                {openTab && (
                  <button
                    onClick={() => onResumeTab(openTab)}
                    className="flex items-center justify-between px-3 py-2.5 bg-indigo-50 dark:bg-indigo-900/20 border border-indigo-200 dark:border-indigo-800/50 rounded-xl hover:bg-indigo-100 dark:hover:bg-indigo-900/40 active:scale-95 transition-all"
                  >
                    <div className="flex items-center gap-2">
                      <TabletSmartphone className="w-4 h-4 text-indigo-500" />
                      <span className="text-xs font-black text-indigo-700 dark:text-indigo-400 uppercase tracking-widest">Open Tab</span>
                    </div>
                    <span className="font-black text-indigo-700 dark:text-indigo-400 text-sm">R{Number(openTab.total || 0).toFixed(2)}</span>
                  </button>
                )}

                {(c.accountEnabled || Number(c.accountBalance || 0) > 0) && (
                  <div className="grid grid-cols-3 gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-amber-800 dark:border-amber-900/40 dark:bg-amber-900/10 dark:text-amber-200">
                    <div>
                      <p className="text-[8px] font-black uppercase tracking-widest opacity-70">Limit</p>
                      <p className="text-xs font-black">R{Number(c.accountLimit || 0).toFixed(2)}</p>
                    </div>
                    <div>
                      <p className="text-[8px] font-black uppercase tracking-widest opacity-70">Owing</p>
                      <p className="text-xs font-black">R{Number(c.accountBalance || 0).toFixed(2)}</p>
                    </div>
                    <div>
                      <p className="text-[8px] font-black uppercase tracking-widest opacity-70">Left</p>
                      <p className="text-xs font-black">R{Math.max(0, Number(c.accountLimit || 0) - Number(c.accountBalance || 0)).toFixed(2)}</p>
                    </div>
                    <div className="col-span-3 flex items-center gap-2 text-[9px] font-black uppercase tracking-widest">
                      <ReceiptText className="w-3 h-3" />
                      {c.accountEnabled ? 'Account active' : 'Account disabled'}
                    </div>
                  </div>
                )}

                <div className="grid grid-cols-2 gap-2">
                  {(['marketing', 'stored_contact_details'] as const).map(type => {
                    const status = c.consents?.[type]?.status || 'unknown';
                    return (
                      <div key={type} className={`flex items-center gap-2 rounded-xl border px-3 py-2 ${consentPillClass(status)}`}>
                        <ShieldCheck className="h-3.5 w-3.5 shrink-0" />
                        <div className="min-w-0">
                          <p className="truncate text-[8px] font-black uppercase tracking-widest">{type === 'marketing' ? 'Marketing' : 'Contact data'}</p>
                          <p className="truncate text-[10px] font-black uppercase">{consentLabel(status)}</p>
                        </div>
                      </div>
                    );
                  })}
                </div>

                <div className="pt-2 border-t border-slate-50 dark:border-slate-800 flex items-center justify-between">
                  <div className="min-w-0 text-xs font-bold text-slate-400 dark:text-slate-500">
                    <span>{(c.loyaltyPoints || c.points || 0)} pts</span>
                    <span className="ml-2 uppercase">{(c.loyaltyMemberStatus || 'active').replace('_', ' ')}</span>
                    {(c.membershipCardId || c.membershipBarcode) && (
                      <span className="ml-2 truncate text-[10px] uppercase tracking-widest">{c.membershipCardId || c.membershipBarcode}</span>
                    )}
                  </div>
                  <button
                    onClick={() => onViewOrders(c.id)}
                    className="text-[10px] font-black text-primary uppercase tracking-widest hover:underline"
                  >
                    View Orders
                  </button>
                </div>
                <button
                  type="button"
                  onClick={() => void downloadCustomerData(c)}
                  disabled={!tenantId || exportingCustomerId === c.id}
                  className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-[10px] font-black uppercase tracking-widest text-slate-500 transition-all hover:border-primary/30 hover:text-primary disabled:opacity-50 dark:border-slate-800 dark:text-slate-400"
                >
                  <Download className={`h-3.5 w-3.5 ${exportingCustomerId === c.id ? 'animate-pulse' : ''}`} />
                  Data Export
                </button>
                {!c.isAnonymized && (
                  <button
                    type="button"
                    onClick={() => void anonymizeCustomer(c)}
                    disabled={!tenantId || anonymizingCustomerId === c.id}
                    className="inline-flex items-center justify-center gap-2 rounded-xl border border-rose-200 px-3 py-2 text-[10px] font-black uppercase tracking-widest text-rose-600 transition-all hover:bg-rose-50 disabled:opacity-50 dark:border-rose-900/60 dark:text-rose-300 dark:hover:bg-rose-900/20"
                  >
                    <UserX className={`h-3.5 w-3.5 ${anonymizingCustomerId === c.id ? 'animate-pulse' : ''}`} />
                    Anonymize
                  </button>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
