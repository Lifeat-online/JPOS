import { usePosStore } from '../store/usePosStore';
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { AppConfig, Workstation, TableSection, RestaurantTable } from '../types';
import { Save, Store, CreditCard, Layers, Plus, Trash2, X, Receipt, Calculator, Award, Settings2, ChefHat, Loader2, PackageCheck, BrainCircuit, Paperclip, Send, Smartphone, Printer, Eye, RotateCcw, Upload, Clock } from 'lucide-react';
import { DEFAULT_CATEGORY_TREE } from '../constants';
import { apiGet, apiPut, apiPost, apiDelete, assignCompanionDevice, getCompanionDeviceAssignments, getTenantPackageLimits, getAiSettings, listAiModels, revokeCompanionDeviceAssignment, testAiProvider, updateAiSettings, uploadTenantLogo, type TenantPackageLimitsResponse } from '../api';
import { JPOS_PACKAGES } from '../../shared/packageCatalog';
import type { AiModelOption, AiProviderName, AiRole, AiSettings } from '../types';
import { buildReceiptPrintCss, getReceiptPaperProfile, RECEIPT_PAPER_OPTIONS, normalizeReceiptPrintSettings } from '../utils/receiptPrinting';

function readSettingsFileAsDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export function SettingsView({ config, setConfig }: { config: AppConfig, setConfig: (c: AppConfig) => void }) {
  const tenantId = usePosStore(state => state.tenantId);
  const currentUserStaff = usePosStore(state => state.currentUserStaff);
  const [formData, setFormData] = useState<AppConfig>({
    ...config,
    categories: config.categories || DEFAULT_CATEGORY_TREE
  });
  const [isSaving, setIsSaving] = useState(false);
  const [activeTab, setActiveTab] = useState<'business' | 'package' | 'ai' | 'payment' | 'categories' | 'features' | 'printing' | 'tax' | 'loyalty' | 'discounts' | 'workstations' | 'tables'>('business');
  const [packageLimits, setPackageLimits] = useState<TenantPackageLimitsResponse | null>(null);
  const [aiSettings, setAiSettings] = useState<AiSettings | null>(null);
  const [aiSaving, setAiSaving] = useState(false);
  const [aiApiKey, setAiApiKey] = useState('');
  const [aiModels, setAiModels] = useState<AiModelOption[]>([]);
  const [aiModelsLoading, setAiModelsLoading] = useState(false);
  const [aiModelsError, setAiModelsError] = useState<string | null>(null);
  const [aiTestMessage, setAiTestMessage] = useState('Reply with one short sentence confirming this provider and model can answer.');
  const [aiTestLoading, setAiTestLoading] = useState(false);
  const [aiTestTranscript, setAiTestTranscript] = useState<Array<{ role: 'user' | 'assistant' | 'system'; text: string }>>([]);
  const [aiTestMedia, setAiTestMedia] = useState<Array<{ name: string; type: string; dataUrl: string }>>([]);
  const [printingReceiptTest, setPrintingReceiptTest] = useState(false);
  const [logoUploading, setLogoUploading] = useState(false);
  const [logoUploadError, setLogoUploadError] = useState<string | null>(null);
  const activeTabRef = useRef(activeTab);
  const aiSettingsRef = useRef<AiSettings | null>(aiSettings);

  useEffect(() => {
    activeTabRef.current = activeTab;
  }, [activeTab]);

  useEffect(() => {
    aiSettingsRef.current = aiSettings;
  }, [aiSettings]);

  useEffect(() => {
    if (!printingReceiptTest) return;
    const clearPrintMode = () => setPrintingReceiptTest(false);
    const printTimer = window.setTimeout(() => window.print(), 75);
    window.addEventListener('afterprint', clearPrintMode);
    const fallbackTimer = window.setTimeout(clearPrintMode, 5000);
    return () => {
      window.clearTimeout(printTimer);
      window.clearTimeout(fallbackTimer);
      window.removeEventListener('afterprint', clearPrintMode);
    };
  }, [printingReceiptTest]);

  // Workstations state
  const [workstations, setWorkstations] = useState<Workstation[]>([]);
  const [companionAssignments, setCompanionAssignments] = useState<any[]>([]);
  const [companionDeviceName, setCompanionDeviceName] = useState(() => {
    try {
      return window.localStorage.getItem('companion-device-name') || 'Mobile device';
    } catch {
      return 'Mobile device';
    }
  });
  const [companionWorkstationId, setCompanionWorkstationId] = useState('');
  const [companionDefaultMode, setCompanionDefaultMode] = useState<'wireless_scanner' | 'pole_display'>('wireless_scanner');
  const [companionSaving, setCompanionSaving] = useState(false);
  const [wsModal, setWsModal] = useState<{ isOpen: boolean; ws: Partial<Workstation> | null }>({ isOpen: false, ws: null });
  const [wsSaving, setWsSaving] = useState(false);

  // ── Tables & Sections state ──────────────────────────────────────────────────
  const [sections, setSections] = useState<TableSection[]>([]);
  const [tables, setTables] = useState<RestaurantTable[]>([]);
  const [sectionModal, setSectionModal] = useState<{ isOpen: boolean; section: Partial<TableSection> | null }>({ isOpen: false, section: null });
  const [tableModal, setTableModal] = useState<{ isOpen: boolean; table: Partial<RestaurantTable> | null }>({ isOpen: false, table: null });
  const [tableSaving, setTableSaving] = useState(false);

  const fetchData = useCallback(async () => {
    if (!tenantId) return;
    try {
      const [ws, assignments, sects, tabs, limits] = await Promise.all([
        apiGet<Workstation[]>(`/api/mariadb/tenants/${tenantId}/workstations`),
        getCompanionDeviceAssignments(tenantId).catch(() => []),
        apiGet<TableSection[]>(`/api/mariadb/tenants/${tenantId}/table-sections`),
        apiGet<RestaurantTable[]>(`/api/mariadb/tenants/${tenantId}/restaurant-tables`),
        getTenantPackageLimits(tenantId),
      ]);
      setWorkstations(ws || []);
      setCompanionAssignments(assignments || []);
      if (!companionWorkstationId && ws?.[0]?.id) setCompanionWorkstationId(ws[0].id);
      setSections(sects || []);
      setTables(tabs || []);
      setPackageLimits(limits);
      try {
        const latestAiSettings = await getAiSettings(tenantId);
        if (activeTabRef.current !== 'ai' || !aiSettingsRef.current) {
          setAiSettings(latestAiSettings);
        }
      } catch {
        if (activeTabRef.current !== 'ai' || !aiSettingsRef.current) {
          setAiSettings(null);
        }
      }
    } catch (err) {
      console.error('Settings data fetch error:', err);
    }
  }, [tenantId, companionWorkstationId]);

  const companionDeviceId = React.useMemo(() => {
    const key = `companion-device-id:${tenantId || 'local'}:${currentUserStaff?.id || 'staff'}`;
    try {
      const existing = window.localStorage.getItem(key);
      if (existing) return existing;
      const created = `device_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      window.localStorage.setItem(key, created);
      return created;
    } catch {
      return `device_${Date.now()}`;
    }
  }, [tenantId, currentUserStaff?.id]);
  const canAssignCompanionDevices = currentUserStaff?.role === 'admin' || currentUserStaff?.role === 'dev';
  const currentDeviceAssignment = companionAssignments.find(assignment => assignment.deviceId === companionDeviceId);

  const saveCompanionAssignment = async () => {
    if (!tenantId || !companionWorkstationId || !canAssignCompanionDevices) return;
    setCompanionSaving(true);
    try {
      await assignCompanionDevice(tenantId, companionDeviceId, {
        deviceName: companionDeviceName.trim() || 'Mobile device',
        workstationId: companionWorkstationId,
        defaultMode: companionDefaultMode,
      });
      try {
        window.localStorage.setItem('companion-device-name', companionDeviceName.trim() || 'Mobile device');
      } catch {
        // Non-critical; the server assignment is authoritative.
      }
      await fetchData();
    } catch (err) {
      console.error('Failed to assign companion device:', err);
    } finally {
      setCompanionSaving(false);
    }
  };

  const revokeCompanionAssignment = async (deviceId: string) => {
    if (!tenantId || !canAssignCompanionDevices) return;
    setCompanionSaving(true);
    try {
      await revokeCompanionDeviceAssignment(tenantId, deviceId);
      await fetchData();
    } catch (err) {
      console.error('Failed to revoke companion device:', err);
    } finally {
      setCompanionSaving(false);
    }
  };

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 30000);
    return () => clearInterval(interval);
  }, [fetchData]);

  const saveWorkstation = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!wsModal.ws?.name || !tenantId) return;
    setWsSaving(true);
    try {
      const data = { name: wsModal.ws.name, type: wsModal.ws.type || 'kitchen', status: wsModal.ws.status || 'active' };
      if (wsModal.ws.id) {
        await apiPut(`/api/mariadb/tenants/${tenantId}/workstations/${wsModal.ws.id}`, data);
      } else {
        await apiPost(`/api/mariadb/tenants/${tenantId}/workstations`, data);
      }
      await fetchData();
      setWsModal({ isOpen: false, ws: null });
    } catch (err) { console.error(err); }
    setWsSaving(false);
  };

  const deleteWorkstation = async (id: string) => {
    if (!tenantId || !confirm('Delete this workstation?')) return;
    try {
      await apiDelete(`/api/mariadb/tenants/${tenantId}/workstations/${id}`);
      await fetchData();
    } catch (err) { console.error(err); }
  };

  const saveSection = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!sectionModal.section?.name || !tenantId) return;
    setTableSaving(true);
    try {
      const data = { name: sectionModal.section.name, color: sectionModal.section.color || 'blue', order: sectionModal.section.order ?? sections.length };
      if (sectionModal.section.id) {
        await apiPut(`/api/mariadb/tenants/${tenantId}/table-sections/${sectionModal.section.id}`, data);
      } else {
        await apiPost(`/api/mariadb/tenants/${tenantId}/table-sections`, data);
      }
      await fetchData();
      setSectionModal({ isOpen: false, section: null });
    } catch (err) { console.error(err); }
    setTableSaving(false);
  };

  const saveTable = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!tableModal.table?.label || !tableModal.table?.sectionId || !tenantId) return;
    setTableSaving(true);
    try {
      const data = {
        label: tableModal.table.label,
        sectionId: tableModal.table.sectionId,
        capacity: tableModal.table.capacity || null,
        status: tableModal.table.status || 'active',
      };
      if (tableModal.table.id) {
        await apiPut(`/api/mariadb/tenants/${tenantId}/restaurant-tables/${tableModal.table.id}`, data);
      } else {
        await apiPost(`/api/mariadb/tenants/${tenantId}/restaurant-tables`, data);
      }
      await fetchData();
      setTableModal({ isOpen: false, table: null });
    } catch (err) { console.error(err); }
    setTableSaving(false);
  };

  const deleteSection = async (id: string) => {
    if (!tenantId || !confirm('Delete this section? Tables in it will also be removed.')) return;
    try {
      await apiDelete(`/api/mariadb/tenants/${tenantId}/table-sections/${id}`);
      await fetchData();
    } catch (err) { console.error(err); }
  };

  const deleteTable = async (id: string) => {
    if (!tenantId || !confirm('Delete this table?')) return;
    try {
      await apiDelete(`/api/mariadb/tenants/${tenantId}/restaurant-tables/${id}`);
      await fetchData();
    } catch (err) { console.error(err); }
  };

  const handleSave = async () => {
    if (!tenantId) return;
    setIsSaving(true);
    try {
      await apiPut(`/api/mariadb/tenants/${tenantId}/settings/app`, formData);
      setConfig(formData);
      setPackageLimits(await getTenantPackageLimits(tenantId));
      alert("Settings saved successfully!");
    } catch (e) {
      console.error(e);
      alert("Failed to save settings");
    } finally {
      setIsSaving(false);
    }
  };

  const toggleAiRole = (field: 'visibleRoles' | 'staffScoreVisibleRoles', role: AiRole) => {
    if (!aiSettings) return;
    const current = aiSettings[field] || [];
    const next = current.includes(role) ? current.filter(r => r !== role) : [...current, role];
    setAiSettings({ ...aiSettings, [field]: next.length ? next : ['admin', 'manager', 'dev'] });
  };

  const saveAiSettings = async () => {
    if (!tenantId || !aiSettings) return;
    setAiSaving(true);
    try {
      const saved = await updateAiSettings(tenantId, {
        ...aiSettings,
        ...(aiApiKey.trim() ? { apiKey: aiApiKey.trim() } : {}),
      });
      setAiSettings(saved);
      setAiApiKey('');
      alert('AI settings saved successfully!');
    } catch (err) {
      console.error(err);
      alert('Failed to save AI settings');
    } finally {
      setAiSaving(false);
    }
  };

  const refreshAiModels = async (settingsOverride?: Partial<AiSettings>) => {
    if (!tenantId || !aiSettings) return;
    const requestSettings = {
      ...aiSettings,
      ...settingsOverride,
      ...(aiApiKey.trim() ? { apiKey: aiApiKey.trim() } : {}),
    };
    setAiModelsLoading(true);
    setAiModelsError(null);
    try {
      const response = await listAiModels(tenantId, requestSettings);
      setAiModels(response.models || []);
      if (response.models?.length && !response.models.some(model => model.id === requestSettings.model)) {
        setAiSettings({ ...aiSettings, ...settingsOverride, model: response.models[0].id });
      }
    } catch (err: any) {
      setAiModels([]);
      setAiModelsError(err?.message || 'Unable to load models');
    } finally {
      setAiModelsLoading(false);
    }
  };

  const sendAiTestMessage = async () => {
    if (!tenantId || !aiSettings || !aiTestMessage.trim()) return;
    const message = aiTestMessage.trim();
    const images = aiTestMedia.filter(file => file.type.startsWith('image/')).map(file => file.dataUrl);
    const documents = aiTestMedia.filter(file => !file.type.startsWith('image/'));
    const requestSettings = {
      ...aiSettings,
      ...(aiApiKey.trim() ? { apiKey: aiApiKey.trim() } : {}),
      message,
      images,
      documents,
    };
    setAiTestLoading(true);
    setAiTestTranscript(current => [...current, { role: 'user', text: aiTestMedia.length ? `${message}\nAttached: ${aiTestMedia.map(file => file.name).join(', ')}` : message }]);
    try {
      const response = await testAiProvider(tenantId, requestSettings);
      setAiTestTranscript(current => [
        ...current,
        { role: 'assistant', text: response.reply || `Connected to ${response.provider} / ${response.model} in ${response.latencyMs}ms.` },
        { role: 'system', text: `${response.provider} / ${response.model} responded in ${response.latencyMs}ms.` },
      ]);
    } catch (err: any) {
      setAiTestTranscript(current => [...current, { role: 'system', text: err?.message || 'AI provider test failed.' }]);
    } finally {
      setAiTestLoading(false);
    }
  };

  const addAiTestMedia = async (files: FileList | null) => {
    if (!files?.length) return;
    const next = await Promise.all(Array.from(files).map(async file => ({
      name: file.name,
      type: file.type || 'application/octet-stream',
      dataUrl: await readSettingsFileAsDataUrl(file),
    })));
    setAiTestMedia(current => [...current, ...next].slice(0, 4));
  };

  const uploadBusinessLogo = async (files: FileList | null) => {
    const file = files?.[0];
    if (!file || !tenantId) return;
    setLogoUploadError(null);
    if (!canUseOwnLogo) {
      setLogoUploadError('Logo uploads are available on Starter, Business, and White-label packages.');
      return;
    }
    if (!file.type.startsWith('image/')) {
      setLogoUploadError('Upload an image file for the logo.');
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      setLogoUploadError('Logo file is too large. Use an image smaller than 2MB.');
      return;
    }

    setLogoUploading(true);
    try {
      const dataUrl = await readSettingsFileAsDataUrl(file);
      const response = await uploadTenantLogo(tenantId, {
        dataUrl,
        filename: file.name,
        mimeType: file.type || 'application/octet-stream',
      });
      const nextConfig = response.config ? response.config as AppConfig : {
        ...formData,
        business: {
          ...formData.business,
          logoUrl: response.logoUrl,
        },
      } as AppConfig;
      setFormData(nextConfig);
      setConfig(nextConfig);
    } catch (err: any) {
      setLogoUploadError(err?.message || 'Logo upload failed.');
    } finally {
      setLogoUploading(false);
    }
  };

  useEffect(() => {
    setAiModels([]);
    setAiModelsError(null);
  }, [aiSettings?.provider, aiSettings?.baseUrl, aiSettings?.workspaceSlug]);

  const [categoryInput, setCategoryInput] = useState<{ isOpen: boolean, type: 'section'|'category'|'subcategory', section?: string, category?: string }>({ isOpen: false, type: 'section' });
  const [inputValue, setInputValue] = useState("");

  const addSection = () => {
    setCategoryInput({ isOpen: true, type: 'section' });
    setInputValue("");
  };

  const addCategory = (section: string) => {
    setCategoryInput({ isOpen: true, type: 'category', section });
    setInputValue("");
  };

  const addSubCategory = (section: string, category: string) => {
    setCategoryInput({ isOpen: true, type: 'subcategory', section, category });
    setInputValue("");
  };

  const handleInputSubmit = () => {
    if (!inputValue.trim()) return;
    const name = inputValue.trim();
    if (categoryInput.type === 'section' && formData.categories) {
      setFormData({
        ...formData,
        categories: { ...formData.categories, [name]: {} }
      });
    } else if (categoryInput.type === 'category' && categoryInput.section && formData.categories) {
      setFormData({
        ...formData,
        categories: {
          ...formData.categories,
          [categoryInput.section]: {
            ...formData.categories[categoryInput.section],
            [name]: []
          }
        }
      });
    } else if (categoryInput.type === 'subcategory' && categoryInput.section && categoryInput.category && formData.categories) {
      setFormData({
        ...formData,
        categories: {
          ...formData.categories,
          [categoryInput.section]: {
            ...formData.categories[categoryInput.section],
            [categoryInput.category]: [...formData.categories[categoryInput.section][categoryInput.category], name]
          }
        }
      });
    }
    setCategoryInput({ isOpen: false, type: 'section' });
  };

  const removeSection = (section: string) => {
    if (formData.categories) {
      const newCats = { ...formData.categories };
      delete newCats[section];
      setFormData({ ...formData, categories: newCats });
    }
  };

  const removeCategory = (section: string, category: string) => {
    if (formData.categories) {
      const newCats = { ...formData.categories };
      delete newCats[section][category];
      setFormData({ ...formData, categories: newCats });
    }
  };

  const removeSubCategory = (section: string, category: string, subCategory: string) => {
    if (formData.categories) {
      const newCats = { ...formData.categories };
      newCats[section][category] = newCats[section][category].filter(s => s !== subCategory);
      setFormData({ ...formData, categories: newCats });
    }
  };

  const formatLimit = (value?: number) => value === -1 ? 'Unlimited' : Number(value || 0).toLocaleString();
  const packageTier = formData.business?.packageTier || packageLimits?.package.id || 'free';
  const selectedPackage = JPOS_PACKAGES.find(pkg => pkg.id === packageTier) || JPOS_PACKAGES[0];
  const canEditPackage = packageLimits?.source !== 'licence';
  const canUseOwnLogo = Boolean(
    packageLimits?.package.features.includes('own_logo') ||
    packageLimits?.package.features.includes('full_branding') ||
    selectedPackage.features.includes('own_logo') ||
    selectedPackage.features.includes('full_branding')
  );
  const aiProviders: Array<{ id: AiProviderName; label: string; defaultModel: string; note: string }> = [
    { id: 'openai', label: 'OpenAI', defaultModel: 'gpt-5-mini', note: 'Uses OPENAI_API_KEY on the server.' },
    { id: 'ollama', label: 'Ollama local', defaultModel: 'llama3.1', note: 'Uses local Ollama, default http://localhost:11434.' },
    { id: 'anythingllm', label: 'AnythingLLM', defaultModel: 'workspace-default', note: 'Uses ANYTHINGLLM_API_KEY and a workspace slug.' },
    { id: 'google', label: 'Google Gemini', defaultModel: 'gemini-2.5-flash', note: 'Uses GOOGLE_AI_API_KEY or GEMINI_API_KEY.' },
    { id: 'vertex', label: 'Google Vertex AI', defaultModel: 'gemini-2.5-flash', note: 'Uses a Vertex API key, project ID, and location.' },
    { id: 'openrouter', label: 'OpenRouter', defaultModel: 'openai/gpt-5-mini', note: 'Uses OPENROUTER_API_KEY on the server.' },
  ];
  const selectedAiProvider = aiSettings ? aiProviders.find(provider => provider.id === aiSettings.provider) : null;
  const receiptPrint = normalizeReceiptPrintSettings(formData.business?.receiptPrint);
  const receiptProfile = getReceiptPaperProfile(receiptPrint);
  const updateReceiptPrint = (updates: Partial<typeof receiptPrint>) => {
    setFormData(current => {
      const currentReceiptPrint = normalizeReceiptPrintSettings(current.business?.receiptPrint);
      return {
        ...current,
        business: {
          ...current.business,
          receiptPrint: {
            ...currentReceiptPrint,
            ...updates,
          },
        },
      } as AppConfig;
    });
  };
  const resetReceiptPrint = () => {
    updateReceiptPrint({
      paperSize: '80mm',
      customPaperWidthMm: 80,
      marginMm: 4,
      fontSizePx: 12,
      showLogo: true,
      logoMode: 'standard',
      itemNameMode: 'wrap',
    });
  };
  const quickReceiptPresets = [
    { label: 'Compact 58', paperSize: '58mm' as const, marginMm: 2, fontSizePx: 10, logoMode: 'compact' as const },
    { label: 'Standard 80', paperSize: '80mm' as const, marginMm: 4, fontSizePx: 12, logoMode: 'standard' as const },
    { label: 'Wide roll', paperSize: '112mm' as const, marginMm: 5, fontSizePx: 13, logoMode: 'large' as const },
    { label: 'Office page', paperSize: 'a4' as const, marginMm: 8, fontSizePx: 12, logoMode: 'standard' as const },
  ];
  const logoInitials = (formData.business?.name || 'JPOS')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map(part => part[0]?.toUpperCase())
    .join('') || 'JP';
  const jimmyPosLogoUrl = '/icons/icon-512.png';
  const receiptPreviewLogoPx =
    receiptPrint.logoMode === 'large' ? 76 :
    receiptPrint.logoMode === 'compact' ? 32 :
    receiptPrint.logoMode === 'none' || !receiptPrint.showLogo ? 0 :
    52;
  const receiptPreviewKey = [
    receiptPrint.paperSize,
    receiptProfile.widthMm,
    receiptPrint.fontSizePx,
    receiptPrint.logoMode,
    receiptPrint.showLogo,
    receiptPrint.itemNameMode,
    formData.business?.logoUrl || 'no-logo',
    formData.business?.receiptHeader || 'no-header',
    formData.business?.receiptFooter || 'no-footer',
  ].join(':');
  const discountRoles = [
    { id: 'cashier', label: 'Cashiers' },
    { id: 'chef', label: 'Kitchen / chefs' },
    { id: 'manager', label: 'Managers' },
    { id: 'admin', label: 'Administrators' },
    { id: 'dev', label: 'Developers' },
  ] as const;
  const dayOptions = [
    { id: 0, label: 'Sun' },
    { id: 1, label: 'Mon' },
    { id: 2, label: 'Tue' },
    { id: 3, label: 'Wed' },
    { id: 4, label: 'Thu' },
    { id: 5, label: 'Fri' },
    { id: 6, label: 'Sat' },
  ];
  const setRoleDiscount = (role: typeof discountRoles[number]['id'], value: number) => {
    setFormData({
      ...formData,
      business: {
        ...formData.business,
        roleDiscounts: {
          ...(formData.business?.roleDiscounts || {}),
          [role]: Math.max(0, Math.min(100, Number(value || 0))),
        },
      },
    } as AppConfig);
  };
  const addHappyHourRule = () => {
    const rules = formData.business?.happyHourDiscounts || [];
    setFormData({
      ...formData,
      business: {
        ...formData.business,
        happyHourDiscounts: [
          ...rules,
          {
            id: `hh_${Date.now()}`,
            name: 'Happy hour',
            enabled: true,
            discountPercent: 15,
            days: [5],
            startTime: '17:00',
            endTime: '19:00',
          },
        ],
      },
    } as AppConfig);
  };
  const updateHappyHourRule = (id: string, updates: Record<string, any>) => {
    setFormData({
      ...formData,
      business: {
        ...formData.business,
        happyHourDiscounts: (formData.business?.happyHourDiscounts || []).map(rule => (
          rule.id === id ? { ...rule, ...updates } : rule
        )),
      },
    } as AppConfig);
  };
  const removeHappyHourRule = (id: string) => {
    setFormData({
      ...formData,
      business: {
        ...formData.business,
        happyHourDiscounts: (formData.business?.happyHourDiscounts || []).filter(rule => rule.id !== id),
      },
    } as AppConfig);
  };

  return (
    <div className="flex-1 p-4 lg:p-8 overflow-y-auto bg-slate-50 dark:bg-slate-950">
      <div className="max-w-4xl mx-auto space-y-8">
        <div>
          <h2 className="text-2xl lg:text-3xl font-black tracking-tight text-slate-900 dark:text-white">Settings</h2>
          <p className="text-sm font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest mt-1">Application Configuration</p>
        </div>

        <div className="flex gap-4 border-b border-slate-200 dark:border-slate-800 overflow-x-auto no-scrollbar">
          <button
            onClick={() => setActiveTab('business')}
            className={`pb-4 px-4 font-bold text-sm flex items-center gap-2 border-b-2 transition-all whitespace-nowrap ${activeTab === 'business' ? 'border-primary text-primary' : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-300'}`}
          >
            <Store className="w-4 h-4" />
            General
          </button>
          <button
            onClick={() => setActiveTab('features')}
            className={`pb-4 px-4 font-bold text-sm flex items-center gap-2 border-b-2 transition-all whitespace-nowrap ${activeTab === 'features' ? 'border-primary text-primary' : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-300'}`}
          >
            <Settings2 className="w-4 h-4" />
            Features
          </button>
          <button
            onClick={() => setActiveTab('package')}
            className={`pb-4 px-4 font-bold text-sm flex items-center gap-2 border-b-2 transition-all whitespace-nowrap ${activeTab === 'package' ? 'border-primary text-primary' : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-300'}`}
          >
            <PackageCheck className="w-4 h-4" />
            Package
          </button>
          <button
            onClick={() => setActiveTab('ai')}
            className={`pb-4 px-4 font-bold text-sm flex items-center gap-2 border-b-2 transition-all whitespace-nowrap ${activeTab === 'ai' ? 'border-primary text-primary' : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-300'}`}
          >
            <BrainCircuit className="w-4 h-4" />
            AI
          </button>
          <button
            onClick={() => setActiveTab('payment')}
            className={`pb-4 px-4 font-bold text-sm flex items-center gap-2 border-b-2 transition-all whitespace-nowrap ${activeTab === 'payment' ? 'border-primary text-primary' : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-300'}`}
          >
            <CreditCard className="w-4 h-4" />
            Payments
          </button>
          <button
            onClick={() => setActiveTab('tax')}
            className={`pb-4 px-4 font-bold text-sm flex items-center gap-2 border-b-2 transition-all whitespace-nowrap ${activeTab === 'tax' ? 'border-primary text-primary' : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-300'}`}
          >
            <Calculator className="w-4 h-4" />
            Tax
          </button>
          <button
            onClick={() => setActiveTab('printing')}
            className={`pb-4 px-4 font-bold text-sm flex items-center gap-2 border-b-2 transition-all whitespace-nowrap ${activeTab === 'printing' ? 'border-primary text-primary' : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-300'}`}
          >
            <Receipt className="w-4 h-4" />
            Receipts
          </button>
          <button
            onClick={() => setActiveTab('loyalty')}
            className={`pb-4 px-4 font-bold text-sm flex items-center gap-2 border-b-2 transition-all whitespace-nowrap ${activeTab === 'loyalty' ? 'border-primary text-primary' : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-300'}`}
          >
            <Award className="w-4 h-4" />
            Loyalty
          </button>
          <button
            onClick={() => setActiveTab('discounts')}
            className={`pb-4 px-4 font-bold text-sm flex items-center gap-2 border-b-2 transition-all whitespace-nowrap ${activeTab === 'discounts' ? 'border-primary text-primary' : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-300'}`}
          >
            <Clock className="w-4 h-4" />
            Discounts
          </button>
          <button
            onClick={() => setActiveTab('categories')}
            className={`pb-4 px-4 font-bold text-sm flex items-center gap-2 border-b-2 transition-all whitespace-nowrap ${activeTab === 'categories' ? 'border-primary text-primary' : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-300'}`}
          >
            <Layers className="w-4 h-4" />
            Categories
          </button>
          {config.business?.isRestaurantMode && (
            <button
              onClick={() => setActiveTab('workstations')}
              className={`pb-4 px-4 font-bold text-sm flex items-center gap-2 border-b-2 transition-all whitespace-nowrap ${activeTab === 'workstations' ? 'border-primary text-primary' : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-300'}`}
            >
              <ChefHat className="w-4 h-4" />
              Workstations
            </button>
          )}
          {config.business?.isRestaurantMode && (
            <button
              onClick={() => setActiveTab('tables')}
              className={`pb-4 px-4 font-bold text-sm flex items-center gap-2 border-b-2 transition-all whitespace-nowrap ${activeTab === 'tables' ? 'border-primary text-primary' : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-300'}`}
            >
              <Layers className="w-4 h-4" />
              Tables
            </button>
          )}
        </div>

        <div className="bg-white dark:bg-slate-900 p-8 rounded-3xl shadow-sm border border-slate-100 dark:border-slate-800 space-y-6">
          {activeTab === 'business' && (
            <div className="space-y-6">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                  <div className="space-y-2">
                    <label className="text-xs font-black uppercase tracking-widest text-slate-500">Business Name</label>
                    <input
                      type="text"
                      value={formData.business?.name || ''}
                      onChange={e => setFormData({...formData, business: {...formData.business, name: e.target.value}} as AppConfig)}
                      className="w-full px-4 py-3 bg-slate-50 dark:bg-slate-800 border-none rounded-xl focus:ring-2 ring-primary/20 text-sm font-bold dark:text-white outline-none"
                    />
                  </div>
                  <div className="space-y-2">
                    <div className="flex items-center justify-between gap-3">
                      <label className="text-xs font-black uppercase tracking-widest text-slate-500">Logo URL</label>
                      <button
                        type="button"
                        onClick={() => setFormData({...formData, business: {...formData.business, logoUrl: jimmyPosLogoUrl}} as AppConfig)}
                        className="text-[10px] font-black uppercase tracking-widest text-primary hover:text-primary/80"
                      >
                        Use Jimmy's POS
                      </button>
                    </div>
                    <input
                      type="url"
                      value={formData.business?.logoUrl || ''}
                      onChange={e => setFormData({...formData, business: {...formData.business, logoUrl: e.target.value}} as AppConfig)}
                      className="w-full px-4 py-3 bg-slate-50 dark:bg-slate-800 border-none rounded-xl focus:ring-2 ring-primary/20 text-sm font-bold dark:text-white outline-none"
                    />
                    <div className={`rounded-2xl border p-4 ${canUseOwnLogo ? 'border-primary/20 bg-primary/5' : 'border-amber-200 bg-amber-50 dark:border-amber-900/50 dark:bg-amber-900/20'}`}>
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                        <div>
                          <p className="text-sm font-black text-slate-900 dark:text-white">Upload logo</p>
                          <p className="mt-0.5 text-xs font-semibold text-slate-500 dark:text-slate-400">
                            {canUseOwnLogo ? 'PNG, JPG, WebP, GIF, or SVG up to 2MB.' : 'Available on paid packages with own-logo branding.'}
                          </p>
                        </div>
                        <label className={`inline-flex cursor-pointer items-center justify-center gap-2 rounded-xl px-4 py-3 text-xs font-black uppercase tracking-widest transition-all ${canUseOwnLogo ? 'bg-primary text-white hover:bg-primary/90' : 'cursor-not-allowed bg-slate-200 text-slate-400 dark:bg-slate-800'}`}>
                          {logoUploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                          {logoUploading ? 'Uploading' : 'Choose file'}
                          <input
                            type="file"
                            accept="image/png,image/jpeg,image/webp,image/gif,image/svg+xml"
                            disabled={!canUseOwnLogo || logoUploading}
                            onChange={e => {
                              uploadBusinessLogo(e.target.files);
                              e.currentTarget.value = '';
                            }}
                            className="sr-only"
                          />
                        </label>
                      </div>
                      {logoUploadError && <p className="mt-3 text-xs font-bold text-rose-600 dark:text-rose-300">{logoUploadError}</p>}
                    </div>
                  </div>
                  <div className="space-y-2 sm:col-span-2">
                    <label className="text-xs font-black uppercase tracking-widest text-slate-500">Address</label>
                    <input
                      type="text"
                      value={formData.business?.address || ''}
                      onChange={e => setFormData({...formData, business: {...formData.business, address: e.target.value}} as AppConfig)}
                      className="w-full px-4 py-3 bg-slate-50 dark:bg-slate-800 border-none rounded-xl focus:ring-2 ring-primary/20 text-sm font-bold dark:text-white outline-none"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-black uppercase tracking-widest text-slate-500">Phone</label>
                    <input
                      type="text"
                      value={formData.business?.phone || ''}
                      onChange={e => setFormData({...formData, business: {...formData.business, phone: e.target.value}} as AppConfig)}
                      className="w-full px-4 py-3 bg-slate-50 dark:bg-slate-800 border-none rounded-xl focus:ring-2 ring-primary/20 text-sm font-bold dark:text-white outline-none"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-black uppercase tracking-widest text-slate-500">Currency Symbol</label>
                    <input
                      type="text"
                      value={formData.business?.currency || ''}
                      onChange={e => setFormData({...formData, business: {...formData.business, currency: e.target.value}} as AppConfig)}
                      className="w-full px-4 py-3 bg-slate-50 dark:bg-slate-800 border-none rounded-xl focus:ring-2 ring-primary/20 text-sm font-bold dark:text-white outline-none"
                    />
                  </div>
              </div>
            </div>
          )}

          {activeTab === 'features' && (
            <div className="space-y-6">
              <div className="space-y-4">
                <div className="flex items-center gap-3 p-4 bg-slate-50 dark:bg-slate-800/50 rounded-2xl border border-slate-100 dark:border-slate-800">
                  <input
                    type="checkbox"
                    id="restaurantMode"
                    checked={formData.business?.isRestaurantMode || false}
                    onChange={e => setFormData({...formData, business: {...formData.business, isRestaurantMode: e.target.checked}} as AppConfig)}
                    className="w-5 h-5 rounded text-primary focus:ring-primary accent-primary cursor-pointer"
                  />
                  <div>
                    <label htmlFor="restaurantMode" className="text-sm font-bold text-slate-900 dark:text-white cursor-pointer block">Restaurant Mode</label>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">Enable Table Management, Kitchen workstations, and course firing.</p>
                  </div>
                </div>

                <div className="flex items-center gap-3 p-4 bg-slate-50 dark:bg-slate-800/50 rounded-2xl border border-slate-100 dark:border-slate-800">
                  <input
                    type="checkbox"
                    id="loyaltyMode"
                    checked={formData.business?.enableLoyalty || false}
                    onChange={e => setFormData({...formData, business: {...formData.business, enableLoyalty: e.target.checked}} as AppConfig)}
                    className="w-5 h-5 rounded text-primary focus:ring-primary accent-primary cursor-pointer"
                  />
                  <div>
                    <label htmlFor="loyaltyMode" className="text-sm font-bold text-slate-900 dark:text-white cursor-pointer block">Loyalty Program</label>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">Allow customers to earn points on purchases and redeem them as discounts.</p>
                  </div>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'package' && (
            <div className="space-y-6">
              <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50 p-5">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <p className="text-xs font-black uppercase tracking-widest text-slate-500">Current package</p>
                    <h3 className="mt-1 text-2xl font-black text-slate-900 dark:text-white">{selectedPackage.name}</h3>
                    <p className="mt-1 text-sm font-semibold text-slate-500 dark:text-slate-400">{selectedPackage.limitsLabel}</p>
                  </div>
                  <div className="text-left sm:text-right">
                    <p className="text-xs font-black uppercase tracking-widest text-slate-500">Billing</p>
                    <p className="mt-1 text-lg font-black text-primary">{selectedPackage.priceLabel}</p>
                    <p className="mt-1 text-xs font-bold text-slate-400">{packageLimits?.source === 'licence' ? 'Signed licence' : 'Hosted workspace'}</p>
                  </div>
                </div>
              </div>

              {canEditPackage ? (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {JPOS_PACKAGES.filter(pkg => pkg.delivery === 'hosted_saas').map(pkg => (
                    <button
                      key={pkg.id}
                      type="button"
                      onClick={() => setFormData({
                        ...formData,
                        business: { ...formData.business, packageTier: pkg.id }
                      } as AppConfig)}
                      className={`text-left rounded-2xl border p-4 transition-all ${packageTier === pkg.id ? 'border-primary bg-primary/5 shadow-sm' : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 hover:border-primary/40'}`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="font-black text-slate-900 dark:text-white">{pkg.name}</p>
                          <p className="mt-1 text-xs font-semibold text-slate-500 dark:text-slate-400">{pkg.description}</p>
                        </div>
                        <span className="text-sm font-black text-primary whitespace-nowrap">{pkg.priceLabel}</span>
                      </div>
                      <p className="mt-3 text-xs font-bold text-slate-500 dark:text-slate-400">{pkg.limitsLabel}</p>
                    </button>
                  ))}
                </div>
              ) : (
                <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm font-semibold text-amber-800 dark:border-amber-900 dark:bg-amber-900/20 dark:text-amber-200">
                  This install is controlled by its signed licence key. Package changes must be issued from the licence console.
                </div>
              )}

              {packageLimits && (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                  {[
                    { label: 'Products', used: packageLimits.usage.products, limit: packageLimits.package.maxProducts },
                    { label: 'Staff', used: packageLimits.usage.staff, limit: packageLimits.package.maxStaff },
                    { label: 'Customers', used: packageLimits.usage.customers, limit: packageLimits.package.maxCustomers },
                    { label: 'Open registers', used: packageLimits.usage.activeRegisters, limit: packageLimits.package.maxRegisters },
                  ].map(item => (
                    <div key={item.label} className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
                      <p className="text-xs font-black uppercase tracking-widest text-slate-400">{item.label}</p>
                      <p className="mt-2 text-xl font-black text-slate-900 dark:text-white">{formatLimit(item.used)} / {formatLimit(item.limit)}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {activeTab === 'ai' && (
            <div className="space-y-6">
              {!aiSettings && (
                <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm font-semibold text-amber-800 dark:border-amber-900 dark:bg-amber-900/20 dark:text-amber-200">
                  AI is available on Business and White-label packages. Upgrade or enable AI to manage these controls.
                </div>
              )}
              {aiSettings && (
                <>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <label className="flex items-center gap-3 rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50 p-4">
                      <input
                        type="checkbox"
                        checked={aiSettings.enabled}
                        onChange={e => setAiSettings({ ...aiSettings, enabled: e.target.checked })}
                        className="w-5 h-5 rounded text-primary accent-primary"
                      />
                      <span>
                        <span className="block text-sm font-black text-slate-900 dark:text-white">Enable AI Copilot</span>
                        <span className="block text-xs font-semibold text-slate-500 dark:text-slate-400">Master switch for tenant AI features.</span>
                      </span>
                    </label>
                    <label className="flex items-center gap-3 rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50 p-4">
                      <input
                        type="checkbox"
                        checked={aiSettings.staffScoringEnabled}
                        onChange={e => setAiSettings({ ...aiSettings, staffScoringEnabled: e.target.checked })}
                        className="w-5 h-5 rounded text-primary accent-primary"
                      />
                      <span>
                        <span className="block text-sm font-black text-slate-900 dark:text-white">Staff scoring</span>
                        <span className="block text-xs font-semibold text-slate-500 dark:text-slate-400">Balanced coaching grades and motivation badges.</span>
                      </span>
                    </label>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <label className="text-xs font-black uppercase tracking-widest text-slate-500">Provider</label>
                      <select
                        value={aiSettings.provider}
                        onChange={e => {
                          const provider = e.target.value as AiProviderName;
                          const meta = aiProviders.find(item => item.id === provider);
                          const nextSettings = {
                            ...aiSettings,
                            provider,
                            model: meta?.defaultModel || aiSettings.model,
                            baseUrl: provider === 'ollama'
                              ? (aiSettings.baseUrl || 'http://localhost:11434')
                              : provider === 'anythingllm'
                                ? (aiSettings.baseUrl || 'http://localhost:3001')
                                : provider === 'vertex'
                                  ? (aiSettings.baseUrl || 'us-central1')
                                  : aiSettings.baseUrl,
                          };
                          setAiSettings(nextSettings);
                          setAiModels([]);
                          setAiModelsError(null);
                        }}
                        className="w-full px-4 py-3 bg-slate-50 dark:bg-slate-800 border-none rounded-xl text-sm font-bold dark:text-white outline-none"
                      >
                        {aiProviders.map(provider => (
                          <option key={provider.id} value={provider.id}>{provider.label}</option>
                        ))}
                      </select>
                      <p className="text-xs font-semibold text-slate-400">
                        {selectedAiProvider?.note}
                      </p>
                    </div>
                    <div className="space-y-2">
                      <div className="flex items-center justify-between gap-3">
                        <label className="text-xs font-black uppercase tracking-widest text-slate-500">Model</label>
                        <button
                          type="button"
                          onClick={() => refreshAiModels()}
                          disabled={aiModelsLoading}
                          className="text-[10px] font-black uppercase tracking-widest text-primary disabled:text-slate-400"
                        >
                          {aiModelsLoading ? 'Loading...' : 'Refresh models'}
                        </button>
                      </div>
                      {aiModels.length > 0 ? (
                        <select
                          value={aiSettings.model}
                          onChange={e => setAiSettings({ ...aiSettings, model: e.target.value })}
                          className="w-full px-4 py-3 bg-slate-50 dark:bg-slate-800 border-none rounded-xl text-sm font-bold dark:text-white outline-none"
                        >
                          {aiModels.map(model => (
                            <option key={model.id} value={model.id}>{model.name || model.id}</option>
                          ))}
                        </select>
                      ) : (
                        <input
                          value={aiSettings.model}
                          onChange={e => setAiSettings({ ...aiSettings, model: e.target.value })}
                          className="w-full px-4 py-3 bg-slate-50 dark:bg-slate-800 border-none rounded-xl focus:ring-2 ring-primary/20 text-sm font-bold dark:text-white outline-none"
                        />
                      )}
                      <p className="text-xs font-semibold text-slate-400">
                        {aiModelsError || (aiSettings.providerStatus?.[aiSettings.provider] ? 'Selected provider is configured' : 'Selected provider is not fully configured; deterministic fallback is active')}
                      </p>
                    </div>
                  </div>

                  {aiSettings.provider !== 'ollama' && (
                    <div className="space-y-2">
                      <label className="text-xs font-black uppercase tracking-widest text-slate-500">
                        API key {aiSettings.apiKeyConfigured ? '(saved)' : ''}
                      </label>
                      <div className="flex flex-col gap-2 sm:flex-row">
                        <input
                          type="password"
                          value={aiApiKey}
                          onChange={e => setAiApiKey(e.target.value)}
                          className="min-w-0 flex-1 px-4 py-3 bg-slate-50 dark:bg-slate-800 border-none rounded-xl focus:ring-2 ring-primary/20 text-sm font-bold dark:text-white outline-none"
                          placeholder={aiSettings.apiKeyConfigured ? 'Leave blank to keep saved key' : 'Paste provider API key'}
                        />
                        <button
                          type="button"
                          onClick={() => refreshAiModels()}
                          disabled={aiModelsLoading || (!aiApiKey.trim() && !aiSettings.apiKeyConfigured && !aiSettings.providerStatus?.[aiSettings.provider])}
                          className="px-4 py-3 rounded-xl bg-slate-900 text-white dark:bg-white dark:text-slate-900 text-xs font-black uppercase tracking-widest disabled:opacity-50"
                        >
                          Load models
                        </button>
                      </div>
                      <p className="text-xs font-semibold text-slate-400">
                        Keys are saved server-side for this tenant and are never returned to the browser.
                      </p>
                    </div>
                  )}

                  <div className="rounded-2xl border border-slate-200 dark:border-slate-800 p-4 space-y-3">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <h3 className="text-sm font-black text-slate-900 dark:text-white">Provider test chat</h3>
                        <p className="text-xs font-semibold text-slate-500 dark:text-slate-400">
                          Uses the selected provider, model, base URL/project, and the pasted key before saving.
                        </p>
                      </div>
                      {aiTestLoading && <Loader2 className="w-4 h-4 animate-spin text-primary" />}
                    </div>
                    <div className="min-h-[112px] max-h-56 overflow-y-auto rounded-xl bg-slate-50 dark:bg-slate-900/60 p-3 space-y-2">
                      {aiTestTranscript.length === 0 ? (
                        <p className="text-xs font-semibold text-slate-400">Send a test message to confirm the provider can respond.</p>
                      ) : aiTestTranscript.map((entry, index) => (
                        <div
                          key={`${entry.role}-${index}`}
                          className={`rounded-xl px-3 py-2 text-xs font-semibold ${
                            entry.role === 'user'
                              ? 'bg-primary/10 text-slate-900 dark:text-white'
                              : entry.role === 'assistant'
                                ? 'bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200'
                                : 'bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-200'
                          }`}
                        >
                          <span className="mb-1 block text-[10px] font-black uppercase tracking-widest opacity-60">
                            {entry.role === 'user' ? 'You' : entry.role === 'assistant' ? 'Provider' : 'Status'}
                          </span>
                          {entry.text}
                        </div>
                      ))}
                    </div>
                    <div className="flex flex-col gap-2 sm:flex-row">
                      <textarea
                        value={aiTestMessage}
                        onChange={e => setAiTestMessage(e.target.value)}
                        rows={2}
                        className="min-w-0 flex-1 resize-none px-4 py-3 bg-slate-50 dark:bg-slate-800 border-none rounded-xl focus:ring-2 ring-primary/20 text-sm font-bold dark:text-white outline-none"
                      />
                      <label className="inline-flex cursor-pointer items-center justify-center gap-2 px-4 py-3 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 text-xs font-black uppercase tracking-widest">
                        <Paperclip className="w-4 h-4" />
                        Media
                        <input
                          type="file"
                          multiple
                          accept="image/*,.pdf,.csv,.txt,.doc,.docx,application/pdf,text/plain,text/csv,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                          onChange={e => {
                            void addAiTestMedia(e.target.files);
                            e.currentTarget.value = '';
                          }}
                          className="hidden"
                        />
                      </label>
                      <button
                        type="button"
                        onClick={sendAiTestMessage}
                        disabled={aiTestLoading || !aiTestMessage.trim() || (!aiApiKey.trim() && !aiSettings.apiKeyConfigured && !aiSettings.providerStatus?.[aiSettings.provider] && aiSettings.provider !== 'ollama')}
                        className="inline-flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-primary text-white text-xs font-black uppercase tracking-widest disabled:opacity-50"
                      >
                        <Send className="w-4 h-4" />
                        Send test
                      </button>
                    </div>
                    {aiTestMedia.length > 0 && (
                      <div className="flex flex-wrap gap-2">
                        {aiTestMedia.map(file => (
                          <span key={`${file.name}-${file.dataUrl.length}`} className="inline-flex max-w-full items-center gap-2 rounded-full bg-slate-100 dark:bg-slate-800 px-3 py-1 text-xs font-bold text-slate-600 dark:text-slate-300">
                            <span className="truncate">{file.name}</span>
                            <button
                              type="button"
                              onClick={() => setAiTestMedia(current => current.filter(item => item !== file))}
                              className="text-slate-400 hover:text-red-500"
                            >
                              <X className="w-3 h-3" />
                            </button>
                          </span>
                        ))}
                      </div>
                    )}
                  </div>

                  {(aiSettings.provider === 'ollama' || aiSettings.provider === 'anythingllm' || aiSettings.provider === 'vertex') && (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <label className="text-xs font-black uppercase tracking-widest text-slate-500">
                          {aiSettings.provider === 'vertex' ? 'Location' : 'Base URL'}
                        </label>
                        <input
                          value={aiSettings.baseUrl || ''}
                          onChange={e => setAiSettings({ ...aiSettings, baseUrl: e.target.value })}
                          className="w-full px-4 py-3 bg-slate-50 dark:bg-slate-800 border-none rounded-xl focus:ring-2 ring-primary/20 text-sm font-bold dark:text-white outline-none"
                          placeholder={aiSettings.provider === 'ollama' ? 'http://localhost:11434' : aiSettings.provider === 'vertex' ? 'us-central1' : 'http://localhost:3001'}
                        />
                      </div>
                      {(aiSettings.provider === 'anythingllm' || aiSettings.provider === 'vertex') && (
                        <div className="space-y-2">
                          <label className="text-xs font-black uppercase tracking-widest text-slate-500">
                            {aiSettings.provider === 'vertex' ? 'Project ID' : 'Workspace slug'}
                          </label>
                          <input
                            value={aiSettings.workspaceSlug || ''}
                            onChange={e => setAiSettings({ ...aiSettings, workspaceSlug: e.target.value })}
                            className="w-full px-4 py-3 bg-slate-50 dark:bg-slate-800 border-none rounded-xl focus:ring-2 ring-primary/20 text-sm font-bold dark:text-white outline-none"
                            placeholder={aiSettings.provider === 'vertex' ? 'my-gcp-project' : 'main-workspace'}
                          />
                        </div>
                      )}
                    </div>
                  )}

                  <div className="rounded-2xl border border-slate-200 dark:border-slate-800 p-4">
                    <h3 className="text-sm font-black text-slate-900 dark:text-white">Provider readiness</h3>
                    <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-2">
                      {aiProviders.map(provider => (
                        <div key={provider.id} className="rounded-xl bg-slate-50 dark:bg-slate-800/60 px-3 py-2">
                          <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">{provider.label}</p>
                          <p className={`mt-1 text-xs font-black ${aiSettings.providerStatus?.[provider.id] ? 'text-emerald-600 dark:text-emerald-300' : 'text-amber-600 dark:text-amber-300'}`}>
                            {aiSettings.providerStatus?.[provider.id] ? 'Ready' : 'Fallback'}
                          </p>
                        </div>
                      ))}
                    </div>
                  </div>

                  {([
                    { key: 'visibleRoles', title: 'Roles that can use AI Copilot' },
                    { key: 'staffScoreVisibleRoles', title: 'Roles that can see staff grades' },
                  ] as const).map(group => (
                    <div key={group.key} className="rounded-2xl border border-slate-200 dark:border-slate-800 p-4">
                      <h3 className="text-sm font-black text-slate-900 dark:text-white">{group.title}</h3>
                      <div className="mt-4 flex flex-wrap gap-2">
                        {(['admin', 'manager', 'dev', 'cashier', 'chef'] as AiRole[]).map(role => (
                          <button
                            key={role}
                            type="button"
                            onClick={() => toggleAiRole(group.key, role)}
                            className={`px-4 py-2 rounded-xl text-xs font-black uppercase tracking-widest border transition-all ${
                              aiSettings[group.key].includes(role)
                                ? 'bg-primary text-white border-primary'
                                : 'bg-white dark:bg-slate-900 text-slate-500 border-slate-200 dark:border-slate-800'
                            }`}
                          >
                            {role}
                          </button>
                        ))}
                      </div>
                    </div>
                  ))}

                  <div className="pt-6 border-t border-slate-100 dark:border-slate-800">
                    <button
                      onClick={saveAiSettings}
                      disabled={aiSaving}
                      className="px-8 py-4 bg-primary text-white rounded-2xl font-black text-sm uppercase tracking-widest flex items-center gap-3 hover:bg-primary/90 transition-all shadow-xl shadow-primary/20"
                    >
                      {aiSaving ? <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <Save className="w-5 h-5" />}
                      Save AI Settings
                    </button>
                  </div>
                </>
              )}
            </div>
          )}

          {activeTab === 'payment' && (
            <div className="space-y-8">
              <div className="space-y-4">
                 <h3 className="text-sm font-black uppercase tracking-widest text-slate-900 dark:text-white">Accepted Methods</h3>
                 <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="flex items-center gap-3 p-4 bg-slate-50 dark:bg-slate-800/50 rounded-xl">
                    <input
                      type="checkbox"
                      id="enableCash"
                      checked={formData.enableCash !== false}
                      onChange={e => setFormData({...formData, enableCash: e.target.checked})}
                      className="w-5 h-5 rounded text-primary"
                    />
                    <label htmlFor="enableCash" className="text-sm font-bold dark:text-white">Cash</label>
                  </div>
                  <div className="flex items-center gap-3 p-4 bg-slate-50 dark:bg-slate-800/50 rounded-xl">
                    <input
                      type="checkbox"
                      id="enableCard"
                      checked={formData.enableCard !== false}
                      onChange={e => setFormData({...formData, enableCard: e.target.checked})}
                      className="w-5 h-5 rounded text-primary"
                    />
                    <label htmlFor="enableCard" className="text-sm font-bold dark:text-white">Card Terminal</label>
                  </div>
                 </div>
              </div>

              <div className="space-y-4 pt-6 border-t border-slate-100 dark:border-slate-800">
                <div>
                  <h3 className="text-sm font-black uppercase tracking-widest text-slate-900 dark:text-white">PayFast Integration</h3>
                  <p className="text-xs text-slate-500 mt-1">Accept online payments or payment links via PayFast.</p>
                </div>

                <div className="flex items-center gap-3 bg-blue-50 dark:bg-blue-900/20 p-4 rounded-xl border border-blue-100 dark:border-blue-900/50">
                  <input
                    type="checkbox"
                    id="sandbox"
                    checked={formData.payfastSandbox}
                    onChange={e => setFormData({...formData, payfastSandbox: e.target.checked})}
                    className="w-5 h-5 rounded text-blue-600 focus:ring-blue-500 accent-blue-600"
                  />
                  <label htmlFor="sandbox" className="text-sm font-bold text-blue-900 dark:text-blue-100 cursor-pointer">Enable PayFast Sandbox (Testing) Mode</label>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                  <div className="space-y-2">
                    <label className="text-xs font-black uppercase tracking-widest text-slate-500">Merchant ID</label>
                    <input
                      type="text"
                      value={formData.payfastMerchantId || ''}
                      onChange={e => setFormData({...formData, payfastMerchantId: e.target.value})}
                      className="w-full px-4 py-3 bg-slate-50 dark:bg-slate-800 border-none rounded-xl focus:ring-2 ring-primary/20 text-sm font-bold dark:text-white outline-none"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-black uppercase tracking-widest text-slate-500">Merchant Key</label>
                    <input
                      type="text"
                      value={formData.payfastMerchantKey || ''}
                      onChange={e => setFormData({...formData, payfastMerchantKey: e.target.value})}
                      className="w-full px-4 py-3 bg-slate-50 dark:bg-slate-800 border-none rounded-xl focus:ring-2 ring-primary/20 text-sm font-bold dark:text-white outline-none"
                    />
                  </div>
                  <div className="space-y-2 sm:col-span-2">
                    <label className="text-xs font-black uppercase tracking-widest text-slate-500">Passphrase</label>
                    <input
                      type="password"
                      value={formData.payfastPassphrase || ''}
                      onChange={e => setFormData({...formData, payfastPassphrase: e.target.value})}
                      className="w-full px-4 py-3 bg-slate-50 dark:bg-slate-800 border-none rounded-xl focus:ring-2 ring-primary/20 text-sm font-bold dark:text-white outline-none"
                    />
                  </div>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'tax' && (
            <div className="space-y-6">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                <div className="space-y-2">
                  <label className="text-xs font-black uppercase tracking-widest text-slate-500">Tax/VAT Name</label>
                  <input
                    type="text"
                    value={formData.business?.taxName || 'VAT'}
                    onChange={e => setFormData({...formData, business: {...formData.business, taxName: e.target.value}} as AppConfig)}
                    className="w-full px-4 py-3 bg-slate-50 dark:bg-slate-800 border-none rounded-xl focus:ring-2 ring-primary/20 text-sm font-bold dark:text-white outline-none"
                    placeholder="e.g. VAT, Sales Tax"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-black uppercase tracking-widest text-slate-500">Tax Rate (%)</label>
                  <input
                    type="number"
                    value={formData.business?.taxRate || ''}
                    onChange={e => setFormData({...formData, business: {...formData.business, taxRate: parseFloat(e.target.value)}} as AppConfig)}
                    className="w-full px-4 py-3 bg-slate-50 dark:bg-slate-800 border-none rounded-xl focus:ring-2 ring-primary/20 text-sm font-bold dark:text-white outline-none"
                  />
                </div>

                <div className="space-y-2 sm:col-span-2">
                  <div className="flex items-center gap-3 p-4 bg-slate-50 dark:bg-slate-800/50 rounded-2xl border border-slate-100 dark:border-slate-800">
                    <input
                      type="checkbox"
                      id="taxInclusive"
                      checked={formData.business?.taxInclusive !== false}
                      onChange={e => setFormData({...formData, business: {...formData.business, taxInclusive: e.target.checked}} as AppConfig)}
                      className="w-5 h-5 rounded text-primary focus:ring-primary accent-primary cursor-pointer"
                    />
                    <div>
                      <label htmlFor="taxInclusive" className="text-sm font-bold text-slate-900 dark:text-white cursor-pointer block">Prices Include Tax</label>
                      <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">If enabled, tax is calculated backwards from the printed prices. If disabled, tax is added to the subtotal.</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'printing' && (
            <div className="space-y-6">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                <div>
                  <h3 className="text-xl font-black text-slate-900 dark:text-white">Receipt Print Studio</h3>
                  <p className="mt-1 text-sm font-semibold text-slate-500 dark:text-slate-400">Set the paper, logo, density, and messages used when a sale or customer bill is printed.</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => setPrintingReceiptTest(true)}
                    className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-3 text-xs font-black uppercase tracking-widest text-white shadow-sm hover:bg-slate-800 dark:bg-white dark:text-slate-900 dark:hover:bg-slate-200"
                  >
                    <Printer className="h-4 w-4" /> Test print
                  </button>
                  <button
                    type="button"
                    onClick={resetReceiptPrint}
                    className="inline-flex items-center gap-2 rounded-xl bg-slate-100 px-4 py-3 text-xs font-black uppercase tracking-widest text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
                  >
                    <RotateCcw className="h-4 w-4" /> Reset
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                {quickReceiptPresets.map(preset => {
                  const selected = receiptPrint.paperSize === preset.paperSize && receiptPrint.marginMm === preset.marginMm && receiptPrint.fontSizePx === preset.fontSizePx;
                  return (
                    <button
                      key={preset.label}
                      type="button"
                      onClick={() => updateReceiptPrint({ ...preset, showLogo: true, itemNameMode: 'wrap' })}
                      className={`rounded-2xl border p-4 text-left transition-all ${selected ? 'border-primary bg-primary/10 text-primary shadow-sm' : 'border-slate-200 bg-slate-50 text-slate-600 hover:border-primary/40 hover:bg-primary/5 dark:border-slate-800 dark:bg-slate-800/60 dark:text-slate-300'}`}
                    >
                      <span className="block text-sm font-black">{preset.label}</span>
                      <span className="mt-1 block text-[11px] font-bold uppercase tracking-widest opacity-70">{preset.paperSize} / {preset.fontSizePx}px</span>
                    </button>
                  );
                })}
              </div>

              <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_440px] gap-6">
                <div className="space-y-6">
                  <div className="rounded-3xl border border-slate-100 bg-slate-50/70 p-5 dark:border-slate-800 dark:bg-slate-800/40">
                    <div className="mb-4 flex items-center gap-2">
                      <Printer className="h-4 w-4 text-primary" />
                      <h4 className="font-black text-slate-900 dark:text-white">Printer Profile</h4>
                    </div>
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                      <div className="space-y-2">
                        <label className="text-xs font-black uppercase tracking-widest text-slate-500">Printer / Paper Size</label>
                        <select
                          value={receiptPrint.paperSize}
                          onChange={e => updateReceiptPrint({ paperSize: e.target.value as typeof receiptPrint.paperSize })}
                          className="w-full px-4 py-3 bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-700 rounded-xl focus:ring-2 ring-primary/20 text-sm font-bold dark:text-white outline-none"
                        >
                          {RECEIPT_PAPER_OPTIONS.map(option => (
                            <option key={option.id} value={option.id}>{option.label}</option>
                          ))}
                        </select>
                        <p className="text-xs text-slate-500">Current print area: {receiptProfile.widthMm} mm, {receiptProfile.isThermal ? 'roll paper' : 'page printer'}.</p>
                      </div>

                      {receiptPrint.paperSize === 'custom' && (
                        <div className="space-y-2">
                          <label className="text-xs font-black uppercase tracking-widest text-slate-500">Custom Width (mm)</label>
                          <input
                            type="number"
                            min="40"
                            max="216"
                            value={receiptPrint.customPaperWidthMm}
                            onChange={e => updateReceiptPrint({ customPaperWidthMm: parseFloat(e.target.value) || 80 })}
                            className="w-full px-4 py-3 bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-700 rounded-xl focus:ring-2 ring-primary/20 text-sm font-bold dark:text-white outline-none"
                          />
                          <p className="text-xs text-slate-500">Use the printable width from the printer driver.</p>
                        </div>
                      )}

                      <div className="space-y-2">
                        <label className="text-xs font-black uppercase tracking-widest text-slate-500">Receipt Margin (mm)</label>
                        <input
                          type="number"
                          min="0"
                          max="12"
                          step="0.5"
                          value={receiptPrint.marginMm}
                          onChange={e => updateReceiptPrint({ marginMm: parseFloat(e.target.value) || 0 })}
                          className="w-full px-4 py-3 bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-700 rounded-xl focus:ring-2 ring-primary/20 text-sm font-bold dark:text-white outline-none"
                        />
                        <p className="text-xs text-slate-500">Small margins for thermal rolls, larger margins for office printers.</p>
                      </div>

                      <div className="space-y-2">
                        <label className="text-xs font-black uppercase tracking-widest text-slate-500">Text Size</label>
                        <input
                          type="number"
                          min="9"
                          max="16"
                          value={receiptPrint.fontSizePx}
                          onChange={e => updateReceiptPrint({ fontSizePx: parseFloat(e.target.value) || 12 })}
                          className="w-full px-4 py-3 bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-700 rounded-xl focus:ring-2 ring-primary/20 text-sm font-bold dark:text-white outline-none"
                        />
                        <p className="text-xs text-slate-500">Use 10-11px for 58 mm, 12-13px for 80 mm and wider.</p>
                      </div>
                    </div>
                  </div>

                  <div className="rounded-3xl border border-slate-100 bg-slate-50/70 p-5 dark:border-slate-800 dark:bg-slate-800/40">
                    <div className="mb-4 flex items-center gap-2">
                      <Eye className="h-4 w-4 text-primary" />
                      <h4 className="font-black text-slate-900 dark:text-white">Branding and Line Layout</h4>
                    </div>
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                      <div className="space-y-2">
                        <label className="text-xs font-black uppercase tracking-widest text-slate-500">Logo on Receipts</label>
                        <select
                          value={receiptPrint.showLogo ? receiptPrint.logoMode : 'none'}
                          onChange={e => {
                            const logoMode = e.target.value as typeof receiptPrint.logoMode;
                            updateReceiptPrint({ showLogo: logoMode !== 'none', logoMode });
                          }}
                          className="w-full px-4 py-3 bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-700 rounded-xl focus:ring-2 ring-primary/20 text-sm font-bold dark:text-white outline-none"
                        >
                          <option value="none">Do not print logo</option>
                          <option value="compact">Compact logo</option>
                          <option value="standard">Standard logo</option>
                          <option value="large">Large logo</option>
                        </select>
                        <p className="text-xs text-slate-500">Uses the business logo URL from the Business tab.</p>
                      </div>

                      <div className="space-y-2">
                        <label className="text-xs font-black uppercase tracking-widest text-slate-500">Long Product Names</label>
                        <select
                          value={receiptPrint.itemNameMode}
                          onChange={e => updateReceiptPrint({ itemNameMode: e.target.value as typeof receiptPrint.itemNameMode })}
                          className="w-full px-4 py-3 bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-700 rounded-xl focus:ring-2 ring-primary/20 text-sm font-bold dark:text-white outline-none"
                        >
                          <option value="wrap">Wrap to the next line</option>
                          <option value="truncate">Keep one line</option>
                        </select>
                        <p className="text-xs text-slate-500">Wrapping keeps modifiers and long menu names readable.</p>
                      </div>

                      <div className="space-y-2 lg:col-span-2">
                        <label className="text-xs font-black uppercase tracking-widest text-slate-500">Receipt Header Format</label>
                        <textarea
                          value={formData.business?.receiptHeader || ''}
                          onChange={e => setFormData({...formData, business: {...formData.business, receiptHeader: e.target.value}} as AppConfig)}
                          className="w-full px-4 py-3 bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-700 rounded-xl focus:ring-2 ring-primary/20 text-sm font-mono dark:text-white outline-none min-h-[96px]"
                          placeholder="E.g. Welcome to Our Store!&#10;Follow us on Insta @store"
                        />
                        <p className="text-xs text-slate-500">Printed below the tax invoice heading.</p>
                      </div>

                      <div className="space-y-2 lg:col-span-2">
                        <label className="text-xs font-black uppercase tracking-widest text-slate-500">Receipt Footer Messages</label>
                        <textarea
                          value={formData.business?.receiptFooter || ''}
                          onChange={e => setFormData({...formData, business: {...formData.business, receiptFooter: e.target.value}} as AppConfig)}
                          className="w-full px-4 py-3 bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-700 rounded-xl focus:ring-2 ring-primary/20 text-sm font-mono dark:text-white outline-none min-h-[96px]"
                          placeholder="E.g. Thank you for your business!&#10;Please keep this receipt for returns."
                        />
                        <p className="text-xs text-slate-500">Printed after totals and payment details.</p>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="rounded-3xl border border-slate-100 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900 xl:sticky xl:top-4">
                  <div className="mb-4 flex items-center justify-between gap-3">
                    <div>
                      <h4 className="font-black text-slate-900 dark:text-white">Receipt Preview</h4>
                      <p className="text-xs font-bold text-slate-400">Updates as you edit these receipt settings.</p>
                    </div>
                    <span className="rounded-lg bg-primary/10 px-2 py-1 text-[10px] font-black uppercase tracking-widest text-primary">{receiptProfile.widthMm}mm</span>
                  </div>
                  <div className="mb-4 grid grid-cols-3 gap-2">
                    <div className="rounded-xl bg-slate-50 p-2 text-center dark:bg-slate-800">
                      <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">Paper</p>
                      <p className="mt-1 text-xs font-black text-slate-800 dark:text-white">{receiptProfile.label}</p>
                    </div>
                    <div className="rounded-xl bg-slate-50 p-2 text-center dark:bg-slate-800">
                      <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">Text</p>
                      <p className="mt-1 text-xs font-black text-slate-800 dark:text-white">{receiptPrint.fontSizePx}px</p>
                    </div>
                    <div className="rounded-xl bg-slate-50 p-2 text-center dark:bg-slate-800">
                      <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">Logo</p>
                      <p className="mt-1 text-xs font-black text-slate-800 dark:text-white">{receiptPrint.showLogo ? `${receiptPrint.logoMode} ${receiptPreviewLogoPx}px` : 'off'}</p>
                    </div>
                  </div>
                  <div className="overflow-x-auto rounded-2xl bg-slate-100 p-4 dark:bg-slate-950">
                    <div
                      key={receiptPreviewKey}
                      className="mx-auto bg-white p-4 font-mono text-black shadow-lg"
                      style={{
                        width: receiptProfile.isThermal ? `${Math.min(receiptProfile.widthMm * 3.2, 360)}px` : '360px',
                        fontSize: Math.max(10, Math.min(14, receiptProfile.fontSizePx)),
                      }}
                    >
                      <div className="text-center">
                        {receiptPrint.showLogo && receiptPrint.logoMode !== 'none' && (
                          formData.business?.logoUrl ? (
                            <img
                              src={formData.business.logoUrl}
                              alt="Receipt preview logo"
                              className="mx-auto mb-2 max-w-[80%] object-contain transition-all duration-150"
                              style={{ width: receiptPreviewLogoPx, height: receiptPreviewLogoPx }}
                            />
                          ) : (
                            <div
                              className="mx-auto mb-2 flex items-center justify-center rounded-full border-2 border-black font-black transition-all duration-150"
                              style={{
                                width: receiptPreviewLogoPx,
                                height: receiptPreviewLogoPx,
                                fontSize: Math.max(10, Math.round(receiptPreviewLogoPx / 3)),
                              }}
                            >
                              {logoInitials}
                            </div>
                          )
                        )}
                        <div className="text-[1.25em] font-black uppercase leading-tight">{formData.business?.name || "JIMMY'S POS"}</div>
                        {formData.business?.address && <div className="text-[0.9em]">{formData.business.address}</div>}
                        {formData.business?.phone && <div className="text-[0.9em]">{formData.business.phone}</div>}
                        <div className="my-2 border-b border-dashed border-black" />
                        <div className="font-black">TAX INVOICE</div>
                        <div>Order #PREVIEW</div>
                      </div>
                      {formData.business?.receiptHeader && (
                        <>
                          <div className="my-2 whitespace-pre-line text-center text-[0.9em]">{formData.business.receiptHeader}</div>
                          <div className="my-2 border-b border-dashed border-black" />
                        </>
                      )}
                      <div className="space-y-1">
                        <div className="flex border-b border-black pb-1 font-black">
                          <span className="flex-1">Item</span>
                          <span className="w-7 text-right">Qty</span>
                          <span className="w-16 text-right">Price</span>
                        </div>
                        <div className="flex">
                          <span className={`flex-1 pr-2 ${receiptPrint.itemNameMode === 'truncate' ? 'truncate' : ''}`}>Burger Combo with extra sauce</span>
                          <span className="w-7 text-right">1</span>
                          <span className="w-16 text-right">{formData.business?.currency || 'R'}119.00</span>
                        </div>
                        <div className="flex">
                          <span className="flex-1 pr-2">Coffee</span>
                          <span className="w-7 text-right">2</span>
                          <span className="w-16 text-right">{formData.business?.currency || 'R'}64.00</span>
                        </div>
                      </div>
                      <div className="my-2 border-b border-dashed border-black" />
                      <div className="flex justify-between text-[0.9em]"><span>Subtotal</span><span>{formData.business?.currency || 'R'}183.00</span></div>
                      <div className="flex justify-between text-[0.9em]"><span>{formData.business?.taxName || 'VAT'}</span><span>{formData.business?.currency || 'R'}23.87</span></div>
                      <div className="mt-1 flex justify-between border-t border-black pt-1 text-[1.1em] font-black"><span>TOTAL DUE</span><span>{formData.business?.currency || 'R'}183.00</span></div>
                      <div className="my-2 border-b border-dashed border-black" />
                      <div className="whitespace-pre-line text-center text-[0.9em]">{formData.business?.receiptFooter || 'Thank you for your business!\nPlease come again.'}</div>
                    </div>
                  </div>
                </div>
              </div>

              {printingReceiptTest && (
                <div className="receipt-settings-test-print-only hidden bg-white text-black font-mono leading-tight">
                  <div className="text-center">
                    {receiptPrint.showLogo && receiptPrint.logoMode !== 'none' && (
                      formData.business?.logoUrl ? (
                        <img src={formData.business.logoUrl} alt="Business logo" className="mx-auto mb-2 object-contain" style={{ maxHeight: receiptProfile.logoMaxHeight, maxWidth: '80%' }} />
                      ) : (
                        <div className="mx-auto mb-2 flex h-10 w-10 items-center justify-center rounded-full border-2 border-black text-sm font-black">{logoInitials}</div>
                      )
                    )}
                    <h1 className="font-bold text-[1.35em] uppercase mb-1">{formData.business?.name || "JIMMY'S POS"}</h1>
                    <div className="border-b border-black border-dashed my-2" />
                    <p className="font-bold">PRINTER TEST RECEIPT</p>
                    <p>{new Date().toLocaleString()}</p>
                  </div>
                  <div className="border-b border-black border-dashed my-2" />
                  <div className="space-y-1">
                    <div>Paper: {receiptProfile.label}</div>
                    <div>Width: {receiptProfile.widthMm}mm</div>
                    <div>Margin: {receiptPrint.marginMm}mm</div>
                    <div>Text size: {receiptPrint.fontSizePx}px</div>
                    <div>Logo: {receiptPrint.showLogo ? receiptPrint.logoMode : 'off'}</div>
                  </div>
                  <div className="border-b border-black border-dashed my-2" />
                  <div className="flex justify-between font-bold mb-1 border-b border-black pb-1">
                    <span className="flex-1">Item</span>
                    <span className="w-8 text-right">Qty</span>
                    <span className="w-20 text-right">Price</span>
                  </div>
                  <div className="receipt-row flex justify-between mb-1">
                    <span className="flex-1 pr-2 receipt-text">Long product name wrap check with modifiers</span>
                    <span className="w-8 text-right">1</span>
                    <span className="w-20 text-right">{formData.business?.currency || 'R'}99.00</span>
                  </div>
                  <div className="border-b border-black border-dashed my-2" />
                  <div className="text-center text-[11px]">Confirm logo, width, margins, and text are clear.</div>
                  <style dangerouslySetInnerHTML={{__html: buildReceiptPrintCss('receipt-settings-test-print-only', receiptPrint)}} />
                </div>
              )}
            </div>
          )}

          {activeTab === 'loyalty' && (
            <div className="space-y-6">
              {formData.business?.enableLoyalty ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                  <div className="space-y-2 sm:col-span-2">
                    <label className="text-xs font-black uppercase tracking-widest text-slate-500">Points Earned Per [Currency Spent]</label>
                    <div className="flex items-center gap-4">
                      <span className="text-sm font-bold text-slate-500">Earn 1 point for every</span>
                      <input
                        type="number"
                        min="1"
                        value={formData.business?.pointsEarnedPerCurrency || ''}
                        onChange={e => setFormData({...formData, business: {...formData.business, pointsEarnedPerCurrency: parseFloat(e.target.value)}} as AppConfig)}
                        className="w-32 px-4 py-3 bg-slate-50 dark:bg-slate-800 border-none rounded-xl focus:ring-2 ring-primary/20 text-sm font-bold text-center dark:text-white outline-none"
                        placeholder="10"
                      />
                      <span className="text-sm font-bold text-slate-500">{formData.business?.currency || 'USD'} spent.</span>
                    </div>
                  </div>

                  <div className="space-y-2 sm:col-span-2 pt-6 border-t border-slate-100 dark:border-slate-800">
                    <label className="text-xs font-black uppercase tracking-widest text-slate-500">Discount Redemption Value</label>
                    <div className="flex items-center gap-4">
                      <span className="text-sm font-bold text-slate-500">Redeem</span>
                      <input
                        type="number"
                        min="1"
                        value={formData.business?.pointsRequiredForDiscount || ''}
                        onChange={e => setFormData({...formData, business: {...formData.business, pointsRequiredForDiscount: parseFloat(e.target.value)}} as AppConfig)}
                        className="w-32 px-4 py-3 bg-slate-50 dark:bg-slate-800 border-none rounded-xl focus:ring-2 ring-primary/20 text-sm font-bold text-center dark:text-white outline-none"
                        placeholder="100"
                      />
                      <span className="text-sm font-bold text-slate-500">points for a discount of</span>
                      <input
                        type="number"
                        min="1"
                        value={formData.business?.discountAmountForPoints || ''}
                        onChange={e => setFormData({...formData, business: {...formData.business, discountAmountForPoints: parseFloat(e.target.value)}} as AppConfig)}
                        className="w-32 px-4 py-3 bg-slate-50 dark:bg-slate-800 border-none rounded-xl focus:ring-2 ring-primary/20 text-sm font-bold text-center dark:text-white outline-none"
                        placeholder="10"
                      />
                      <span className="text-sm font-bold text-slate-500">{formData.business?.currency || 'USD'}.</span>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="text-center p-12 bg-slate-50 dark:bg-slate-800/50 rounded-2xl border border-slate-100 dark:border-slate-800">
                  <Award className="w-12 h-12 text-slate-300 dark:text-slate-600 mx-auto mb-4" />
                  <h3 className="text-lg font-bold text-slate-800 dark:text-white mb-2">Loyalty is Disabled</h3>
                  <p className="text-sm text-slate-500 mb-6 max-w-md mx-auto">Enable the loyalty program in the Features tab to let your customers earn points on their purchases.</p>
                  <button
                    onClick={() => setActiveTab('features')}
                    className="px-6 py-2 bg-white dark:bg-slate-900 text-primary border border-slate-200 dark:border-slate-700 font-bold rounded-xl shadow-sm text-sm"
                  >
                    Go to Features
                  </button>
                </div>
              )}
            </div>
          )}

          {activeTab === 'discounts' && (
            <div className="space-y-8">
              <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50 p-5">
                <h3 className="text-lg font-black text-slate-900 dark:text-white">Automatic POS discounts</h3>
                <p className="mt-1 text-sm font-semibold text-slate-500 dark:text-slate-400">
                  The POS applies the best active discount for the selected buyer. Individual customer and staff discounts are set on their profiles.
                </p>
              </div>

              <div className="space-y-4">
                <div>
                  <h4 className="text-sm font-black uppercase tracking-widest text-slate-500">Staff role discounts</h4>
                  <p className="mt-1 text-xs font-semibold text-slate-500 dark:text-slate-400">Useful for standard staff meals or shift-drink policies.</p>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {discountRoles.map(role => (
                    <div key={role.id} className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
                      <label className="text-xs font-black uppercase tracking-widest text-slate-500">{role.label}</label>
                      <div className="mt-2 flex items-center gap-2">
                        <input
                          type="number"
                          min="0"
                          max="100"
                          step="0.01"
                          value={formData.business?.roleDiscounts?.[role.id] ?? ''}
                          onChange={e => setRoleDiscount(role.id, Number(e.target.value || 0))}
                          className="w-full px-4 py-3 bg-slate-50 dark:bg-slate-800 border-none rounded-xl focus:ring-2 ring-primary/20 text-sm font-bold dark:text-white outline-none"
                          placeholder="0"
                        />
                        <span className="text-sm font-black text-slate-400">%</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="space-y-4">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <h4 className="text-sm font-black uppercase tracking-widest text-slate-500">Happy hour</h4>
                    <p className="mt-1 text-xs font-semibold text-slate-500 dark:text-slate-400">Create time windows that discount everyone during active service periods.</p>
                  </div>
                  <button
                    type="button"
                    onClick={addHappyHourRule}
                    className="inline-flex items-center justify-center gap-2 rounded-xl bg-primary px-4 py-3 text-xs font-black uppercase tracking-widest text-white"
                  >
                    <Plus className="w-4 h-4" />
                    Add window
                  </button>
                </div>

                {(formData.business?.happyHourDiscounts || []).length === 0 && (
                  <div className="rounded-2xl border border-dashed border-slate-300 dark:border-slate-700 p-8 text-center">
                    <Clock className="mx-auto h-10 w-10 text-slate-300 dark:text-slate-600" />
                    <p className="mt-3 text-sm font-bold text-slate-500 dark:text-slate-400">No happy-hour windows configured.</p>
                  </div>
                )}

                {(formData.business?.happyHourDiscounts || []).map(rule => (
                  <div key={rule.id} className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 space-y-4">
                    <div className="flex items-center justify-between gap-3">
                      <label className="flex items-center gap-3">
                        <input
                          type="checkbox"
                          checked={Boolean(rule.enabled)}
                          onChange={e => updateHappyHourRule(rule.id, { enabled: e.target.checked })}
                          className="h-5 w-5 accent-primary"
                        />
                        <span className="text-sm font-black text-slate-900 dark:text-white">Active</span>
                      </label>
                      <button
                        type="button"
                        onClick={() => removeHappyHourRule(rule.id)}
                        className="rounded-xl p-2 text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-900/20"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
                      <div className="sm:col-span-2">
                        <label className="text-xs font-black uppercase tracking-widest text-slate-500">Name</label>
                        <input
                          type="text"
                          value={rule.name}
                          onChange={e => updateHappyHourRule(rule.id, { name: e.target.value })}
                          className="mt-2 w-full px-4 py-3 bg-slate-50 dark:bg-slate-800 border-none rounded-xl focus:ring-2 ring-primary/20 text-sm font-bold dark:text-white outline-none"
                        />
                      </div>
                      <div>
                        <label className="text-xs font-black uppercase tracking-widest text-slate-500">Discount</label>
                        <div className="mt-2 flex items-center gap-2">
                          <input
                            type="number"
                            min="0"
                            max="100"
                            step="0.01"
                            value={rule.discountPercent}
                            onChange={e => updateHappyHourRule(rule.id, { discountPercent: Math.max(0, Math.min(100, Number(e.target.value || 0))) })}
                            className="w-full px-4 py-3 bg-slate-50 dark:bg-slate-800 border-none rounded-xl focus:ring-2 ring-primary/20 text-sm font-bold dark:text-white outline-none"
                          />
                          <span className="text-sm font-black text-slate-400">%</span>
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <label className="text-xs font-black uppercase tracking-widest text-slate-500">Start</label>
                          <input
                            type="time"
                            value={rule.startTime}
                            onChange={e => updateHappyHourRule(rule.id, { startTime: e.target.value })}
                            className="mt-2 w-full px-3 py-3 bg-slate-50 dark:bg-slate-800 border-none rounded-xl focus:ring-2 ring-primary/20 text-sm font-bold dark:text-white outline-none"
                          />
                        </div>
                        <div>
                          <label className="text-xs font-black uppercase tracking-widest text-slate-500">End</label>
                          <input
                            type="time"
                            value={rule.endTime}
                            onChange={e => updateHappyHourRule(rule.id, { endTime: e.target.value })}
                            className="mt-2 w-full px-3 py-3 bg-slate-50 dark:bg-slate-800 border-none rounded-xl focus:ring-2 ring-primary/20 text-sm font-bold dark:text-white outline-none"
                          />
                        </div>
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {dayOptions.map(day => {
                        const selected = rule.days?.includes(day.id);
                        return (
                          <button
                            key={day.id}
                            type="button"
                            onClick={() => {
                              const nextDays = selected
                                ? (rule.days || []).filter(id => id !== day.id)
                                : [...(rule.days || []), day.id].sort();
                              updateHappyHourRule(rule.id, { days: nextDays });
                            }}
                            className={`rounded-xl px-3 py-2 text-[10px] font-black uppercase tracking-widest border transition-all ${
                              selected
                                ? 'bg-primary text-white border-primary'
                                : 'bg-slate-50 dark:bg-slate-800 text-slate-500 dark:text-slate-300 border-slate-200 dark:border-slate-700'
                            }`}
                          >
                            {day.label}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {activeTab === 'categories' && formData.categories && (
            <div className="space-y-6">
              <div className="flex justify-between items-center bg-slate-50 dark:bg-slate-800/50 p-4 rounded-2xl">
                <div>
                  <h3 className="font-bold text-slate-900 dark:text-white">Product Hierarchy</h3>
                  <p className="text-xs text-slate-500 font-medium">Manage Sections &gt; Categories &gt; Sub Categories</p>
                </div>
                <button onClick={addSection} className="flex items-center gap-2 px-4 py-2 bg-primary text-white rounded-xl font-bold hover:bg-primary/90 text-sm">
                  <Plus className="w-4 h-4" /> Section
                </button>
              </div>

              <div className="space-y-4">
                {Object.entries(formData.categories).map(([section, categories]) => (
                  <div key={section} className="border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden p-1">
                    <div className="bg-slate-50 dark:bg-slate-800/80 p-3 flex justify-between items-center rounded-xl mb-1">
                      <h4 className="font-black text-slate-800 dark:text-white text-sm uppercase tracking-wider">{section}</h4>
                      <div className="flex gap-2">
                        <button onClick={() => addCategory(section)} className="bg-primary/10 text-primary p-1.5 flex items-center gap-1 text-xs font-bold rounded-lg hover:bg-primary/20"><Plus className="w-3 h-3" /> Category</button>
                        <button onClick={() => removeSection(section)} className="text-red-500 p-1.5 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg"><Trash2 className="w-4 h-4" /></button>
                      </div>
                    </div>

                    <div className="space-y-2 p-2 pt-0">
                      {Object.entries(categories).map(([category, subcategories]) => (
                        <div key={category} className="bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 p-3 rounded-xl ml-4">
                          <div className="flex justify-between items-center mb-3 pb-2 border-b border-slate-50 dark:border-slate-800/50">
                            <h5 className="font-bold text-slate-700 dark:text-slate-300 text-sm">{category}</h5>
                            <div className="flex gap-2">
                              <button onClick={() => addSubCategory(section, category)} className="text-slate-400 hover:text-primary text-xs font-bold flex items-center gap-1"><Plus className="w-3 h-3"/> Subcategory</button>
                              <button onClick={() => removeCategory(section, category)} className="text-red-400 hover:text-red-600"><X className="w-4 h-4" /></button>
                            </div>
                          </div>
                          <div className="flex flex-wrap gap-2">
                            {subcategories.map(subCategory => (
                              <div key={subCategory} className="flex items-center gap-1.5 bg-slate-100 dark:bg-slate-800 px-3 py-1.5 rounded-lg text-xs font-bold text-slate-600 dark:text-slate-400">
                                {subCategory}
                                <button onClick={() => removeSubCategory(section, category, subCategory)} className="text-slate-400 hover:text-red-500 ml-1"><X className="w-3 h-3" /></button>
                              </div>
                            ))}
                            {subcategories.length === 0 && <span className="text-xs text-slate-400 font-medium italic">No subcategories</span>}
                          </div>
                        </div>
                      ))}
                      {Object.keys(categories).length === 0 && <div className="text-xs text-slate-400 font-medium italic p-2 ml-4">No categories</div>}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {activeTab === 'workstations' && (
            <div className="space-y-6">
              <div className="flex justify-between items-center">
                <div>
                  <h3 className="font-bold text-slate-900 dark:text-white">Workstations</h3>
                  <p className="text-xs text-slate-500 font-medium mt-0.5">Kitchen, bar, and other production stations</p>
                </div>
                <button
                  onClick={() => setWsModal({ isOpen: true, ws: { type: 'kitchen', status: 'active' } })}
                  className="flex items-center gap-2 px-4 py-2 bg-primary text-white rounded-xl font-bold hover:bg-primary/90 text-sm active:scale-95 transition-all"
                >
                  <Plus className="w-4 h-4" /> Add Workstation
                </button>
              </div>

              {workstations.length === 0 ? (
                <div className="py-12 text-center bg-slate-50 dark:bg-slate-800/50 rounded-2xl border border-dashed border-slate-200 dark:border-slate-700">
                  <ChefHat className="w-10 h-10 text-slate-300 dark:text-slate-600 mx-auto mb-3" />
                  <p className="text-sm font-bold text-slate-400 dark:text-slate-500">No workstations yet</p>
                  <p className="text-xs text-slate-400 mt-1">Add a Kitchen, Bar, or other station</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {workstations.map(ws => (
                    <div key={ws.id} className="flex items-center justify-between p-4 bg-slate-50 dark:bg-slate-800/50 rounded-2xl border border-slate-100 dark:border-slate-800">
                      <div className="flex items-center gap-3">
                        <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${
                          ws.type === 'kitchen' ? 'bg-orange-100 dark:bg-orange-900/30 text-orange-600 dark:text-orange-400' :
                          ws.type === 'bar' ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400' :
                          'bg-slate-100 dark:bg-slate-700 text-slate-500'
                        }`}>
                          <ChefHat className="w-5 h-5" />
                        </div>
                        <div>
                          <p className="font-bold text-slate-900 dark:text-white text-sm">{ws.name}</p>
                          <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 dark:text-slate-500">{ws.type} · {ws.status}</p>
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <button
                          onClick={() => setWsModal({ isOpen: true, ws })}
                          className="px-3 py-1.5 text-xs font-bold bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg hover:border-primary hover:text-primary transition-all"
                        >
                          Edit
                        </button>
                        <button
                          onClick={() => deleteWorkstation(ws.id)}
                          className="px-3 py-1.5 text-xs font-bold text-red-500 bg-red-50 dark:bg-red-900/20 rounded-lg hover:bg-red-100 transition-all"
                        >
                          Delete
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              <div className="mt-8 rounded-3xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/40 p-5 space-y-5">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex items-start gap-3">
                    <div className="w-10 h-10 rounded-2xl bg-primary/10 text-primary flex items-center justify-center shrink-0">
                      <Smartphone className="w-5 h-5" />
                    </div>
                    <div>
                      <h4 className="font-black text-slate-900 dark:text-white">Long-term mobile pairing</h4>
                      <p className="mt-1 text-xs font-semibold text-slate-500 max-w-2xl">
                        Admins and devs can bind this physical mobile/browser device to a workstation. It will prefer that workstation every time it signs in.
                      </p>
                    </div>
                  </div>
                  {currentDeviceAssignment && (
                    <span className="px-3 py-1 rounded-full bg-emerald-100 text-emerald-700 text-[10px] font-black uppercase tracking-widest">
                      This device assigned
                    </span>
                  )}
                </div>

                {!canAssignCompanionDevices ? (
                  <div className="rounded-2xl bg-amber-50 dark:bg-amber-900/10 border border-amber-200 dark:border-amber-900/40 p-4 text-sm font-bold text-amber-700 dark:text-amber-300">
                    Only admin and dev users can assign long-term companion devices.
                  </div>
                ) : workstations.length === 0 ? (
                  <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-4 text-sm font-bold text-slate-500">
                    Add a workstation first, then assign this device to it.
                  </div>
                ) : (
                  <div className="grid gap-3 lg:grid-cols-[1fr_220px_190px_auto]">
                    <div>
                      <label className="block text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2">Device name</label>
                      <input
                        value={companionDeviceName}
                        onChange={event => setCompanionDeviceName(event.target.value)}
                        placeholder="e.g. Bar phone"
                        className="w-full h-12 rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-4 text-sm font-bold text-slate-800 dark:text-slate-100 outline-none focus:ring-2 focus:ring-primary/30"
                      />
                      <p className="mt-1 text-[10px] font-semibold text-slate-400">Device ID: {companionDeviceId}</p>
                    </div>
                    <div>
                      <label className="block text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2">Workstation</label>
                      <select
                        value={companionWorkstationId}
                        onChange={event => setCompanionWorkstationId(event.target.value)}
                        className="w-full h-12 rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-4 text-sm font-bold text-slate-800 dark:text-slate-100 outline-none"
                      >
                        {workstations.map(ws => (
                          <option key={ws.id} value={ws.id}>{ws.name}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2">Default mode</label>
                      <select
                        value={companionDefaultMode}
                        onChange={event => setCompanionDefaultMode(event.target.value as typeof companionDefaultMode)}
                        className="w-full h-12 rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-4 text-sm font-bold text-slate-800 dark:text-slate-100 outline-none"
                      >
                        <option value="wireless_scanner">Scanner</option>
                        <option value="pole_display">Pole display</option>
                      </select>
                    </div>
                    <div className="flex items-end">
                      <button
                        type="button"
                        disabled={companionSaving}
                        onClick={saveCompanionAssignment}
                        className="w-full h-12 px-5 rounded-2xl bg-primary text-white text-xs font-black uppercase tracking-widest flex items-center justify-center gap-2 disabled:opacity-50"
                      >
                        {companionSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Smartphone className="w-4 h-4" />}
                        Assign
                      </button>
                    </div>
                  </div>
                )}

                <div className="space-y-2">
                  <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Assigned devices</p>
                  {companionAssignments.length === 0 ? (
                    <div className="rounded-2xl border border-dashed border-slate-200 dark:border-slate-800 p-4 text-sm font-bold text-slate-400 text-center">
                      No long-term devices assigned yet.
                    </div>
                  ) : companionAssignments.map(assignment => (
                    <div key={assignment.deviceId} className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-4">
                      <div>
                        <p className="text-sm font-black text-slate-900 dark:text-white">{assignment.deviceName}</p>
                        <p className="mt-0.5 text-[10px] font-bold uppercase tracking-widest text-slate-400">
                          {assignment.workstationName || 'Unknown workstation'} · {String(assignment.defaultMode || '').replace('_', ' ')}
                        </p>
                      </div>
                      {canAssignCompanionDevices && (
                        <button
                          type="button"
                          disabled={companionSaving}
                          onClick={() => revokeCompanionAssignment(assignment.deviceId)}
                          className="h-10 px-4 rounded-xl bg-rose-50 dark:bg-rose-900/20 text-rose-600 dark:text-rose-300 text-xs font-black uppercase tracking-widest"
                        >
                          Revoke
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {activeTab === 'tables' && (
            <div className="space-y-6">
              {/* Sections */}
              <div className="flex justify-between items-center">
                <div>
                  <h3 className="font-bold text-slate-900 dark:text-white">Floor Sections</h3>
                  <p className="text-xs text-slate-500 mt-0.5">Group tables by area (e.g. Main Floor, Patio, Bar)</p>
                </div>
                <button
                  onClick={() => setSectionModal({ isOpen: true, section: { order: sections.length, color: 'blue' } })}
                  className="flex items-center gap-2 px-4 py-2 bg-primary text-white rounded-xl font-bold hover:bg-primary/90 text-sm active:scale-95 transition-all"
                >
                  <Plus className="w-4 h-4" /> Add Section
                </button>
              </div>

              {sections.length === 0 ? (
                <div className="py-10 text-center bg-slate-50 dark:bg-slate-800/50 rounded-2xl border border-dashed border-slate-200 dark:border-slate-700">
                  <Layers className="w-8 h-8 text-slate-300 dark:text-slate-600 mx-auto mb-2" />
                  <p className="text-sm font-bold text-slate-400 dark:text-slate-500">No sections yet — add one to get started</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {sections.map(section => {
                    const sectionTables = tables.filter(t => t.sectionId === section.id);
                    const colorMap: Record<string, string> = {
                      blue: 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400',
                      emerald: 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400',
                      orange: 'bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-400',
                      violet: 'bg-violet-100 dark:bg-violet-900/30 text-violet-700 dark:text-violet-400',
                      red: 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400',
                      amber: 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400',
                    };
                    return (
                      <div key={section.id} className="border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden">
                        {/* Section header */}
                        <div className="flex items-center justify-between p-4 bg-slate-50 dark:bg-slate-800/50">
                          <div className="flex items-center gap-3">
                            <span className={`px-3 py-1 rounded-lg text-xs font-black uppercase tracking-widest ${colorMap[section.color || 'blue'] || colorMap.blue}`}>
                              {section.name}
                            </span>
                            <span className="text-xs text-slate-400">{sectionTables.length} table{sectionTables.length !== 1 ? 's' : ''}</span>
                          </div>
                          <div className="flex gap-2">
                            <button
                              onClick={() => setTableModal({ isOpen: true, table: { sectionId: section.id, status: 'active' } })}
                              className="flex items-center gap-1 px-3 py-1.5 bg-primary/10 text-primary rounded-lg text-xs font-bold hover:bg-primary/20 transition-all"
                            >
                              <Plus className="w-3 h-3" /> Table
                            </button>
                            <button
                              onClick={() => setSectionModal({ isOpen: true, section })}
                              className="px-3 py-1.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-xs font-bold text-slate-600 dark:text-slate-400 hover:border-primary hover:text-primary transition-all"
                            >
                              Edit
                            </button>
                            <button
                              onClick={() => deleteSection(section.id)}
                              className="px-3 py-1.5 bg-red-50 dark:bg-red-900/20 text-red-500 rounded-lg text-xs font-bold hover:bg-red-100 transition-all"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>

                        {/* Tables grid */}
                        {sectionTables.length > 0 && (
                          <div className="p-3 grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
                            {sectionTables.map(table => (
                              <div key={table.id} className={`flex items-center justify-between p-3 rounded-xl border ${table.status === 'inactive' ? 'opacity-50 border-slate-100 dark:border-slate-800' : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900'}`}>
                                <div>
                                  <p className="font-bold text-sm text-slate-900 dark:text-white">{table.label}</p>
                                  {table.capacity && <p className="text-[10px] text-slate-400">{table.capacity} seats</p>}
                                </div>
                                <div className="flex gap-1">
                                  <button onClick={() => setTableModal({ isOpen: true, table })} className="p-1 text-slate-400 hover:text-primary transition-colors">
                                    <Plus className="w-3.5 h-3.5 rotate-45" />
                                  </button>
                                  <button onClick={() => deleteTable(table.id)} className="p-1 text-slate-400 hover:text-red-500 transition-colors">
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </button>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                        {sectionTables.length === 0 && (
                          <div className="p-4 text-center text-xs text-slate-400 font-medium">
                            No tables in this section yet
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* Save button — hidden on workstations tab (it has its own save) */}
          {activeTab !== 'workstations' && activeTab !== 'tables' && activeTab !== 'ai' && (
          <div className="pt-6 border-t border-slate-100 dark:border-slate-800">
            <button
              onClick={handleSave}
              disabled={isSaving}
              className="px-8 py-4 bg-primary text-white rounded-2xl font-black text-sm uppercase tracking-widest flex items-center gap-3 hover:bg-primary/90 transition-all shadow-xl shadow-primary/20"
            >
              {isSaving ? <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <Save className="w-5 h-5" />}
              Save Changes
            </button>
          </div>
          )}
        </div>
      </div>

      {categoryInput.isOpen && (
        <div className="fixed inset-0 z-[150] bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 rounded-3xl p-6 shadow-2xl w-full max-w-sm">
            <h3 className="text-xl font-bold mb-4 text-slate-900 dark:text-white">
              Add {categoryInput.type.charAt(0).toUpperCase() + categoryInput.type.slice(1)}
            </h3>
            {categoryInput.section && <p className="text-xs text-slate-500 mb-2">in {categoryInput.section} {categoryInput.category ? `> ${categoryInput.category}` : ''}</p>}
            <input
              autoFocus
              type="text"
              value={inputValue}
              onChange={e => setInputValue(e.target.value)}
              className="w-full px-4 py-3 bg-slate-50 dark:bg-slate-800 border-none rounded-xl focus:ring-2 ring-primary/20 text-sm font-bold dark:text-white outline-none mb-6"
              placeholder={`Enter ${categoryInput.type} name...`}
              onKeyDown={e => { if (e.key === 'Enter') handleInputSubmit(); }}
            />
            <div className="flex gap-2 justify-end">
              <button
                onClick={() => setCategoryInput({ isOpen: false, type: 'section' })}
                className="px-4 py-2 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 font-bold rounded-xl"
              >
                Cancel
              </button>
              <button
                onClick={handleInputSubmit}
                disabled={!inputValue.trim()}
                className="px-4 py-2 bg-primary text-white font-bold rounded-xl disabled:opacity-50"
              >
                Add
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Workstation modal */}
      {wsModal.isOpen && (
        <div className="fixed inset-0 z-[150] bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 rounded-3xl p-6 shadow-2xl w-full max-w-sm">
            <h3 className="text-xl font-bold mb-4 text-slate-900 dark:text-white">
              {wsModal.ws?.id ? 'Edit Workstation' : 'New Workstation'}
            </h3>
            <form onSubmit={saveWorkstation} className="space-y-4">
              <div>
                <label className="text-[10px] font-black uppercase text-slate-400 tracking-widest px-1">Name</label>
                <input
                  required autoFocus type="text"
                  value={wsModal.ws?.name || ''}
                  onChange={e => setWsModal({ ...wsModal, ws: { ...wsModal.ws, name: e.target.value } })}
                  className="w-full px-4 py-3 bg-slate-50 dark:bg-slate-800 border-none rounded-xl focus:ring-2 ring-primary/20 text-sm font-bold dark:text-white outline-none mt-1"
                  placeholder="e.g. Main Kitchen, Bar, Sushi Station"
                />
              </div>
              <div>
                <label className="text-[10px] font-black uppercase text-slate-400 tracking-widest px-1">Type</label>
                <select
                  value={wsModal.ws?.type || 'kitchen'}
                  onChange={e => setWsModal({ ...wsModal, ws: { ...wsModal.ws, type: e.target.value as Workstation['type'] } })}
                  className="w-full px-4 py-3 bg-slate-50 dark:bg-slate-800 border-none rounded-xl focus:ring-2 ring-primary/20 text-sm font-bold dark:text-white outline-none mt-1"
                >
                  <option value="kitchen">Kitchen</option>
                  <option value="bar">Bar</option>
                  <option value="other">Other</option>
                </select>
              </div>
              <div>
                <label className="text-[10px] font-black uppercase text-slate-400 tracking-widest px-1">Status</label>
                <select
                  value={wsModal.ws?.status || 'active'}
                  onChange={e => setWsModal({ ...wsModal, ws: { ...wsModal.ws, status: e.target.value as Workstation['status'] } })}
                  className="w-full px-4 py-3 bg-slate-50 dark:bg-slate-800 border-none rounded-xl focus:ring-2 ring-primary/20 text-sm font-bold dark:text-white outline-none mt-1"
                >
                  <option value="active">Active</option>
                  <option value="inactive">Inactive</option>
                </select>
              </div>
              <div className="flex gap-2 pt-2">
                <button type="button" onClick={() => setWsModal({ isOpen: false, ws: null })} className="flex-1 py-3 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 font-bold rounded-xl">Cancel</button>
                <button type="submit" disabled={wsSaving} className="flex-1 py-3 bg-primary text-white font-bold rounded-xl flex items-center justify-center gap-2 disabled:opacity-50">
                  {wsSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />} Save
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Section modal */}
      {sectionModal.isOpen && (
        <div className="fixed inset-0 z-[150] bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 rounded-3xl p-6 shadow-2xl w-full max-w-sm">
            <h3 className="text-xl font-bold mb-4 text-slate-900 dark:text-white">
              {sectionModal.section?.id ? 'Edit Section' : 'New Section'}
            </h3>
            <form onSubmit={saveSection} className="space-y-4">
              <div>
                <label className="text-[10px] font-black uppercase text-slate-400 tracking-widest px-1">Section Name</label>
                <input
                  required autoFocus type="text"
                  value={sectionModal.section?.name || ''}
                  onChange={e => setSectionModal({ ...sectionModal, section: { ...sectionModal.section, name: e.target.value } })}
                  className="w-full px-4 py-3 bg-slate-50 dark:bg-slate-800 border-none rounded-xl focus:ring-2 ring-primary/20 text-sm font-bold dark:text-white outline-none mt-1"
                  placeholder="e.g. Main Floor, Patio, Bar"
                />
              </div>
              <div>
                <label className="text-[10px] font-black uppercase text-slate-400 tracking-widest px-1">Colour</label>
                <div className="flex gap-2 mt-1 flex-wrap">
                  {['blue', 'emerald', 'orange', 'violet', 'red', 'amber'].map(c => (
                    <button
                      key={c} type="button"
                      onClick={() => setSectionModal({ ...sectionModal, section: { ...sectionModal.section, color: c } })}
                      className={`w-8 h-8 rounded-lg border-2 transition-all ${sectionModal.section?.color === c ? 'border-slate-900 dark:border-white scale-110' : 'border-transparent'} bg-${c}-400`}
                    />
                  ))}
                </div>
              </div>
              <div className="flex gap-2 pt-2">
                <button type="button" onClick={() => setSectionModal({ isOpen: false, section: null })} className="flex-1 py-3 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 font-bold rounded-xl">Cancel</button>
                <button type="submit" disabled={tableSaving} className="flex-1 py-3 bg-primary text-white font-bold rounded-xl flex items-center justify-center gap-2 disabled:opacity-50">
                  {tableSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />} Save
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Table modal */}
      {tableModal.isOpen && (
        <div className="fixed inset-0 z-[150] bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 rounded-3xl p-6 shadow-2xl w-full max-w-sm">
            <h3 className="text-xl font-bold mb-4 text-slate-900 dark:text-white">
              {tableModal.table?.id ? 'Edit Table' : 'New Table'}
            </h3>
            <form onSubmit={saveTable} className="space-y-4">
              <div>
                <label className="text-[10px] font-black uppercase text-slate-400 tracking-widest px-1">Table Label</label>
                <input
                  required autoFocus type="text"
                  value={tableModal.table?.label || ''}
                  onChange={e => setTableModal({ ...tableModal, table: { ...tableModal.table, label: e.target.value } })}
                  className="w-full px-4 py-3 bg-slate-50 dark:bg-slate-800 border-none rounded-xl focus:ring-2 ring-primary/20 text-sm font-bold dark:text-white outline-none mt-1"
                  placeholder="e.g. Table 1, Bar Seat 3, Booth A"
                />
              </div>
              <div>
                <label className="text-[10px] font-black uppercase text-slate-400 tracking-widest px-1">Section</label>
                <select
                  required
                  value={tableModal.table?.sectionId || ''}
                  onChange={e => setTableModal({ ...tableModal, table: { ...tableModal.table, sectionId: e.target.value } })}
                  className="w-full px-4 py-3 bg-slate-50 dark:bg-slate-800 border-none rounded-xl focus:ring-2 ring-primary/20 text-sm font-bold dark:text-white outline-none mt-1"
                >
                  <option value="">Select section...</option>
                  {sections.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </div>
              <div>
                <label className="text-[10px] font-black uppercase text-slate-400 tracking-widest px-1">Capacity (optional)</label>
                <input
                  type="number" min="1"
                  value={tableModal.table?.capacity || ''}
                  onChange={e => setTableModal({ ...tableModal, table: { ...tableModal.table, capacity: parseInt(e.target.value) || undefined } })}
                  className="w-full px-4 py-3 bg-slate-50 dark:bg-slate-800 border-none rounded-xl focus:ring-2 ring-primary/20 text-sm font-bold dark:text-white outline-none mt-1"
                  placeholder="e.g. 4"
                />
              </div>
              <div>
                <label className="text-[10px] font-black uppercase text-slate-400 tracking-widest px-1">Status</label>
                <select
                  value={tableModal.table?.status || 'active'}
                  onChange={e => setTableModal({ ...tableModal, table: { ...tableModal.table, status: e.target.value as 'active' | 'inactive' } })}
                  className="w-full px-4 py-3 bg-slate-50 dark:bg-slate-800 border-none rounded-xl focus:ring-2 ring-primary/20 text-sm font-bold dark:text-white outline-none mt-1"
                >
                  <option value="active">Active</option>
                  <option value="inactive">Inactive</option>
                </select>
              </div>
              <div className="flex gap-2 pt-2">
                <button type="button" onClick={() => setTableModal({ isOpen: false, table: null })} className="flex-1 py-3 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 font-bold rounded-xl">Cancel</button>
                <button type="submit" disabled={tableSaving} className="flex-1 py-3 bg-primary text-white font-bold rounded-xl flex items-center justify-center gap-2 disabled:opacity-50">
                  {tableSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />} Save
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
