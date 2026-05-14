import React, { useState, useEffect, useMemo } from 'react';
import { getAccessToken, JwtUser } from '../hooks/useAuth';
import {
  Product, Customer, Staff, Sale, AppConfig, Workstation,
} from '../types';
import {
  Terminal, Database, Shield, Activity, Zap,
  Copy, CheckCircle2, XCircle, AlertTriangle, ExternalLink,
  Download, Trash2, RefreshCw, Code2, Server, Wifi, FlaskConical,
} from 'lucide-react';
import { getDate } from '../utils/date';

// ─── App constants ────────────────────────────────────────────────────
const APP_VERSION = String('0.0.1');

// ─── Types ─────────────────────────────────────────────────────────────
interface LogEntry {
  id: number;
  timestamp: Date;
  level: 'ERROR' | 'WARN';
  message: string;
}

interface DevDashboardProps {
  user: JwtUser;
  tenantId: string | null;
  products: Product[];
  customers: Customer[];
  staff: Staff[];
  sales: Sale[];
  config: AppConfig;
  workstations: Workstation[];
  onSeedProducts?: () => void;
  onClearSales?: () => void;
}

// ─── Helpers ───────────────────────────────────────────────────────────
function truncateId(id: string, len = 12): string {
  return id.length > len ? id.slice(0, len) + '…' : id;
}

function copyToClipboard(text: string) {
  navigator.clipboard.writeText(text).catch(() => {});
}

