import React from 'react';
import { Cable, CheckCircle2, Loader2, Plus, RadioTower, Trash2, Wrench } from 'lucide-react';
import type { HardwareConnectionType, HardwareDevice, HardwareDeviceEvent, HardwareDeviceType, Workstation } from '../types';
import { createHardwareDevice, deleteHardwareDevice, getHardwareDevices, getHardwareEvents, testHardwareDevice, updateHardwareDevice } from '../api';

const DEVICE_OPTIONS: Array<{ id: HardwareDeviceType; label: string; defaultConnection: HardwareConnectionType }> = [
  { id: 'receipt_printer', label: 'Receipt printer', defaultConnection: 'browser_print' },
  { id: 'kitchen_printer', label: 'Kitchen printer', defaultConnection: 'escpos_network' },
  { id: 'cash_drawer', label: 'Cash drawer', defaultConnection: 'escpos_usb' },
  { id: 'scale', label: 'Scale', defaultConnection: 'webserial' },
  { id: 'barcode_scanner', label: 'Barcode scanner', defaultConnection: 'keyboard_wedge' },
  { id: 'pole_display', label: 'Pole display', defaultConnection: 'webhid' },
  { id: 'card_terminal', label: 'Card terminal', defaultConnection: 'payment_provider' },
];

const CONNECTION_OPTIONS: Array<{ id: HardwareConnectionType; label: string }> = [
  { id: 'browser_print', label: 'Browser print' },
  { id: 'escpos_network', label: 'ESC/POS network' },
  { id: 'escpos_usb', label: 'ESC/POS USB' },
  { id: 'serial', label: 'Server serial' },
  { id: 'webserial', label: 'Browser Web Serial' },
  { id: 'webhid', label: 'Browser WebHID' },
  { id: 'keyboard_wedge', label: 'Keyboard wedge' },
  { id: 'local_bridge', label: 'Local bridge' },
  { id: 'payment_provider', label: 'Payment provider' },
];

function defaultName(type: HardwareDeviceType) {
  return DEVICE_OPTIONS.find(option => option.id === type)?.label || 'Hardware device';
}

function defaultConnection(type: HardwareDeviceType): HardwareConnectionType {
  return DEVICE_OPTIONS.find(option => option.id === type)?.defaultConnection || 'local_bridge';
}

function formatDate(value: any) {
  if (!value) return 'Never';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleString();
}

function parseConfig(text: string) {
  const trimmed = text.trim();
  if (!trimmed) return {};
  return JSON.parse(trimmed);
}

function safeParseConfig(text: string) {
  try {
    return parseConfig(text);
  } catch {
    return {};
  }
}

function defaultConfig(connectionType: HardwareConnectionType) {
  if (connectionType === 'escpos_network') return { port: 9100 };
  if (connectionType === 'local_bridge') return { bridgeUrl: '' };
  if (connectionType === 'payment_provider') return { provider: '', providerDeviceId: '' };
  if (connectionType === 'webserial' || connectionType === 'serial') return { baudRate: 9600, protocol: 'nci' };
  if (connectionType === 'browser_print') return { paperWidth: '80mm' };
  return {};
}

function configPlaceholder(connectionType: HardwareConnectionType) {
  if (connectionType === 'escpos_network') return '{ "host": "192.168.0.50", "port": 9100 }';
  if (connectionType === 'local_bridge') return '{ "bridgeUrl": "http://127.0.0.1:4777" }';
  if (connectionType === 'payment_provider') return '{ "provider": "yoco", "providerDeviceId": "front-terminal" }';
  if (connectionType === 'webserial' || connectionType === 'serial') return '{ "baudRate": 9600, "protocol": "nci" }';
  return '{}';
}

type Draft = {
  id?: string;
  name: string;
  deviceType: HardwareDeviceType;
  connectionType: HardwareConnectionType;
  status: 'active' | 'inactive';
  workstationId: string;
  isDefault: boolean;
  connectionConfigText: string;
};

