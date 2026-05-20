import type { ReceiptPrintSettings } from '../types';

export const RECEIPT_PAPER_OPTIONS = [
  { id: '58mm', label: '58 mm thermal', widthMm: 58, pageSize: '58mm auto' },
  { id: '80mm', label: '80 mm thermal', widthMm: 80, pageSize: '80mm auto' },
  { id: '112mm', label: '112 mm kitchen / wide roll', widthMm: 112, pageSize: '112mm auto' },
  { id: 'a4', label: 'A4 office printer', widthMm: 210, pageSize: 'A4' },
  { id: 'letter', label: 'Letter office printer', widthMm: 216, pageSize: 'letter' },
  { id: 'custom', label: 'Custom width', widthMm: 80, pageSize: 'auto' },
] as const;

const DEFAULT_RECEIPT_PRINT_SETTINGS: Required<ReceiptPrintSettings> = {
  paperSize: '80mm',
  customPaperWidthMm: 80,
  marginMm: 4,
  fontSizePx: 12,
  showLogo: true,
  logoMode: 'standard',
  itemNameMode: 'wrap',
};

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

export function normalizeReceiptPrintSettings(settings?: ReceiptPrintSettings | null) {
  const merged = { ...DEFAULT_RECEIPT_PRINT_SETTINGS, ...(settings || {}) };
  return {
    ...merged,
    customPaperWidthMm: clamp(Number(merged.customPaperWidthMm) || 80, 40, 216),
    marginMm: clamp(Number(merged.marginMm) || 0, 0, 12),
    fontSizePx: clamp(Number(merged.fontSizePx) || 12, 9, 16),
  };
}

export function getReceiptPaperProfile(settings?: ReceiptPrintSettings | null) {
  const normalized = normalizeReceiptPrintSettings(settings);
  const option = RECEIPT_PAPER_OPTIONS.find(item => item.id === normalized.paperSize) || RECEIPT_PAPER_OPTIONS[1];
  const widthMm = normalized.paperSize === 'custom' ? normalized.customPaperWidthMm : option.widthMm;
  const pageSize = normalized.paperSize === 'custom' ? `${widthMm}mm auto` : option.pageSize;
  const isThermal = !['a4', 'letter'].includes(normalized.paperSize);

  return {
    ...normalized,
    label: option.label,
    widthMm,
    pageSize,
    isThermal,
    contentWidth: isThermal ? `${widthMm}mm` : '100%',
    maxWidth: isThermal ? `${widthMm}mm` : '190mm',
    logoMaxHeight:
      normalized.logoMode === 'large' ? '24mm' :
      normalized.logoMode === 'compact' ? '10mm' :
      normalized.logoMode === 'none' ? '0mm' :
      '16mm',
  };
}

export function buildReceiptPrintCss(scopeClass: string, settings?: ReceiptPrintSettings | null) {
  const profile = getReceiptPaperProfile(settings);
  const bodyWidth = profile.isThermal ? `${profile.widthMm}mm` : '100%';

  return `
    @page {
      size: ${profile.pageSize};
      margin: ${profile.marginMm}mm;
    }
    @media print {
      html, body {
        width: ${bodyWidth};
        background: #fff !important;
        -webkit-print-color-adjust: exact;
        print-color-adjust: exact;
      }
      body * { visibility: hidden; }
      .${scopeClass}, .${scopeClass} * { visibility: visible; }
      .${scopeClass} {
        display: flex !important;
        position: absolute;
        left: 0;
        top: 0;
        width: ${profile.contentWidth};
        max-width: ${profile.maxWidth};
        padding: 0;
        margin: 0 auto;
        box-shadow: none !important;
        font-size: ${profile.fontSizePx}px;
      }
      .${scopeClass} .receipt-row {
        break-inside: avoid;
        page-break-inside: avoid;
      }
      .${scopeClass} .receipt-text {
        overflow-wrap: anywhere;
        word-break: normal;
      }
      .${scopeClass} img {
        print-color-adjust: exact;
        -webkit-print-color-adjust: exact;
      }
    }
  `;
}