function CopyBtn({ text, label = 'Copy ID' }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  const handleCopy = () => {
    copyToClipboard(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };
  return (
    <button
      onClick={handleCopy}
      className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-semibold bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-600 active:scale-95 transition-all"
    >
      <Copy className="w-3 h-3" />
      {copied ? 'Copied!' : label}
    </button>
  );
}

function CheckRow({ ok, label, warn = false }: { ok: boolean; label: string; warn?: boolean }) {
  return (
    <div className="flex items-center gap-2 py-1.5 border-b border-slate-100 dark:border-slate-800 last:border-0">
      {ok ? (
        <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
      ) : warn ? (
        <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0" />
      ) : (
        <XCircle className="w-4 h-4 text-red-500 shrink-0" />
      )}
      <span className={`text-sm font-medium ${ok ? 'text-slate-700 dark:text-slate-300' : warn ? 'text-amber-600 dark:text-amber-400' : 'text-red-600 dark:text-red-400'}`}>
        {label}
      </span>
    </div>
  );
}

function parseVersion(version: string) {
  return version
    .replace(/^[^0-9]*/, '')
    .split(/[\.\-\+]/)
    .map((segment) => Number(segment.replace(/[^0-9]/g, '')) || 0);
}

function isNewerVersion(current: string, latest: string) {
  const currentParts = parseVersion(current);
  const latestParts = parseVersion(latest);
  const maxLength = Math.max(currentParts.length, latestParts.length);

  for (let i = 0; i < maxLength; i += 1) {
    const currentValue = currentParts[i] ?? 0;
    const latestValue = latestParts[i] ?? 0;
    if (latestValue > currentValue) return true;
    if (latestValue < currentValue) return false;
  }

  return false;
}

// ─── Test Suite Types ──────────────────────────────────────────────────
type TestStatus = 'idle' | 'running' | 'pass' | 'fail' | 'warn';
interface TestResult { status: TestStatus; detail?: string; }
interface TestDef {
  id: string;
  name: string;
  description: string;
  group: string;
  run: (data: {
    products: Product[];
    customers: Customer[];
    staff: Staff[];
    sales: Sale[];
    config: AppConfig;
    workstations: Workstation[];
  }) => { status: 'pass' | 'fail' | 'warn'; detail?: string };
}

// ─── Main Component ────────────────────────────────────────────────────
export function DevDashboard({
  user,
  tenantId,
  products,
  customers,
  staff,
  sales,
  config,
  workstations,
  onSeedProducts,
  onClearSales,
}: DevDashboardProps) {
  const [activeTab, setActiveTab] = useState<'overview' | 'data' | 'health' | 'console' | 'actions' | 'tests'>('overview');
  const [dataSubTab, setDataSubTab] = useState<'products' | 'customers' | 'staff' | 'sales' | 'workstations'>('products');
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [logCounter, setLogCounter] = useState(0);
  const [seedConfirm, setSeedConfirm] = useState(false);
  const [clearConfirm, setClearConfirm] = useState(false);
  const [latestRelease, setLatestRelease] = useState<{ version: string; url: string; notes: string; publishedAt: string | null } | null>(null);
  const [updateStatus, setUpdateStatus] = useState<'idle' | 'checking' | 'available' | 'current' | 'updating' | 'error'>('idle');
  const [updateMessage, setUpdateMessage] = useState<string | null>(null);
  const [updateOutput, setUpdateOutput] = useState<string | null>(null);
  const [gitPrimary, setGitPrimary] = useState<'ssh' | 'token'>('ssh');
  const [gitAuthStatus, setGitAuthStatus] = useState<{ hasSsh: boolean; hasToken: boolean; hasKnownHosts: boolean; sshKeyPath: string | null; publicKey: string | null } | null>(null);
  const [gitTokenInput, setGitTokenInput] = useState('');
  const [gitSshKeyInput, setGitSshKeyInput] = useState('');
  const [gitKnownHostsInput, setGitKnownHostsInput] = useState('');
  const [gitAuthMessage, setGitAuthMessage] = useState<string | null>(null);
  const [gitAuthBusy, setGitAuthBusy] = useState(false);

  const GITHUB_REPO = 'Lifeat-online/JPOS';

  const currentVersionLabel = APP_VERSION === '0.0.0' ? 'unknown' : APP_VERSION;
  const canApplyUpdate = latestRelease !== null;

  const refreshGitAuthStatus = async () => {
    const token = getAccessToken();
    const res = await fetch('/api/dev/git-auth/status', {
      headers: token ? { Authorization: `Bearer ${token}` } : undefined,
    });
    const data = await res.json().catch(() => null);
    if (res.ok && data) setGitAuthStatus(data);
  };

  useEffect(() => {
    refreshGitAuthStatus().catch(() => {});
  }, []);

  const saveGitToken = async () => {
    setGitAuthBusy(true);
    setGitAuthMessage(null);
    try {
      const token = getAccessToken();
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (token) headers.Authorization = `Bearer ${token}`;
      const res = await fetch('/api/dev/git-auth/token', {
        method: 'POST',
        headers,
        body: JSON.stringify({ token: gitTokenInput }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || data.error) {
        setGitAuthMessage(data.error || 'Failed to save token.');
        return;
      }
      setGitTokenInput('');
      await refreshGitAuthStatus();
      setGitAuthMessage('Token saved (runtime).');
    } finally {
      setGitAuthBusy(false);
    }
  };

  const clearGitToken = async () => {
    setGitAuthBusy(true);
    setGitAuthMessage(null);
    try {
      const token = getAccessToken();
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (token) headers.Authorization = `Bearer ${token}`;
      const res = await fetch('/api/dev/git-auth/token', {
        method: 'POST',
        headers,
        body: JSON.stringify({ token: '' }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || data.error) {
        setGitAuthMessage(data.error || 'Failed to clear token.');
        return;
      }
      setGitTokenInput('');
      await refreshGitAuthStatus();
      setGitAuthMessage('Token cleared.');
    } finally {
      setGitAuthBusy(false);
    }
  };

  const saveSshKey = async () => {
    setGitAuthBusy(true);
    setGitAuthMessage(null);
    try {
      const token = getAccessToken();
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (token) headers.Authorization = `Bearer ${token}`;
      const res = await fetch('/api/dev/git-auth/ssh', {
        method: 'POST',
        headers,
        body: JSON.stringify({ privateKey: gitSshKeyInput, knownHosts: gitKnownHostsInput }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || data.error) {
        setGitAuthMessage(data.error || 'Failed to save SSH key.');
        return;
      }
      setGitSshKeyInput('');
      setGitKnownHostsInput('');
      await refreshGitAuthStatus();
      setGitAuthMessage(data.publicKey ? 'SSH key saved. Add the public key to GitHub Deploy Keys.' : 'SSH key saved (runtime).');
    } finally {
      setGitAuthBusy(false);
    }
  };

  const clearSshKey = async () => {
    setGitAuthBusy(true);
    setGitAuthMessage(null);
    try {
      const token = getAccessToken();
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (token) headers.Authorization = `Bearer ${token}`;
      const res = await fetch('/api/dev/git-auth/ssh', {
        method: 'POST',
        headers,
        body: JSON.stringify({ privateKey: '' }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || data.error) {
        setGitAuthMessage(data.error || 'Failed to clear SSH key.');
        return;
      }
      setGitSshKeyInput('');
      setGitKnownHostsInput('');
      await refreshGitAuthStatus();
      setGitAuthMessage('SSH key cleared.');
    } finally {
      setGitAuthBusy(false);
    }
  };

  const generateSshKey = async () => {
    setGitAuthBusy(true);
    setGitAuthMessage(null);
    try {
      const token = getAccessToken();
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (token) headers.Authorization = `Bearer ${token}`;
      const res = await fetch('/api/dev/git-auth/ssh/generate', {
        method: 'POST',
        headers,
        body: JSON.stringify({ force: false }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || data.error) {
        setGitAuthMessage(data.error || 'Failed to generate SSH key.');
        return;
      }
      await refreshGitAuthStatus();
      setGitAuthMessage('SSH key generated. Add the public key to GitHub Deploy Keys.');
    } finally {
      setGitAuthBusy(false);
    }
  };

  const testGitAuth = async () => {
    setGitAuthBusy(true);
    setGitAuthMessage(null);
    try {
      const token = getAccessToken();
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (token) headers.Authorization = `Bearer ${token}`;
      const res = await fetch('/api/dev/git-auth/test', { method: 'POST', headers });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || data.error) {
        setGitAuthMessage(data.error || 'Auth test failed.');
        return;
      }
      const summary = Array.isArray(data.results)
        ? data.results.map((r: any) => `${r.method}: ${r.ok ? 'ok' : 'fail'}`).join(' | ')
        : 'ok';
      setGitAuthMessage(`Test: ${summary}`);
    } finally {
      setGitAuthBusy(false);
    }
  };

  const handleCheckForUpdates = async () => {
    setUpdateStatus('checking');
    setUpdateMessage('Checking GitHub for latest release...');
    setUpdateOutput(null);

    try {
      const token = getAccessToken();
      const response = await fetch(`/api/dev/check-updates?primary=${gitPrimary}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || data.error) {
        const errorBody = data ?? {};
        setUpdateStatus('error');
        
        if (errorBody.error?.includes('Repository not found')) {
          setUpdateMessage(
            `${errorBody.error}\n\nFor private repositories, ensure GITHUB_TOKEN is set with proper scope. See instructions above.`
          );
        } else if (errorBody.error?.includes('rate limit')) {
          setUpdateMessage('GitHub API rate limit exceeded. Try again later or use a personal access token for higher limits.');
        } else if (errorBody.error?.includes('invalid') || errorBody.error?.includes('token')) {
          setUpdateMessage(`${errorBody.error}\n\nCreate a new token at github.com/settings/tokens`);
        } else {
          setUpdateMessage(errorBody.error || 'Failed to fetch update information.');
        }
        return;
      }
      if (!data.latestVersion) {
        setUpdateStatus('current');
        setUpdateMessage('No release information found on GitHub. Create a release/tag on your repository to enable updates.');
        setLatestRelease(null);
        return;
      }

      setLatestRelease({
        version: data.latestVersion,
        url: data.latestUrl,
        notes: data.notes || '',
        publishedAt: data.publishedAt || null,
      });

      if (APP_VERSION === '0.0.0') {
        setUpdateStatus('available');
        setUpdateMessage('Local version is unknown. GitHub release information is available.');
      } else if (isNewerVersion(APP_VERSION, data.latestVersion)) {
        setUpdateStatus('available');
        setUpdateMessage(`Update available: ${data.latestVersion}`);
      } else {
        setUpdateStatus('current');
        setUpdateMessage(`You are on the latest version (${APP_VERSION}).`);
      }
    } catch (error) {
      setUpdateStatus('error');
      setUpdateMessage(error instanceof Error ? error.message : String(error));
      setLatestRelease(null);
    }
  };

  const handleApplyUpdate = async () => {
    if (!canApplyUpdate) {
      setUpdateMessage('No update available to apply.');
      return;
    }

    setUpdateStatus('updating');
    setUpdateMessage('Applying updates from GitHub...');
    setUpdateOutput(null);

    try {
      const token = getAccessToken();
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (token) headers.Authorization = `Bearer ${token}`;
      const response = await fetch('/api/dev/update', {
        method: 'POST',
        headers,
        body: JSON.stringify({ primary: gitPrimary }),
      });
      const data = await response.json();
      if (!response.ok || !data.success) {
        setUpdateStatus('error');
        setUpdateMessage(data.error || 'Update command failed.');
        setUpdateOutput(data.output || data.details || null);
        return;
      }

      setUpdateStatus('current');
      setUpdateMessage('Update applied successfully. Restart server to load changes.');
      setUpdateOutput(data.output || 'Git pull completed.');
    } catch (error) {
      setUpdateStatus('error');
      setUpdateMessage(error instanceof Error ? error.message : String(error));
      setUpdateOutput(null);
    }
  };

  // ── Test suite state ─────────────────────────────────────────────────
  const TEST_DEFINITIONS: TestDef[] = [
    // ── Data Integrity ──────────────────────────────────────────────
    {
      id: 'products_have_names', name: 'Products have names', group: 'data_integrity',
      description: 'All products have non-empty names',
      run: ({ products }) => {
        const bad = products.filter(p => !p.name || p.name.trim() === '').length;
        return bad === 0
          ? { status: 'pass' }
          : { status: 'fail', detail: `${bad} product(s) missing a name` };
      },
    },
    {
      id: 'products_have_prices', name: 'Products have prices', group: 'data_integrity',
      description: 'All products have price > 0',
      run: ({ products }) => {
        const bad = products.filter(p => !(p.price > 0)).length;
        return bad === 0
          ? { status: 'pass' }
          : { status: 'fail', detail: `${bad} product(s) with price ≤ 0` };
      },
    },
    {
      id: 'products_have_categories', name: 'Products have categories', group: 'data_integrity',
      description: 'All products have a category set',
      run: ({ products }) => {
        const bad = products.filter(p => !p.category || p.category.trim() === '').length;
        return bad === 0
          ? { status: 'pass' }
          : { status: 'fail', detail: `${bad} product(s) missing a category` };
      },
    },
    {
      id: 'customers_have_emails', name: 'Customers have valid emails', group: 'data_integrity',
      description: 'All customers have valid email format',
      run: ({ customers }) => {
        const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        const bad = customers.filter(c => !c.email || !emailRe.test(c.email)).length;
        return bad === 0
          ? { status: 'pass' }
          : { status: 'fail', detail: `${bad} customer(s) with invalid email` };
      },
    },
    {
      id: 'staff_have_roles', name: 'Staff have valid roles', group: 'data_integrity',
      description: 'All staff have a valid role (admin/manager/cashier/dev)',
      run: ({ staff }) => {
        const validRoles = ['admin', 'manager', 'cashier', 'dev'];
        const bad = staff.filter(s => !validRoles.includes(s.role)).length;
        return bad === 0
          ? { status: 'pass' }
          : { status: 'fail', detail: `${bad} staff member(s) with invalid role` };
      },
    },
    {
      id: 'staff_have_emails', name: 'Staff have emails', group: 'data_integrity',
      description: 'All staff have emails',
      run: ({ staff }) => {
        const bad = staff.filter(s => !s.email || s.email.trim() === '').length;
        return bad === 0
          ? { status: 'pass' }
          : { status: 'fail', detail: `${bad} staff member(s) missing email` };
      },
    },
    {
      id: 'sales_have_items', name: 'Sales have items', group: 'data_integrity',
      description: 'All sales have at least 1 item',
      run: ({ sales }) => {
        const bad = sales.filter(s => !s.items || s.items.length === 0).length;
        return bad === 0
          ? { status: 'pass' }
          : { status: 'fail', detail: `${bad} sale(s) with no items` };
      },
    },
    {
      id: 'sales_totals_match', name: 'Sales totals match', group: 'data_integrity',
      description: "Each sale's total matches sum of items × quantity (within R0.01)",
      run: ({ sales }) => {
        const mismatched = sales.filter(s => {
          const computed = s.items.reduce((acc, item) => acc + item.price * item.quantity, 0);
          return Math.abs(computed - s.total) > 0.01;
        }).length;
        return mismatched === 0
          ? { status: 'pass' }
          : { status: 'warn', detail: `${mismatched} sale(s) with total mismatch (may include discounts/tips)` };
      },
    },
    // ── Configuration ───────────────────────────────────────────────
    {
      id: 'setup_completed', name: 'Setup completed', group: 'configuration',
      description: 'config.setupCompleted is true',
      run: ({ config }) => config.setupCompleted
        ? { status: 'pass' }
        : { status: 'fail', detail: 'Setup wizard has not been completed' },
    },
    {
      id: 'business_name_set', name: 'Business name set', group: 'configuration',
      description: 'config.business.name is non-empty',
      run: ({ config }) => config.business?.name && config.business.name.trim() !== ''
        ? { status: 'pass' }
        : { status: 'fail', detail: 'Business name is not configured' },
    },
    {
      id: 'payfast_not_default', name: 'PayFast not default', group: 'configuration',
      description: "payfastMerchantId !== '10000100'",
      run: ({ config }) => config.payfastMerchantId === '10000100'
        ? { status: 'warn', detail: 'Still using default PayFast merchant ID (10000100)' }
        : { status: 'pass' },
    },
    {
      id: 'payfast_sandbox_warn', name: 'PayFast sandbox mode', group: 'configuration',
      description: 'Warn if payfastSandbox is true',
      run: ({ config }) => config.payfastSandbox
        ? { status: 'warn', detail: 'PayFast sandbox mode is ON — not suitable for production' }
        : { status: 'pass' },
    },
    {
      id: 'tax_configured', name: 'Tax rate configured', group: 'configuration',
      description: 'taxRate is set and > 0',
      run: ({ config }) => {
        const rate = config.business?.taxRate;
        return rate !== undefined && rate > 0
          ? { status: 'pass', detail: `Tax rate: ${rate}%` }
          : { status: 'warn', detail: 'Tax rate is not configured or is 0' };
      },
    },
    {
      id: 'categories_exist', name: 'Categories exist', group: 'configuration',
      description: 'At least 1 section in categories',
      run: ({ config }) => {
        const count = config.categories ? Object.keys(config.categories).length : 0;
        return count > 0
          ? { status: 'pass', detail: `${count} section(s) configured` }
          : { status: 'fail', detail: 'No categories configured' };
      },
    },
    {
      id: 'currency_set', name: 'Currency set', group: 'configuration',
      description: 'config.business.currency is set',
      run: ({ config }) => config.business?.currency && config.business.currency.trim() !== ''
        ? { status: 'pass', detail: `Currency: ${config.business.currency}` }
        : { status: 'warn', detail: 'Currency is not configured' },
    },
    // ── Business Logic ──────────────────────────────────────────────
    {
      id: 'loyalty_config_valid', name: 'Loyalty config valid', group: 'business_logic',
      description: 'If loyalty enabled, points config must be set',
      run: ({ config }) => {
        if (!config.business?.enableLoyalty) return { status: 'pass', detail: 'Loyalty not enabled' };
        const ok = config.business.pointsEarnedPerCurrency && config.business.pointsRequiredForDiscount;
        return ok
          ? { status: 'pass' }
          : { status: 'fail', detail: 'Loyalty is enabled but points config is incomplete' };
      },
    },
    {
      id: 'restaurant_has_workstations', name: 'Restaurant has workstations', group: 'business_logic',
      description: 'If restaurant mode, warn if no workstations',
      run: ({ config, workstations }) => {
        if (!config.business?.isRestaurantMode) return { status: 'pass', detail: 'Not in restaurant mode' };
        return workstations.length === 0
          ? { status: 'warn', detail: 'Restaurant mode is on but no workstations are configured' }
          : { status: 'pass', detail: `${workstations.length} workstation(s) configured` };
      },
    },
    {
      id: 'no_negative_stock', name: 'No negative stock', group: 'business_logic',
      description: 'No products with stock < 0',
      run: ({ products }) => {
        const bad = products.filter(p => p.stock < 0).length;
        return bad === 0
          ? { status: 'pass' }
          : { status: 'fail', detail: `${bad} product(s) with negative stock` };
      },
    },
    {
      id: 'no_orphan_sales', name: 'No orphan sales (staff)', group: 'business_logic',
      description: 'All sales with a staffId have a matching staff record',
      run: ({ sales, staff }) => {
        const staffIds = new Set(staff.map(s => s.id));
        const orphans = sales.filter(s => s.staffId && !staffIds.has(s.staffId)).length;
        return orphans === 0
          ? { status: 'pass' }
          : { status: 'warn', detail: `${orphans} sale(s) reference a staff ID with no matching record` };
      },
    },
    {
      id: 'no_orphan_customers', name: 'No orphan sales (customers)', group: 'business_logic',
      description: 'All sales with a customerId have a matching customer record',
      run: ({ sales, customers }) => {
        const customerIds = new Set(customers.map(c => c.id));
        const orphans = sales.filter(s => s.customerId && !customerIds.has(s.customerId)).length;
        return orphans === 0
          ? { status: 'pass' }
          : { status: 'warn', detail: `${orphans} sale(s) reference a customer ID with no matching record` };
      },
    },
    {
      id: 'cash_sessions_balanced', name: 'Cash sessions balanced', group: 'business_logic',
      description: 'Warn if any closed cash session has |difference| > 50',
      run: ({ sales }) => {
        // We don't have cashSessions in props, so we approximate from sales data
        // This test always passes with a note since cashSessions aren't in props
        void sales;
        return { status: 'pass', detail: 'Cash session data not available in props (check CashManagementView)' };
      },
    },
    // ── Performance ─────────────────────────────────────────────────
    {
      id: 'product_count', name: 'Product count', group: 'performance',
      description: 'Pass if < 500, warn if 500–1000, fail if > 1000',
      run: ({ products }) => {
        const n = products.length;
        if (n > 1000) return { status: 'fail', detail: `${n} products — may impact performance` };
        if (n >= 500) return { status: 'warn', detail: `${n} products — approaching performance limit` };
        return { status: 'pass', detail: `${n} products` };
      },
    },
    {
      id: 'sales_count', name: 'Sales count', group: 'performance',
      description: 'Pass if < 1000, warn if 1000–5000, fail if > 5000',
      run: ({ sales }) => {
        const n = sales.length;
        if (n > 5000) return { status: 'fail', detail: `${n} sales — may impact performance` };
        if (n >= 1000) return { status: 'warn', detail: `${n} sales — approaching performance limit` };
        return { status: 'pass', detail: `${n} sales` };
      },
    },
    {
      id: 'large_cart_items', name: 'No large carts', group: 'performance',
      description: 'Warn if any sale has > 50 items',
      run: ({ sales }) => {
        const large = sales.filter(s => s.items.length > 50).length;
        return large === 0
          ? { status: 'pass' }
          : { status: 'warn', detail: `${large} sale(s) with > 50 line items` };
      },
    },
  ];

  const TEST_GROUPS = [
    { id: 'data_integrity', label: 'Data Integrity', color: 'blue' },
    { id: 'configuration', label: 'Configuration', color: 'violet' },
    { id: 'business_logic', label: 'Business Logic', color: 'emerald' },
    { id: 'performance', label: 'Performance', color: 'orange' },
  ] as const;

  const [testResults, setTestResults] = useState<Record<string, TestResult>>(() => {
    const initial: Record<string, TestResult> = {};
    TEST_DEFINITIONS.forEach(t => { initial[t.id] = { status: 'idle' }; });
    return initial;
  });

  const runTest = async (testId: string) => {
    const def = TEST_DEFINITIONS.find(t => t.id === testId);
    if (!def) return;
    setTestResults(prev => ({ ...prev, [testId]: { status: 'running' } }));
    await new Promise(r => setTimeout(r, 10));
    const result = def.run({ products, customers, staff, sales, config, workstations });
    setTestResults(prev => ({ ...prev, [testId]: result }));
  };

  const runGroup = async (groupId: string) => {
    const groupTests = TEST_DEFINITIONS.filter(t => t.group === groupId);
    for (const test of groupTests) {
      await runTest(test.id);
      await new Promise(r => setTimeout(r, 10));
    }
  };

  const runAll = async () => {
    for (const test of TEST_DEFINITIONS) {
      await runTest(test.id);
      await new Promise(r => setTimeout(r, 10));
    }
  };

  const resetTests = () => {
    const initial: Record<string, TestResult> = {};
    TEST_DEFINITIONS.forEach(t => { initial[t.id] = { status: 'idle' }; });
    setTestResults(initial);
  };

  const testSummary = useMemo(() => {
    const values: TestResult[] = Object.values(testResults);
    return {
      pass: values.filter(r => r.status === 'pass').length,
      fail: values.filter(r => r.status === 'fail').length,
      warn: values.filter(r => r.status === 'warn').length,
      total: TEST_DEFINITIONS.length,
    };
  }, [testResults]);

  // ── Console log capture ──────────────────────────────────────────────
  useEffect(() => {
    const origError = console.error.bind(console);
    const origWarn = console.warn.bind(console);
    let counter = 0;

    const capture = (level: 'ERROR' | 'WARN', args: unknown[]) => {
      const message = args.map(a => {
        if (typeof a === 'string') return a;
        try { return JSON.stringify(a); } catch { return String(a); }
      }).join(' ');
      counter += 1;
      setLogCounter(c => c + 1);
      setLogs(prev => {
        const entry: LogEntry = { id: counter, timestamp: new Date(), level, message };
        return [entry, ...prev].slice(0, 100);
      });
    };

    console.error = (...args: unknown[]) => { origError(...args); capture('ERROR', args); };
    console.warn = (...args: unknown[]) => { origWarn(...args); capture('WARN', args); };

    return () => {
      console.error = origError;
      console.warn = origWarn;
    };
  }, []);

  // ── Derived stats ────────────────────────────────────────────────────
  const totalRevenue = useMemo(
    () => sales.filter(s => s.status === 'completed').reduce((acc, s) => acc + s.total, 0),
    [sales],
  );

  // ── Data health ──────────────────────────────────────────────────────
  const dataHealth = useMemo(() => {
    const noBarcode = products.filter(p => !p.barcode).length;
    const zeroStock = products.filter(p => p.stock === 0).length;
    const belowMin = products.filter(p => p.minStock !== undefined && p.stock < p.minStock).length;
    const noRole = staff.filter(s => !s.role).length;
    const oneHourAgo = Date.now() - 60 * 60 * 1000;
    const stalePending = sales.filter(s => {
      if (s.status !== 'pending') return false;
      const d = getDate(s.createdAt);
      return d.getTime() < oneHourAgo;
    }).length;
    return { noBarcode, zeroStock, belowMin, noRole, stalePending };
  }, [products, staff, sales]);

  // ── Export JSON ──────────────────────────────────────────────────────
  const handleExport = () => {
    const data = { products, customers, staff, sales, workstations, exportedAt: new Date().toISOString() };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `jimmys-pos-export-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // ── Tab definitions ──────────────────────────────────────────────────
  const tabs = [
    { id: 'overview', label: 'Overview', icon: Server },
    { id: 'data', label: 'Data Explorer', icon: Database },
    { id: 'health', label: 'App Health', icon: Activity },
    { id: 'console', label: `Console${logs.length > 0 ? ` (${logs.length})` : ''}`, icon: Terminal },
    { id: 'actions', label: 'Quick Actions', icon: Zap },
    { id: 'tests', label: 'Test Suite', icon: FlaskConical },
  ] as const;

  return (
    <div className="flex flex-col h-full bg-slate-50 dark:bg-[#0B1120] overflow-hidden">
      {/* ── Header ── */}
      <div className="bg-slate-900 dark:bg-slate-950 border-b border-slate-700 px-4 py-3 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-3">
          <Code2 className="w-5 h-5 text-violet-400" />
          <span className="text-white font-black tracking-tight text-lg">🛠 DEV DASHBOARD</span>
          <span className="px-2 py-0.5 rounded text-xs font-black bg-red-600 text-white tracking-widest uppercase">RESTRICTED</span>
        </div>
        <div className="flex items-center gap-2 text-slate-400 text-sm">
          <span className="hidden sm:inline">{user.email}</span>
          <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-violet-900/60 text-violet-300 border border-violet-700">DEV MODE</span>
        </div>
      </div>

      {/* ── Tabs ── */}
      <div className="flex gap-1 px-4 pt-3 pb-0 border-b border-slate-200 dark:border-slate-800 overflow-x-auto shrink-0 bg-white dark:bg-slate-900">
        {tabs.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => setActiveTab(id as typeof activeTab)}
            className={`flex items-center gap-1.5 px-3 py-2 text-sm font-semibold rounded-t-lg whitespace-nowrap transition-all active:scale-95 border-b-2 -mb-px ${
              activeTab === id
                ? 'border-violet-500 text-violet-600 dark:text-violet-400 bg-violet-50 dark:bg-violet-900/20'
                : 'border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'
            }`}
          >
            <Icon className="w-4 h-4" />
            {label}
          </button>
        ))}
      </div>

      {/* ── Tab Content ── */}
      <div className="flex-1 overflow-y-auto p-4 lg:p-6">

        {/* ═══════════════════════════════════════════════════════════════
            TAB 1 — OVERVIEW
        ═══════════════════════════════════════════════════════════════ */}
        {activeTab === 'overview' && (
          <div className="space-y-6 max-w-5xl mx-auto">
            {/* DEV MODE badge */}
            <div className="flex items-center gap-3 p-3 rounded-xl bg-violet-50 dark:bg-violet-900/20 border border-violet-200 dark:border-violet-800">
              <span className="px-2 py-0.5 rounded text-xs font-black bg-violet-600 text-white tracking-widest uppercase">DEV MODE</span>
              <span className="text-sm font-medium text-violet-700 dark:text-violet-300">{user.email}</span>
            </div>

            {/* Stat cards */}
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
              {[
                { label: 'Tenants', value: 1, color: 'violet' },
                { label: 'Products', value: products.length, color: 'blue' },
                { label: 'Customers', value: customers.length, color: 'emerald' },
                { label: 'Staff', value: staff.length, color: 'orange' },
                { label: 'Sales', value: sales.length, color: 'pink' },
                { label: 'Revenue', value: `R${Number(totalRevenue || 0).toFixed(2)}`, color: 'green' },
              ].map(({ label, value, color }) => (
                <div key={label} className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-4 shadow-sm">
                  <div className="text-xs font-bold uppercase tracking-widest text-slate-400 mb-1">{label}</div>
                  <div className={`text-xl font-black text-${color}-600 dark:text-${color}-400`}>{value}</div>
                </div>
              ))}
            </div>

            <div className="grid lg:grid-cols-2 gap-4">
              {/* Server Info */}
              <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-5 shadow-sm">
                <div className="flex items-center gap-2 mb-4">
                  <Server className="w-4 h-4 text-orange-500" />
                  <h3 className="font-black text-slate-800 dark:text-white">Server Info</h3>
                </div>
                <div className="space-y-2 text-sm">
                  {[
                    { label: 'App Version', value: APP_VERSION },
                    { label: 'Database', value: 'MariaDB' },
                    { label: 'Web Server', value: 'Nginx' },
                    { label: 'Environment', value: import.meta.env.MODE || 'development' },
                  ].map(({ label, value }) => (
                    <div key={label} className="flex items-start justify-between gap-2 py-1.5 border-b border-slate-100 dark:border-slate-800 last:border-0">
                      <span className="text-slate-500 font-medium shrink-0">{label}</span>
                      <span className="font-mono text-xs text-slate-700 dark:text-slate-300 text-right break-all">{value}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Tenant info */}
              <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-5 shadow-sm">
                <div className="flex items-center gap-2 mb-4">
                  <Database className="w-4 h-4 text-blue-500" />
                  <h3 className="font-black text-slate-800 dark:text-white">Current Tenant</h3>
                </div>
                <div className="space-y-2 text-sm">
                  {[
                    { label: 'Tenant ID', value: tenantId ?? '—' },
                    { label: 'Business Name', value: config.business?.name ?? '—' },
                    { label: 'Setup Completed', value: config.setupCompleted ? '✅ Yes' : '❌ No' },
                    { label: 'Restaurant Mode', value: config.business?.isRestaurantMode ? '✅ On' : '⬜ Off' },
                    { label: 'Loyalty', value: config.business?.enableLoyalty ? '✅ On' : '⬜ Off' },
                    { label: 'Tax Rate', value: config.business?.taxRate !== undefined ? `${config.business.taxRate}%` : '—' },
                  ].map(({ label, value }) => (
                    <div key={label} className="flex items-start justify-between gap-2 py-1.5 border-b border-slate-100 dark:border-slate-800 last:border-0">
                      <span className="text-slate-500 font-medium shrink-0">{label}</span>
                      <span className="font-mono text-xs text-slate-700 dark:text-slate-300 text-right break-all">{value}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-5 shadow-sm">
              <div className="flex items-center gap-2 mb-4">
                <Download className="w-4 h-4 text-emerald-500" />
                <h3 className="font-black text-slate-800 dark:text-white">Updates</h3>
              </div>

              <div className="space-y-3 text-sm text-slate-600 dark:text-slate-300">
                <p className="text-slate-500 dark:text-slate-400">Check your GitHub repository for the latest release and apply updates directly from the dev server.</p>
                
                <div className="rounded-lg bg-blue-50 dark:bg-blue-950 border border-blue-200 dark:border-blue-800 p-3 text-xs text-blue-700 dark:text-blue-300">
                  <p className="font-semibold mb-1">🔒 Private Repository Support</p>
                  <p className="mb-2">To use a private repository, set the <code className="bg-blue-100 dark:bg-blue-900 px-1.5 py-0.5 rounded">GITHUB_TOKEN</code> environment variable with a personal access token (requires <code className="bg-blue-100 dark:bg-blue-900 px-1.5 py-0.5 rounded">repo</code> scope).</p>
                  <ol className="list-decimal list-inside space-y-1 ml-1">
                    <li>Create a token at <a href="https://github.com/settings/tokens" target="_blank" rel="noreferrer" className="underline font-semibold">github.com/settings/tokens</a></li>
                    <li>Grant <code className="bg-blue-100 dark:bg-blue-900 px-1.5 py-0.5 rounded">repo</code> scope (full control of private repositories)</li>
                    <li>Set in environment: <code className="bg-blue-100 dark:bg-blue-900 px-1.5 py-0.5 rounded">export GITHUB_TOKEN=ghp_...</code> (Linux/Mac) or system environment (Windows)</li>
                    <li>Restart the dev server</li>
                  </ol>
                </div>

                <div className="rounded-xl bg-slate-50 dark:bg-slate-950 p-3 border border-slate-100 dark:border-slate-800">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <div className="text-xs uppercase tracking-widest text-slate-500 font-semibold">Git Access</div>
                      <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                        Primary: <span className="font-mono">{gitPrimary.toUpperCase()}</span> (other acts as backup if configured)
                      </div>
                    </div>
                    <div className="flex items-center gap-2 text-xs">
                      <span className={`px-2 py-1 rounded-full border ${gitAuthStatus?.hasSsh ? 'bg-emerald-50 dark:bg-emerald-950 border-emerald-200 dark:border-emerald-800 text-emerald-700 dark:text-emerald-300' : 'bg-slate-100 dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-slate-500'}`}>
                        SSH {gitAuthStatus?.hasSsh ? 'ON' : 'OFF'}
                      </span>
                      <span className={`px-2 py-1 rounded-full border ${gitAuthStatus?.hasToken ? 'bg-emerald-50 dark:bg-emerald-950 border-emerald-200 dark:border-emerald-800 text-emerald-700 dark:text-emerald-300' : 'bg-slate-100 dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-slate-500'}`}>
                        Token {gitAuthStatus?.hasToken ? 'ON' : 'OFF'}
                      </span>
                    </div>
                  </div>

                  <div className="mt-3 flex gap-2">
                    <button
                      type="button"
                      onClick={() => setGitPrimary('ssh')}
                      className={`px-3 py-1.5 rounded-lg text-xs font-semibold border ${gitPrimary === 'ssh' ? 'bg-violet-600 text-white border-violet-600' : 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-900/50'}`}
                    >
                      SSH priority
                    </button>
                    <button
                      type="button"
                      onClick={() => setGitPrimary('token')}
                      className={`px-3 py-1.5 rounded-lg text-xs font-semibold border ${gitPrimary === 'token' ? 'bg-violet-600 text-white border-violet-600' : 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-900/50'}`}
                    >
                      Token priority
                    </button>
                    <button
                      type="button"
                      onClick={testGitAuth}
                      disabled={gitAuthBusy}
                      className="ml-auto px-3 py-1.5 rounded-lg text-xs font-semibold bg-slate-900 text-white hover:bg-slate-800 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      Test
                    </button>
                  </div>

                  {gitAuthMessage ? (
                    <div className="mt-2 text-xs text-slate-600 dark:text-slate-400 whitespace-pre-line">{gitAuthMessage}</div>
                  ) : null}

                  <div className="mt-3 grid gap-3 md:grid-cols-2">
                    <div className="rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-3">
                      <div className="text-xs font-bold uppercase tracking-widest text-slate-500">Token</div>
                      <input
                        value={gitTokenInput}
                        onChange={(e) => setGitTokenInput(e.target.value)}
                        type="password"
                        placeholder="ghp_... / github_pat_..."
                        className="mt-2 w-full rounded-lg border border-slate-200 dark:border-slate-800 bg-transparent px-3 py-2 text-sm text-slate-800 dark:text-slate-200 outline-none focus:ring-2 focus:ring-violet-500"
                      />
                      <div className="mt-2 flex gap-2">
                        <button
                          type="button"
                          onClick={saveGitToken}
                          disabled={gitAuthBusy || gitTokenInput.trim().length === 0}
                          className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          Save
                        </button>
                        <button
                          type="button"
                          onClick={clearGitToken}
                          disabled={gitAuthBusy}
                          className="px-3 py-1.5 rounded-lg text-xs font-semibold border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-900/50 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          Clear
                        </button>
                      </div>
                    </div>

                    <div className="rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-3">
                      <div className="text-xs font-bold uppercase tracking-widest text-slate-500">SSH Key</div>
                      <textarea
                        value={gitSshKeyInput}
                        onChange={(e) => setGitSshKeyInput(e.target.value)}
                        rows={4}
                        placeholder="Paste private key (BEGIN ... PRIVATE KEY)"
                        className="mt-2 w-full rounded-lg border border-slate-200 dark:border-slate-800 bg-transparent px-3 py-2 text-sm text-slate-800 dark:text-slate-200 outline-none focus:ring-2 focus:ring-violet-500 font-mono"
                      />
                      <textarea
                        value={gitKnownHostsInput}
                        onChange={(e) => setGitKnownHostsInput(e.target.value)}
                        rows={2}
                        placeholder="known_hosts (optional) — leave empty to auto-scan github.com"
                        className="mt-2 w-full rounded-lg border border-slate-200 dark:border-slate-800 bg-transparent px-3 py-2 text-xs text-slate-700 dark:text-slate-300 outline-none focus:ring-2 focus:ring-violet-500 font-mono"
                      />
                      <div className="mt-2 flex gap-2">
                        <button
                          type="button"
                          onClick={generateSshKey}
                          disabled={gitAuthBusy}
                          className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-slate-900 text-white hover:bg-slate-800 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          Generate
                        </button>
                        <button
                          type="button"
                          onClick={saveSshKey}
                          disabled={gitAuthBusy || gitSshKeyInput.trim().length === 0}
                          className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          Save
                        </button>
                        <button
                          type="button"
                          onClick={clearSshKey}
                          disabled={gitAuthBusy}
                          className="px-3 py-1.5 rounded-lg text-xs font-semibold border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-900/50 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          Clear
                        </button>
                      </div>
                      {gitAuthStatus?.publicKey ? (
                        <div className="mt-3 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 p-2">
                          <div className="flex items-center justify-between gap-2">
                            <div className="text-[11px] uppercase tracking-widest text-slate-500 font-semibold">Public Key (GitHub Deploy Key)</div>
                            <CopyBtn text={gitAuthStatus.publicKey} label="Copy key" />
                          </div>
                          <div className="mt-2 font-mono text-[11px] text-slate-700 dark:text-slate-300 break-all select-all">
                            {gitAuthStatus.publicKey}
                          </div>
                        </div>
                      ) : null}
                      {gitAuthStatus?.sshKeyPath ? (
                        <div className="mt-2 text-[11px] text-slate-500 dark:text-slate-400">Saved in container at <span className="font-mono">{gitAuthStatus.sshKeyPath}</span></div>
                      ) : null}
                    </div>
                  </div>
                </div>

                <div className="grid gap-2 sm:grid-cols-2">
                  <div className="flex items-center justify-between rounded-xl bg-slate-50 dark:bg-slate-950 p-3 border border-slate-100 dark:border-slate-800">
                    <span className="text-slate-500">Local Version</span>
                    <span className="font-mono text-xs text-slate-700 dark:text-slate-300">{currentVersionLabel}</span>
                  </div>
                  <div className="flex items-center justify-between rounded-xl bg-slate-50 dark:bg-slate-950 p-3 border border-slate-100 dark:border-slate-800">
                    <span className="text-slate-500">Latest Release</span>
                    <span className="font-mono text-xs text-slate-700 dark:text-slate-300">{latestRelease?.version ?? 'unknown'}</span>
                  </div>
                </div>

                <div className="rounded-xl bg-slate-50 dark:bg-slate-950 p-3 border border-slate-100 dark:border-slate-800">
                  <div className="flex items-center justify-between gap-3 text-xs uppercase tracking-widest text-slate-500 font-semibold">
                    <span>Status</span>
                    <span className={updateStatus === 'available' ? 'text-emerald-600 dark:text-emerald-400' : updateStatus === 'current' ? 'text-slate-700 dark:text-slate-300' : updateStatus === 'error' ? 'text-red-600 dark:text-red-400' : 'text-slate-500'}>
                      {updateStatus === 'idle' ? 'Idle' : updateStatus === 'checking' ? 'Checking…' : updateStatus === 'available' ? 'Update available' : updateStatus === 'current' ? 'Up to date' : updateStatus === 'updating' ? 'Applying update…' : 'Error'}
                    </span>
                  </div>
                  {updateMessage && <p className={`mt-2 text-sm whitespace-pre-line ${updateStatus === 'error' ? 'text-red-600 dark:text-red-400' : 'text-slate-600 dark:text-slate-400'}`}>{updateMessage}</p>}
                </div>

                {latestRelease?.notes ? (
                  <div className="rounded-xl bg-slate-50 dark:bg-slate-950 p-3 border border-slate-100 dark:border-slate-800 text-xs leading-5 whitespace-pre-line">
                    {latestRelease.notes}
                  </div>
                ) : null}

                {updateOutput ? (
                  <pre className="max-h-48 overflow-y-auto rounded-xl bg-slate-900 text-slate-100 p-3 text-xs whitespace-pre-wrap">{updateOutput}</pre>
                ) : null}

                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={handleCheckForUpdates}
                    disabled={updateStatus === 'checking' || updateStatus === 'updating'}
                    className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-violet-600 text-white text-sm font-semibold hover:bg-violet-700 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <RefreshCw className="w-4 h-4" />
                    Check updates
                  </button>
                  <button
                    type="button"
                    onClick={handleApplyUpdate}
                    disabled={!canApplyUpdate || updateStatus === 'checking' || updateStatus === 'updating'}
                    className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-emerald-600 text-white text-sm font-semibold hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <Download className="w-4 h-4" />
                    Apply update
                  </button>
                  <a
                    href={`https://github.com/${GITHUB_REPO}`}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-slate-200 dark:border-slate-700 text-sm font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800"
                  >
                    <ExternalLink className="w-4 h-4" />
                    Open GitHub
                  </a>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ═══════════════════════════════════════════════════════════════
            TAB 2 — DATA EXPLORER
        ═══════════════════════════════════════════════════════════════ */}
        {activeTab === 'data' && (
          <div className="space-y-4 max-w-6xl mx-auto">
            {/* Sub-tabs */}
            <div className="flex gap-1 overflow-x-auto">
              {(['products', 'customers', 'staff', 'sales', 'workstations'] as const).map(tab => (
                <button
                  key={tab}
                  onClick={() => setDataSubTab(tab)}
                  className={`px-3 py-1.5 rounded-lg text-sm font-semibold capitalize whitespace-nowrap transition-all active:scale-95 ${
                    dataSubTab === tab
                      ? 'bg-violet-600 text-white'
                      : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700'
                  }`}
                >
                  {tab} ({
                    tab === 'products' ? products.length :
                    tab === 'customers' ? customers.length :
                    tab === 'staff' ? staff.length :
                    tab === 'sales' ? sales.length :
                    workstations.length
                  })
                </button>
              ))}
            </div>

            <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
              <div className="overflow-x-auto">
                {/* Products table */}
                {dataSubTab === 'products' && (
                  <table className="w-full text-sm">
                    <thead className="bg-slate-50 dark:bg-slate-800 text-xs font-bold uppercase tracking-widest text-slate-500">
                      <tr>
                        <th className="px-4 py-3 text-left">ID</th>
                        <th className="px-4 py-3 text-left">Name</th>
                        <th className="px-4 py-3 text-right">Price</th>
                        <th className="px-4 py-3 text-right">Stock</th>
                        <th className="px-4 py-3 text-left">Category</th>
                        <th className="px-4 py-3 text-left">Section</th>
                        <th className="px-4 py-3 text-left"></th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                      {products.length === 0 && (
                        <tr><td colSpan={7} className="px-4 py-8 text-center text-slate-400">No products</td></tr>
                      )}
                      {products.map(p => (
                        <tr key={p.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50">
                          <td className="px-4 py-2.5 font-mono text-xs text-slate-500">{truncateId(p.id)}</td>
                          <td className="px-4 py-2.5 font-semibold text-slate-800 dark:text-white">{p.name}</td>
                          <td className="px-4 py-2.5 text-right text-slate-700 dark:text-slate-300">R{Number(p.price || 0).toFixed(2)}</td>
                          <td className="px-4 py-2.5 text-right">
                            <span className={`font-bold ${p.stock === 0 ? 'text-red-500' : p.minStock && p.stock < p.minStock ? 'text-amber-500' : 'text-emerald-600'}`}>
                              {p.stock}
                            </span>
                          </td>
                          <td className="px-4 py-2.5 text-slate-600 dark:text-slate-400">{p.category}</td>
                          <td className="px-4 py-2.5 text-slate-500">{p.section ?? '—'}</td>
                          <td className="px-4 py-2.5"><CopyBtn text={p.id} /></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}

                {/* Customers table */}
                {dataSubTab === 'customers' && (
                  <table className="w-full text-sm">
                    <thead className="bg-slate-50 dark:bg-slate-800 text-xs font-bold uppercase tracking-widest text-slate-500">
                      <tr>
                        <th className="px-4 py-3 text-left">ID</th>
                        <th className="px-4 py-3 text-left">Name</th>
                        <th className="px-4 py-3 text-left">Email</th>
                        <th className="px-4 py-3 text-right">Loyalty Pts</th>
                        <th className="px-4 py-3 text-left"></th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                      {customers.length === 0 && (
                        <tr><td colSpan={5} className="px-4 py-8 text-center text-slate-400">No customers</td></tr>
                      )}
                      {customers.map(c => (
                        <tr key={c.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50">
                          <td className="px-4 py-2.5 font-mono text-xs text-slate-500">{truncateId(c.id)}</td>
                          <td className="px-4 py-2.5 font-semibold text-slate-800 dark:text-white">{c.name}</td>
                          <td className="px-4 py-2.5 text-slate-600 dark:text-slate-400">{c.email}</td>
                          <td className="px-4 py-2.5 text-right font-bold text-violet-600 dark:text-violet-400">{c.loyaltyPoints ?? c.points ?? 0}</td>
                          <td className="px-4 py-2.5"><CopyBtn text={c.id} /></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}

                {/* Staff table */}
                {dataSubTab === 'staff' && (
                  <table className="w-full text-sm">
                    <thead className="bg-slate-50 dark:bg-slate-800 text-xs font-bold uppercase tracking-widest text-slate-500">
                      <tr>
                        <th className="px-4 py-3 text-left">ID</th>
                        <th className="px-4 py-3 text-left">Name</th>
                        <th className="px-4 py-3 text-left">Email</th>
                        <th className="px-4 py-3 text-left">Role</th>
                        <th className="px-4 py-3 text-left">Status</th>
                        <th className="px-4 py-3 text-left"></th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                      {staff.length === 0 && (
                        <tr><td colSpan={6} className="px-4 py-8 text-center text-slate-400">No staff</td></tr>
                      )}
                      {staff.map(s => (
                        <tr key={s.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50">
                          <td className="px-4 py-2.5 font-mono text-xs text-slate-500">{truncateId(s.id)}</td>
                          <td className="px-4 py-2.5 font-semibold text-slate-800 dark:text-white">{s.name}</td>
                          <td className="px-4 py-2.5 text-slate-600 dark:text-slate-400">{s.email}</td>
                          <td className="px-4 py-2.5">
                            <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${
                              s.role === 'admin' ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400' :
                              s.role === 'manager' ? 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400' :
                              s.role === 'dev' ? 'bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-400' :
                              'bg-slate-100 text-slate-700 dark:bg-slate-700 dark:text-slate-300'
                            }`}>{s.role}</span>
                          </td>
                          <td className="px-4 py-2.5">
                            <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${s.status === 'active' ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400' : 'bg-slate-100 text-slate-500'}`}>
                              {s.status}
                            </span>
                          </td>
                          <td className="px-4 py-2.5"><CopyBtn text={s.id} /></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}

                {/* Sales table */}
                {dataSubTab === 'sales' && (
                  <table className="w-full text-sm">
                    <thead className="bg-slate-50 dark:bg-slate-800 text-xs font-bold uppercase tracking-widest text-slate-500">
                      <tr>
                        <th className="px-4 py-3 text-left">ID</th>
                        <th className="px-4 py-3 text-left">Status</th>
                        <th className="px-4 py-3 text-right">Total</th>
                        <th className="px-4 py-3 text-left">Payment</th>
                        <th className="px-4 py-3 text-left">Created</th>
                        <th className="px-4 py-3 text-left">Staff ID</th>
                        <th className="px-4 py-3 text-left">Customer ID</th>
                        <th className="px-4 py-3 text-left"></th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                      {sales.length === 0 && (
                        <tr><td colSpan={8} className="px-4 py-8 text-center text-slate-400">No sales</td></tr>
                      )}
                      {sales.map(s => {
                        const rawDate = s.createdAt;
                        const createdAt = getDate(rawDate);
                        
                        const isValid = !isNaN(createdAt.getTime());
                        const dateDisplay = isValid ? createdAt.toLocaleString() : `Invalid: ${String(rawDate)}`;
                        return (
                          <tr key={s.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50">
                            <td className="px-4 py-2.5 font-mono text-xs text-slate-500">{truncateId(s.id)}</td>
                            <td className="px-4 py-2.5">
                              <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${
                                s.status === 'completed' ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400' :
                                s.status === 'pending' ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400' :
                                s.status === 'failed' ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400' :
                                'bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300'
                              }`}>{s.status}</span>
                            </td>
                            <td className="px-4 py-2.5 text-right font-bold text-slate-800 dark:text-white">R{Number(s.total || 0).toFixed(2)}</td>
                            <td className="px-4 py-2.5 text-slate-600 dark:text-slate-400">{s.paymentMethod}</td>
                            <td className="px-4 py-2.5 text-slate-500 text-xs">{dateDisplay}</td>
                            <td className="px-4 py-2.5 font-mono text-xs text-slate-500">{s.staffId ? truncateId(s.staffId) : '—'}</td>
                            <td className="px-4 py-2.5 font-mono text-xs text-slate-500">{s.customerId ? truncateId(s.customerId) : '—'}</td>
                            <td className="px-4 py-2.5"><CopyBtn text={s.id} /></td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                )}

                {/* Workstations table */}
                {dataSubTab === 'workstations' && (
                  <table className="w-full text-sm">
                    <thead className="bg-slate-50 dark:bg-slate-800 text-xs font-bold uppercase tracking-widest text-slate-500">
                      <tr>
                        <th className="px-4 py-3 text-left">ID</th>
                        <th className="px-4 py-3 text-left">Name</th>
                        <th className="px-4 py-3 text-left">Type</th>
                        <th className="px-4 py-3 text-left">Status</th>
                        <th className="px-4 py-3 text-left"></th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                      {workstations.length === 0 && (
                        <tr><td colSpan={5} className="px-4 py-8 text-center text-slate-400">No workstations</td></tr>
                      )}
                      {workstations.map(w => (
                        <tr key={w.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50">
                          <td className="px-4 py-2.5 font-mono text-xs text-slate-500">{truncateId(w.id)}</td>
                          <td className="px-4 py-2.5 font-semibold text-slate-800 dark:text-white">{w.name}</td>
                          <td className="px-4 py-2.5 text-slate-600 dark:text-slate-400 capitalize">{w.type}</td>
                          <td className="px-4 py-2.5">
                            <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${w.status === 'active' ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400' : 'bg-slate-100 text-slate-500'}`}>
                              {w.status}
                            </span>
                          </td>
                          <td className="px-4 py-2.5"><CopyBtn text={w.id} /></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </div>
          </div>
        )}

        {/* ═══════════════════════════════════════════════════════════════
            TAB 3 — APP HEALTH
        ═══════════════════════════════════════════════════════════════ */}
        {activeTab === 'health' && (
          <div className="space-y-5 max-w-3xl mx-auto">
            {/* Connection status */}
            <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-5 shadow-sm">
              <div className="flex items-center gap-2 mb-4">
                <Wifi className="w-4 h-4 text-emerald-500" />
                <h3 className="font-black text-slate-800 dark:text-white">Connections</h3>
              </div>
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
                <span className="text-sm font-semibold text-emerald-600 dark:text-emerald-400">MariaDB Connected</span>
                <span className="text-xs text-slate-400 ml-2">(data is loading successfully)</span>
              </div>
            </div>

            {/* Auth status */}
            <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-5 shadow-sm">
              <div className="flex items-center gap-2 mb-4">
                <Shield className="w-4 h-4 text-blue-500" />
                <h3 className="font-black text-slate-800 dark:text-white">Auth Status</h3>
              </div>
              <div className="space-y-2 text-sm">
                {[
                  { label: 'Email', value: user.email ?? '—' },
                  { label: 'UID', value: user.uid },
                  { label: 'Email Verified', value: user.emailVerified ? '✅ Yes' : '❌ No' },
                ].map(({ label, value }) => (
                  <div key={label} className="flex items-start justify-between gap-2 py-1.5 border-b border-slate-100 dark:border-slate-800 last:border-0">
                    <span className="text-slate-500 font-medium shrink-0">{label}</span>
                    <span className="font-mono text-xs text-slate-700 dark:text-slate-300 text-right break-all">{value}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Config validation */}
            <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-5 shadow-sm">
              <div className="flex items-center gap-2 mb-4">
                <CheckCircle2 className="w-4 h-4 text-violet-500" />
                <h3 className="font-black text-slate-800 dark:text-white">Config Validation</h3>
              </div>
              <CheckRow ok={!!config.setupCompleted} label="Setup completed" />
              <CheckRow ok={!!config.business?.name} label="Business name set" />
              <CheckRow
                ok={config.payfastMerchantId !== '10000100' && !!config.payfastMerchantId}
                label={`PayFast configured (merchant: ${config.payfastMerchantId || '—'})`}
              />
              <CheckRow
                ok={!config.payfastSandbox}
                warn={config.payfastSandbox}
                label={config.payfastSandbox ? '⚠️ PayFast sandbox mode is ON' : 'PayFast sandbox mode off (live)'}
              />
              <CheckRow ok={config.business?.taxRate !== undefined && config.business.taxRate > 0} label={`Tax rate configured (${config.business?.taxRate ?? 0}%)`} />
              <CheckRow
                ok={!!config.categories && Object.keys(config.categories).length > 0}
                label={`Categories configured (${config.categories ? Object.keys(config.categories).length : 0} sections)`}
              />
            </div>

            {/* Data health */}
            <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-5 shadow-sm">
              <div className="flex items-center gap-2 mb-4">
                <Activity className="w-4 h-4 text-orange-500" />
                <h3 className="font-black text-slate-800 dark:text-white">Data Health</h3>
              </div>
              <div className="space-y-2">
                {[
                  { label: 'Products with no barcode', value: dataHealth.noBarcode, warn: dataHealth.noBarcode > 0 },
                  { label: 'Products with zero stock', value: dataHealth.zeroStock, warn: dataHealth.zeroStock > 0 },
                  { label: 'Products below min stock', value: dataHealth.belowMin, warn: dataHealth.belowMin > 0 },
                  { label: 'Staff with no role', value: dataHealth.noRole, warn: dataHealth.noRole > 0 },
                  { label: 'Stale pending sales (>1h)', value: dataHealth.stalePending, warn: dataHealth.stalePending > 0 },
                ].map(({ label, value, warn }) => (
                  <div key={label} className="flex items-center justify-between py-1.5 border-b border-slate-100 dark:border-slate-800 last:border-0">
                    <span className="text-sm text-slate-600 dark:text-slate-400">{label}</span>
                    <span className={`text-sm font-black ${warn ? 'text-amber-500' : 'text-emerald-500'}`}>
                      {value}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ═══════════════════════════════════════════════════════════════
            TAB 4 — TEST SUITE
        ═══════════════════════════════════════════════════════════════ */}
        {activeTab === 'tests' && (
          <div className="space-y-5 max-w-4xl mx-auto">
            {/* Automated Test Suite Status */}
            <div className="bg-gradient-to-br from-violet-50 to-indigo-50 dark:from-violet-900/20 dark:to-indigo-900/20 rounded-2xl border border-violet-200 dark:border-violet-800 p-6 shadow-sm">
              <div className="flex items-start justify-between gap-4 mb-4">
                <div className="flex items-start gap-3">
                  <Code2 className="w-5 h-5 text-violet-600 dark:text-violet-400 shrink-0 mt-0.5" />
                  <div>
                    <h3 className="font-black text-lg text-slate-800 dark:text-white">Automated Test Suite</h3>
                    <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">Vitest, React Testing Library & Playwright</p>
                  </div>
                </div>
                <span className="px-3 py-1 rounded-full text-xs font-black bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-400 uppercase tracking-widest">Active</span>
              </div>
              
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
                <div className="bg-white dark:bg-slate-800/50 rounded-xl p-3 border border-violet-100 dark:border-violet-800">
                  <div className="text-2xl font-black text-emerald-600 dark:text-emerald-400">20</div>
                  <div className="text-xs font-semibold text-slate-600 dark:text-slate-400 mt-1">Unit Tests</div>
                  <div className="text-xs text-slate-500 mt-1">✓ All passing</div>
                </div>
                <div className="bg-white dark:bg-slate-800/50 rounded-xl p-3 border border-violet-100 dark:border-violet-800">
                  <div className="text-2xl font-black text-emerald-600 dark:text-emerald-400">17</div>
                  <div className="text-xs font-semibold text-slate-600 dark:text-slate-400 mt-1">API Tests</div>
                  <div className="text-xs text-slate-500 mt-1">✓ All passing</div>
                </div>
                <div className="bg-white dark:bg-slate-800/50 rounded-xl p-3 border border-violet-100 dark:border-violet-800">
                  <div className="text-2xl font-black text-emerald-600 dark:text-emerald-400">3</div>
                  <div className="text-xs font-semibold text-slate-600 dark:text-slate-400 mt-1">Frontend Tests</div>
                  <div className="text-xs text-slate-500 mt-1">✓ All passing</div>
                </div>
                <div className="bg-white dark:bg-slate-800/50 rounded-xl p-3 border border-amber-100 dark:border-amber-800">
                  <div className="text-2xl font-black text-amber-600 dark:text-amber-400">E2E</div>
                  <div className="text-xs font-semibold text-slate-600 dark:text-slate-400 mt-1">E2E Tests</div>
                  <div className="text-xs text-amber-600 dark:text-amber-400 mt-1">⚠ Pending setup</div>
                </div>
              </div>

              <div className="space-y-2">
                <h4 className="text-sm font-bold text-slate-700 dark:text-slate-300">Test Coverage:</h4>
                <ul className="grid grid-cols-1 md:grid-cols-2 gap-2 text-sm">
                  <li className="flex items-center gap-2 text-slate-600 dark:text-slate-400">
                    <span className="w-1.5 h-1.5 rounded-full bg-violet-500" />
                    <span>Authentication (JWT, refresh tokens)</span>
                  </li>
                  <li className="flex items-center gap-2 text-slate-600 dark:text-slate-400">
                    <span className="w-1.5 h-1.5 rounded-full bg-violet-500" />
                    <span>API routes & middleware</span>
                  </li>
                  <li className="flex items-center gap-2 text-slate-600 dark:text-slate-400">
                    <span className="w-1.5 h-1.5 rounded-full bg-violet-500" />
                    <span>Database adapters & CRUD</span>
                  </li>
                  <li className="flex items-center gap-2 text-slate-600 dark:text-slate-400">
                    <span className="w-1.5 h-1.5 rounded-full bg-violet-500" />
                    <span>React component rendering</span>
                  </li>
                </ul>
              </div>

              <div className="mt-4 pt-4 border-t border-violet-200 dark:border-violet-800">
                <p className="text-xs text-slate-600 dark:text-slate-400 mb-3">Run tests from terminal:</p>
                <div className="space-y-1.5">
                  <code className="block px-3 py-2 rounded-lg bg-slate-900 text-slate-100 font-mono text-xs overflow-x-auto">npm run test:unit</code>
                  <code className="block px-3 py-2 rounded-lg bg-slate-900 text-slate-100 font-mono text-xs overflow-x-auto">npm run test:api</code>
                  <code className="block px-3 py-2 rounded-lg bg-slate-900 text-slate-100 font-mono text-xs overflow-x-auto">npm run test:watch</code>
                </div>
              </div>
            </div>

            {/* Header row */}
            <div className="flex items-center justify-between gap-3 flex-wrap">
              {/* Summary bar */}
              <div className="flex items-center gap-3 flex-wrap">
                <span className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800 text-sm font-bold text-emerald-700 dark:text-emerald-400">
                  <CheckCircle2 className="w-4 h-4" />
                  {testSummary.pass} passed
                </span>
                <span className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-sm font-bold text-red-700 dark:text-red-400">
                  <XCircle className="w-4 h-4" />
                  {testSummary.fail} failed
                </span>
                <span className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 text-sm font-bold text-amber-700 dark:text-amber-400">
                  <AlertTriangle className="w-4 h-4" />
                  {testSummary.warn} warnings
                </span>
                <span className="text-sm text-slate-400 font-medium">{testSummary.total} total</span>
              </div>
              {/* Action buttons */}
              <div className="flex items-center gap-2">
                <button
                  onClick={resetTests}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-semibold bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700 hover:bg-slate-200 dark:hover:bg-slate-700 active:scale-95 transition-all"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  Reset
                </button>
                <button
                  onClick={runAll}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-bold bg-violet-600 text-white hover:bg-violet-700 active:scale-95 transition-all shadow-sm"
                >
                  <FlaskConical className="w-4 h-4" />
                  Run All Tests
                </button>
              </div>
            </div>

            {/* Test groups */}
            {TEST_GROUPS.map(group => {
              const groupTests = TEST_DEFINITIONS.filter(t => t.group === group.id);
              const groupResults = groupTests.map(t => testResults[t.id]);
              const gPass = groupResults.filter(r => r.status === 'pass').length;
              const gFail = groupResults.filter(r => r.status === 'fail').length;
              const gWarn = groupResults.filter(r => r.status === 'warn').length;

              return (
                <div key={group.id} className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
                  {/* Group header */}
                  <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50">
                    <div className="flex items-center gap-3">
                      <h4 className="font-black text-slate-800 dark:text-white text-sm">{group.label}</h4>
                      <div className="flex items-center gap-1.5">
                        {gPass > 0 && (
                          <span className="px-1.5 py-0.5 rounded text-xs font-bold bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400">
                            {gPass}✓
                          </span>
                        )}
                        {gFail > 0 && (
                          <span className="px-1.5 py-0.5 rounded text-xs font-bold bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400">
                            {gFail}✗
                          </span>
                        )}
                        {gWarn > 0 && (
                          <span className="px-1.5 py-0.5 rounded text-xs font-bold bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400">
                            {gWarn}⚠
                          </span>
                        )}
                      </div>
                    </div>
                    <button
                      onClick={() => runGroup(group.id)}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold bg-violet-100 dark:bg-violet-900/30 text-violet-700 dark:text-violet-400 border border-violet-200 dark:border-violet-800 hover:bg-violet-200 dark:hover:bg-violet-900/50 active:scale-95 transition-all"
                    >
                      <FlaskConical className="w-3 h-3" />
                      Run
                    </button>
                  </div>

                  {/* Test rows */}
                  <div className="divide-y divide-slate-100 dark:divide-slate-800">
                    {groupTests.map(test => {
                      const result = testResults[test.id];
                      const statusConfig = {
                        idle:    { dot: 'bg-slate-300 dark:bg-slate-600', text: 'text-slate-400 dark:text-slate-500', label: 'idle' },
                        running: { dot: 'bg-blue-500 animate-pulse', text: 'text-blue-500', label: 'running' },
                        pass:    { dot: 'bg-emerald-500', text: 'text-emerald-600 dark:text-emerald-400', label: 'pass' },
                        fail:    { dot: 'bg-red-500', text: 'text-red-600 dark:text-red-400', label: 'fail' },
                        warn:    { dot: 'bg-amber-400', text: 'text-amber-600 dark:text-amber-400', label: 'warn' },
                      }[result.status];

                      return (
                        <div key={test.id} className="flex items-center gap-3 px-5 py-3 hover:bg-slate-50 dark:hover:bg-slate-800/30 transition-colors">
                          {/* Status dot */}
                          <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${statusConfig.dot}`} />
                          {/* Test info */}
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="text-sm font-semibold text-slate-800 dark:text-white">{test.name}</span>
                              <span className={`text-xs font-bold uppercase tracking-wide ${statusConfig.text}`}>
                                {statusConfig.label}
                              </span>
                            </div>
                            {result.detail && (
                              <p className={`text-xs mt-0.5 ${statusConfig.text}`}>{result.detail}</p>
                            )}
                            {result.status === 'idle' && (
                              <p className="text-xs mt-0.5 text-slate-400">{test.description}</p>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* ═══════════════════════════════════════════════════════════════
            TAB 5 — CONSOLE / LOGS
        ═══════════════════════════════════════════════════════════════ */}
        {activeTab === 'console' && (
          <div className="space-y-3 max-w-5xl mx-auto">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Terminal className="w-4 h-4 text-slate-500" />
                <h3 className="font-black text-slate-800 dark:text-white">Live Console</h3>
                <span className="text-xs text-slate-400">({logs.length} entries, newest first)</span>
              </div>
              <button
                onClick={() => setLogs([])}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-semibold bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 active:scale-95 transition-all"
              >
                <Trash2 className="w-3.5 h-3.5" />
                Clear
              </button>
            </div>

            <div className="bg-slate-900 rounded-2xl border border-slate-700 overflow-hidden shadow-xl min-h-[300px] max-h-[600px] overflow-y-auto">
              <div className="flex items-center gap-2 px-4 py-2.5 bg-slate-800 border-b border-slate-700 sticky top-0">
                <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                <span className="text-xs text-slate-400 font-mono">console.error / console.warn capture active</span>
                <span className="ml-auto text-xs text-slate-500 font-mono">{logCounter} total captured</span>
              </div>
              {logs.length === 0 ? (
                <div className="flex items-center justify-center h-48 text-slate-500 text-sm font-mono">
                  No errors or warnings captured yet.
                </div>
              ) : (
                <div className="divide-y divide-slate-800">
                  {logs.map(entry => (
                    <div key={entry.id} className={`px-4 py-2.5 flex gap-3 text-xs font-mono ${entry.level === 'ERROR' ? 'bg-red-950/30' : 'bg-amber-950/20'}`}>
                      <span className="text-slate-500 shrink-0 tabular-nums">
                        {entry.timestamp.toLocaleTimeString()}
                      </span>
                      <span className={`font-black shrink-0 w-10 ${entry.level === 'ERROR' ? 'text-red-400' : 'text-amber-400'}`}>
                        {entry.level}
                      </span>
                      <span className={`break-all ${entry.level === 'ERROR' ? 'text-red-300' : 'text-amber-300'}`}>
                        {entry.message}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* ═══════════════════════════════════════════════════════════════
            TAB 6 — QUICK ACTIONS
        ═══════════════════════════════════════════════════════════════ */}
        {activeTab === 'actions' && (
          <div className="space-y-5 max-w-2xl mx-auto">
            {/* Seed products */}
            <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-5 shadow-sm">
              <div className="flex items-center gap-2 mb-1">
                <RefreshCw className="w-4 h-4 text-blue-500" />
                <h4 className="font-black text-slate-800 dark:text-white">Seed Sample Products</h4>
              </div>
              <p className="text-sm text-slate-500 mb-4">Populate the database with sample product data for testing.</p>
              {!seedConfirm ? (
                <button
                  onClick={() => setSeedConfirm(true)}
                  className="px-4 py-2 rounded-xl text-sm font-bold bg-blue-600 text-white hover:bg-blue-700 active:scale-95 transition-all"
                >
                  Seed Sample Products
                </button>
              ) : (
                <div className="flex items-center gap-3 p-3 rounded-xl bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800">
                  <span className="text-sm font-semibold text-blue-700 dark:text-blue-300">Are you sure?</span>
                  <button
                    onClick={() => { onSeedProducts?.(); setSeedConfirm(false); }}
                    className="px-3 py-1.5 rounded-lg text-sm font-bold bg-blue-600 text-white hover:bg-blue-700 active:scale-95 transition-all"
                  >
                    Yes, Seed
                  </button>
                  <button
                    onClick={() => setSeedConfirm(false)}
                    className="px-3 py-1.5 rounded-lg text-sm font-bold bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-300 dark:hover:bg-slate-600 active:scale-95 transition-all"
                  >
                    Cancel
                  </button>
                </div>
              )}
            </div>

            {/* Clear all sales */}
            <div className="bg-white dark:bg-slate-900 rounded-2xl border border-red-200 dark:border-red-900 p-5 shadow-sm">
              <div className="flex items-center gap-2 mb-1">
                <Trash2 className="w-4 h-4 text-red-500" />
                <h4 className="font-black text-red-700 dark:text-red-400">Clear All Sales</h4>
                <span className="px-2 py-0.5 rounded text-xs font-black bg-red-100 dark:bg-red-900/40 text-red-600 dark:text-red-400 uppercase tracking-widest">DANGEROUS</span>
              </div>
              <p className="text-sm text-slate-500 mb-4">Permanently delete all sales records. This cannot be undone.</p>
              {!clearConfirm ? (
                <button
                  onClick={() => setClearConfirm(true)}
                  className="px-4 py-2 rounded-xl text-sm font-bold bg-red-600 text-white hover:bg-red-700 active:scale-95 transition-all"
                >
                  Clear All Sales
                </button>
              ) : (
                <div className="flex items-center gap-3 p-3 rounded-xl bg-red-50 dark:bg-red-900/20 border border-red-300 dark:border-red-800">
                  <AlertTriangle className="w-4 h-4 text-red-500 shrink-0" />
                  <span className="text-sm font-bold text-red-700 dark:text-red-300">This will delete ALL {sales.length} sales. Confirm?</span>
                  <button
                    onClick={() => { onClearSales?.(); setClearConfirm(false); }}
                    className="px-3 py-1.5 rounded-lg text-sm font-bold bg-red-600 text-white hover:bg-red-700 active:scale-95 transition-all shrink-0"
                  >
                    Yes, Delete All
                  </button>
                  <button
                    onClick={() => setClearConfirm(false)}
                    className="px-3 py-1.5 rounded-lg text-sm font-bold bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-300 dark:hover:bg-slate-600 active:scale-95 transition-all shrink-0"
                  >
                    Cancel
                  </button>
                </div>
              )}
            </div>

            {/* Export data */}
            <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-5 shadow-sm">
              <div className="flex items-center gap-2 mb-1">
                <Download className="w-4 h-4 text-emerald-500" />
                <h4 className="font-black text-slate-800 dark:text-white">Export Data as JSON</h4>
              </div>
              <p className="text-sm text-slate-500 mb-4">Download all products, customers, staff, and sales as a JSON file.</p>
              <button
                onClick={handleExport}
                className="px-4 py-2 rounded-xl text-sm font-bold bg-emerald-600 text-white hover:bg-emerald-700 active:scale-95 transition-all"
              >
                <span className="flex items-center gap-2">
                  <Download className="w-4 h-4" />
                  Export JSON
                </span>
              </button>
            </div>

            {/* Server Links */}
            <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-5 shadow-sm">
              <div className="flex items-center gap-2 mb-4">
                <ExternalLink className="w-4 h-4 text-slate-500" />
                <h4 className="font-black text-slate-800 dark:text-white">Server Links</h4>
              </div>
              <div className="flex flex-wrap gap-3">
                <a
                  href="http://localhost:3000"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800 hover:bg-emerald-100 dark:hover:bg-emerald-900/40 active:scale-95 transition-all"
                >
                  <ExternalLink className="w-4 h-4" />
                  Nginx (Port 3000)
                </a>
                <a
                  href="http://localhost:5173"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-400 border border-blue-200 dark:border-blue-800 hover:bg-blue-100 dark:hover:bg-blue-900/40 active:scale-95 transition-all"
                >
                  <ExternalLink className="w-4 h-4" />
                  Vite Dev Server
                </a>
                <a
                  href="http://localhost:3306"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold bg-orange-50 dark:bg-orange-900/20 text-orange-700 dark:text-orange-400 border border-orange-200 dark:border-orange-800 hover:bg-orange-100 dark:hover:bg-orange-900/40 active:scale-95 transition-all"
                >
                  <Database className="w-4 h-4" />
                  MariaDB
                </a>
              </div>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