function newDraft(type: HardwareDeviceType = 'receipt_printer'): Draft {
  const connectionType = defaultConnection(type);
  return {
    name: defaultName(type),
    deviceType: type,
    connectionType,
    status: 'active',
    workstationId: '',
    isDefault: type === 'receipt_printer',
    connectionConfigText: JSON.stringify(defaultConfig(connectionType), null, 2),
  };
}

function deviceToDraft(device: HardwareDevice): Draft {
  return {
    id: device.id,
    name: device.name,
    deviceType: device.deviceType,
    connectionType: device.connectionType,
    status: device.status,
    workstationId: device.workstationId || '',
    isDefault: device.isDefault,
    connectionConfigText: JSON.stringify(device.connectionConfig || {}, null, 2),
  };
}

export function HardwareAdaptersPanel({ tenantId, workstations }: { tenantId?: string | null; workstations: Workstation[] }) {
  const [devices, setDevices] = React.useState<HardwareDevice[]>([]);
  const [events, setEvents] = React.useState<HardwareDeviceEvent[]>([]);
  const [draft, setDraft] = React.useState<Draft>(() => newDraft());
  const [loading, setLoading] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const [testingId, setTestingId] = React.useState<string | null>(null);
  const [message, setMessage] = React.useState<{ tone: 'success' | 'error'; text: string } | null>(null);

  const loadHardware = React.useCallback(async () => {
    if (!tenantId) return;
    setLoading(true);
    try {
      const [deviceRows, eventRows] = await Promise.all([
        getHardwareDevices(tenantId),
        getHardwareEvents(tenantId, 8),
      ]);
      setDevices(deviceRows);
      setEvents(eventRows);
    } catch (err: any) {
      setMessage({ tone: 'error', text: err?.message || 'Unable to load hardware adapters.' });
    } finally {
      setLoading(false);
    }
  }, [tenantId]);

  React.useEffect(() => {
    void loadHardware();
  }, [loadHardware]);

  const updateDeviceType = (type: HardwareDeviceType) => {
    const connectionType = defaultConnection(type);
    setDraft(current => ({
      ...current,
      name: current.id ? current.name : defaultName(type),
      deviceType: type,
      connectionType,
      isDefault: type === 'receipt_printer' || type === 'kitchen_printer',
      connectionConfigText: JSON.stringify(defaultConfig(connectionType), null, 2),
    }));
  };

  const updateConnectionType = (connectionType: HardwareConnectionType) => {
    setDraft(current => ({
      ...current,
      connectionType,
      connectionConfigText: JSON.stringify(defaultConfig(connectionType), null, 2),
    }));
  };

  const draftConfig = React.useMemo(() => safeParseConfig(draft.connectionConfigText), [draft.connectionConfigText]);
  const setConfigValue = (key: string, value: string, numeric = false) => {
    setDraft(current => {
      const config = safeParseConfig(current.connectionConfigText);
      if (value.trim() === '') {
        delete config[key];
      } else if (numeric) {
        const numberValue = Number(value);
        if (Number.isFinite(numberValue)) config[key] = numberValue;
      } else {
        config[key] = value;
      }
      return { ...current, connectionConfigText: JSON.stringify(config, null, 2) };
    });
  };
  const configValue = (key: string) => draftConfig?.[key] === undefined || draftConfig?.[key] === null ? '' : String(draftConfig[key]);
  const configInputClass = 'h-12 rounded-2xl border border-slate-200 bg-slate-50 px-4 text-sm font-bold outline-none dark:border-slate-800 dark:bg-slate-950 dark:text-white';

  const saveDevice = async () => {
    if (!tenantId) return;
    setSaving(true);
    setMessage(null);
    try {
      const payload = {
        name: draft.name.trim(),
        deviceType: draft.deviceType,
        connectionType: draft.connectionType,
        status: draft.status,
        workstationId: draft.workstationId || null,
        isDefault: draft.isDefault,
        connectionConfig: parseConfig(draft.connectionConfigText),
      };
      if (draft.id) {
        await updateHardwareDevice(tenantId, draft.id, payload);
      } else {
        await createHardwareDevice(tenantId, payload);
      }
      setDraft(newDraft());
      await loadHardware();
      setMessage({ tone: 'success', text: 'Hardware adapter saved.' });
    } catch (err: any) {
      setMessage({ tone: 'error', text: err?.message || 'Hardware adapter could not be saved.' });
    } finally {
      setSaving(false);
    }
  };

  const testDevice = async (device: HardwareDevice) => {
    if (!tenantId) return;
    setTestingId(device.id);
    setMessage(null);
    try {
      const result = await testHardwareDevice(tenantId, device.id, {
        sale: { id: 'TEST', total: 42.5, tableNumber: 'T1' },
        items: [{ name: 'Test item', quantity: 1, price: 42.5 }],
        total: 42.5,
        lines: ['Jimmy POS', 'Hardware ready'],
      });
      await loadHardware();
      setMessage({ tone: result.ready ? 'success' : 'error', text: result.message });
    } catch (err: any) {
      setMessage({ tone: 'error', text: err?.message || 'Hardware test failed.' });
    } finally {
      setTestingId(null);
    }
  };

  const removeDevice = async (device: HardwareDevice) => {
    if (!tenantId || !window.confirm(`Delete ${device.name}?`)) return;
    try {
      await deleteHardwareDevice(tenantId, device.id);
      await loadHardware();
    } catch (err: any) {
      setMessage({ tone: 'error', text: err?.message || 'Unable to delete hardware adapter.' });
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h3 className="font-black text-slate-900 dark:text-white">Hardware adapters</h3>
          <p className="mt-1 text-xs font-semibold text-slate-500">ESC/POS printers, cash drawers, scales, scanners, pole displays, and card terminals.</p>
        </div>
        <button
          type="button"
          onClick={() => void loadHardware()}
          disabled={loading}
          className="inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-slate-100 px-4 text-xs font-black uppercase tracking-widest text-slate-700 disabled:opacity-50 dark:bg-slate-800 dark:text-slate-100"
        >
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RadioTower className="h-4 w-4" />}
          Refresh
        </button>
      </div>

      {message && (
        <div className={`rounded-2xl border px-4 py-3 text-sm font-bold ${
          message.tone === 'success'
            ? 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900/60 dark:bg-emerald-950/30 dark:text-emerald-300'
            : 'border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-900/60 dark:bg-rose-950/30 dark:text-rose-300'
        }`}>
          {message.text}
        </div>
      )}

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_420px]">
        <div className="space-y-3">
          {devices.map(device => (
            <div key={device.id} className="rounded-2xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-950">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <Cable className="h-4 w-4 text-primary" />
                    <h4 className="truncate text-sm font-black text-slate-900 dark:text-white">{device.name}</h4>
                    <span className="rounded-full bg-white px-2 py-1 text-[10px] font-black uppercase tracking-widest text-slate-500 dark:bg-slate-900 dark:text-slate-300">
                      {device.deviceType.replace(/_/g, ' ')}
                    </span>
                    {device.isDefault && (
                      <span className="rounded-full bg-primary/10 px-2 py-1 text-[10px] font-black uppercase tracking-widest text-primary">Default</span>
                    )}
                  </div>
                  <p className="mt-2 text-xs font-bold text-slate-500">
                    {device.connectionType.replace(/_/g, ' ')}
                    {device.workstationId ? ` - ${workstations.find(ws => ws.id === device.workstationId)?.name || device.workstationId}` : ''}
                  </p>
                  <p className="mt-1 text-[11px] font-bold text-slate-400">
                    Last check: {formatDate(device.lastCheckedAt)} {device.lastCheckMessage ? `- ${device.lastCheckMessage}` : ''}
                  </p>
                </div>
                <div className="flex shrink-0 flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => setDraft(deviceToDraft(device))}
                    className="h-10 rounded-xl bg-white px-4 text-xs font-black uppercase tracking-widest text-slate-700 dark:bg-slate-900 dark:text-slate-100"
                  >
                    Edit
                  </button>
                  <button
                    type="button"
                    onClick={() => void testDevice(device)}
                    disabled={testingId === device.id}
                    className="inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-primary px-4 text-xs font-black uppercase tracking-widest text-white disabled:opacity-50"
                  >
                    {testingId === device.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                    Test
                  </button>
                  <button
                    type="button"
                    onClick={() => void removeDevice(device)}
                    className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-rose-50 text-rose-600 dark:bg-rose-950/40 dark:text-rose-300"
                    aria-label={`Delete ${device.name}`}
                    title={`Delete ${device.name}`}
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
            </div>
          ))}
          {devices.length === 0 && (
            <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-8 text-center text-sm font-bold text-slate-400 dark:border-slate-700 dark:bg-slate-950">
              No hardware adapters configured yet.
            </div>
          )}
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
          <div className="flex items-center justify-between gap-3">
            <h4 className="text-sm font-black text-slate-900 dark:text-white">{draft.id ? 'Edit adapter' : 'Add adapter'}</h4>
            {draft.id && (
              <button type="button" onClick={() => setDraft(newDraft())} className="text-xs font-black uppercase tracking-widest text-primary">
                New
              </button>
            )}
          </div>
          <div className="mt-4 space-y-3">
            <input
              value={draft.name}
              onChange={event => setDraft(current => ({ ...current, name: event.target.value }))}
              className="h-12 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 text-sm font-bold outline-none dark:border-slate-800 dark:bg-slate-950 dark:text-white"
              placeholder="Device name"
            />
            <div className="grid gap-3 sm:grid-cols-2">
              <select
                value={draft.deviceType}
                onChange={event => updateDeviceType(event.target.value as HardwareDeviceType)}
                className="h-12 rounded-2xl border border-slate-200 bg-slate-50 px-4 text-sm font-bold outline-none dark:border-slate-800 dark:bg-slate-950 dark:text-white"
              >
                {DEVICE_OPTIONS.map(option => <option key={option.id} value={option.id}>{option.label}</option>)}
              </select>
              <select
                value={draft.connectionType}
                onChange={event => updateConnectionType(event.target.value as HardwareConnectionType)}
                className="h-12 rounded-2xl border border-slate-200 bg-slate-50 px-4 text-sm font-bold outline-none dark:border-slate-800 dark:bg-slate-950 dark:text-white"
              >
                {CONNECTION_OPTIONS.map(option => <option key={option.id} value={option.id}>{option.label}</option>)}
              </select>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <select
                value={draft.workstationId}
                onChange={event => setDraft(current => ({ ...current, workstationId: event.target.value }))}
                className="h-12 rounded-2xl border border-slate-200 bg-slate-50 px-4 text-sm font-bold outline-none dark:border-slate-800 dark:bg-slate-950 dark:text-white"
              >
                <option value="">Any workstation</option>
                {workstations.map(ws => <option key={ws.id} value={ws.id}>{ws.name}</option>)}
              </select>
              <select
                value={draft.status}
                onChange={event => setDraft(current => ({ ...current, status: event.target.value as Draft['status'] }))}
                className="h-12 rounded-2xl border border-slate-200 bg-slate-50 px-4 text-sm font-bold outline-none dark:border-slate-800 dark:bg-slate-950 dark:text-white"
              >
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
              </select>
            </div>
            <label className="flex items-center gap-2 rounded-2xl bg-slate-50 px-4 py-3 text-xs font-black uppercase tracking-widest text-slate-500 dark:bg-slate-950">
              <input
                type="checkbox"
                checked={draft.isDefault}
                onChange={event => setDraft(current => ({ ...current, isDefault: event.target.checked }))}
                className="h-4 w-4 accent-primary"
              />
              Default for this hardware type
            </label>
            {draft.connectionType === 'escpos_network' && (
              <div className="grid gap-3 sm:grid-cols-2">
                <input
                  value={configValue('host')}
                  onChange={event => setConfigValue('host', event.target.value)}
                  className={configInputClass}
                  placeholder="Printer IP address"
                />
                <input
                  value={configValue('port')}
                  onChange={event => setConfigValue('port', event.target.value, true)}
                  className={configInputClass}
                  placeholder="Port, usually 9100"
                  inputMode="numeric"
                />
              </div>
            )}
            {draft.connectionType === 'local_bridge' && (
              <input
                value={configValue('bridgeUrl')}
                onChange={event => setConfigValue('bridgeUrl', event.target.value)}
                className={configInputClass}
                placeholder="Local bridge URL"
              />
            )}
            {draft.connectionType === 'payment_provider' && (
              <div className="grid gap-3 sm:grid-cols-2">
                <input
                  value={configValue('provider')}
                  onChange={event => setConfigValue('provider', event.target.value)}
                  className={configInputClass}
                  placeholder="Provider"
                />
                <input
                  value={configValue('providerDeviceId')}
                  onChange={event => setConfigValue('providerDeviceId', event.target.value)}
                  className={configInputClass}
                  placeholder="Provider device ID"
                />
                <input
                  value={configValue('terminalId')}
                  onChange={event => setConfigValue('terminalId', event.target.value)}
                  className={`${configInputClass} sm:col-span-2`}
                  placeholder="Terminal ID"
                />
              </div>
            )}
            {(draft.connectionType === 'serial' || draft.connectionType === 'webserial') && (
              <div className="grid gap-3 sm:grid-cols-3">
                <input
                  value={configValue('baudRate')}
                  onChange={event => setConfigValue('baudRate', event.target.value, true)}
                  className={configInputClass}
                  placeholder="Baud rate"
                  inputMode="numeric"
                />
                <input
                  value={configValue('protocol')}
                  onChange={event => setConfigValue('protocol', event.target.value)}
                  className={configInputClass}
                  placeholder="Scale protocol"
                />
                <input
                  value={configValue('unit')}
                  onChange={event => setConfigValue('unit', event.target.value)}
                  className={configInputClass}
                  placeholder="Unit"
                />
              </div>
            )}
            {(draft.connectionType === 'escpos_usb' || draft.connectionType === 'webhid') && (
              <div className="grid gap-3 sm:grid-cols-2">
                <input
                  value={configValue('vendorId')}
                  onChange={event => setConfigValue('vendorId', event.target.value)}
                  className={configInputClass}
                  placeholder="Vendor ID"
                />
                <input
                  value={configValue('productId')}
                  onChange={event => setConfigValue('productId', event.target.value)}
                  className={configInputClass}
                  placeholder="Product ID"
                />
              </div>
            )}
            {draft.connectionType === 'browser_print' && (
              <input
                value={configValue('paperWidth')}
                onChange={event => setConfigValue('paperWidth', event.target.value)}
                className={configInputClass}
                placeholder="Paper width"
              />
            )}
            <textarea
              value={draft.connectionConfigText}
              onChange={event => setDraft(current => ({ ...current, connectionConfigText: event.target.value }))}
              rows={5}
              className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 font-mono text-xs outline-none dark:border-slate-800 dark:bg-slate-950 dark:text-white"
              placeholder={configPlaceholder(draft.connectionType)}
            />
            <button
              type="button"
              onClick={() => void saveDevice()}
              disabled={saving}
              className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-2xl bg-primary text-sm font-black uppercase tracking-widest text-white disabled:opacity-50"
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
              Save adapter
            </button>
          </div>
        </div>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-950">
        <div className="mb-3 flex items-center gap-2 text-xs font-black uppercase tracking-widest text-slate-500">
          <Wrench className="h-4 w-4" />
          Recent hardware events
        </div>
        <div className="space-y-2">
          {events.map(event => (
            <div key={event.id} className="flex flex-col gap-1 rounded-xl bg-white px-4 py-3 text-sm dark:bg-slate-900 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <span className="font-black text-slate-900 dark:text-white">{event.commandType.replace(/_/g, ' ')}</span>
                <span className="ml-2 text-xs font-bold text-slate-400">{formatDate(event.createdAt)}</span>
              </div>
              <span className={`text-xs font-black uppercase tracking-widest ${
                event.status === 'failed' ? 'text-rose-500' : event.status === 'skipped' ? 'text-amber-500' : 'text-emerald-500'
              }`}>
                {event.status}
              </span>
            </div>
          ))}
          {events.length === 0 && <div className="text-center text-sm font-bold text-slate-400">No hardware events yet.</div>}
        </div>
      </div>
    </div>
  );
}
