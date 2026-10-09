import React from 'react';
import { Download, FileUp, Loader2, Upload } from 'lucide-react';
import type { BatchMutationResult } from '../types';
import { toast } from '../utils/toast';
import { errorMessage } from '../utils/errorMessage';

export const MAX_CSV_FILE_BYTES = 2 * 1024 * 1024;
const MAX_ERRORS_SHOWN = 50;

export interface CsvImportCardProps {
  title: string;
  description?: string;
  templateFilename: string;
  templateCsv: string;
  onPreview: (csv: string) => Promise<BatchMutationResult>;
  onImport: (csv: string) => Promise<BatchMutationResult>;
  onImported?: (result: BatchMutationResult) => void | Promise<void>;
  disabled?: boolean;
}

export function saveCsvFile(csv: string, filename: string, mimeType = 'text/csv;charset=utf-8') {
  const url = URL.createObjectURL(new Blob([csv], { type: mimeType }));
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}

function countRows(csv: string) {
  const lines = csv.split(/\r?\n/).filter(line => line.trim());
  return Math.max(0, lines.length - 1);
}

const buttonBase = 'inline-flex min-h-[44px] items-center justify-center gap-2 rounded-lg px-4 py-2 text-xs font-black uppercase tracking-widest disabled:opacity-40';

export function CsvImportCard({
  title,
  description,
  templateFilename,
  templateCsv,
  onPreview,
  onImport,
  onImported,
  disabled = false,
}: CsvImportCardProps) {
  const inputId = React.useId();
  const [csv, setCsv] = React.useState('');
  const [fileName, setFileName] = React.useState<string | null>(null);
  const [showPaste, setShowPaste] = React.useState(false);
  const [preview, setPreview] = React.useState<{ csv: string; result: BatchMutationResult } | null>(null);
  const [busy, setBusy] = React.useState<'preview' | 'import' | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  const rowCount = countRows(csv);
  const previewCurrent = preview && preview.csv === csv ? preview.result : null;
  const importable = previewCurrent ? previewCurrent.created + previewCurrent.updated : 0;

  const updateCsv = (value: string, name: string | null) => {
    setCsv(value);
    setFileName(name);
    setPreview(null);
    setError(null);
  };

  const handleFile = (event: React.ChangeEvent<HTMLInputElement>) => {
    const input = event.target;
    const file = input.files?.[0];
    if (!file) return;
    if (file.size > MAX_CSV_FILE_BYTES) {
      setError('That file is larger than 2 MB. Please split it into smaller files and try again.');
      input.value = '';
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      updateCsv(typeof reader.result === 'string' ? reader.result : '', file.name);
      input.value = '';
    };
    reader.onerror = () => {
      setError("Couldn't read that file. Please try again.");
      input.value = '';
    };
    reader.readAsText(file);
  };

  const runPreview = async () => {
    setBusy('preview');
    setError(null);
    const submitted = csv;
    try {
      const result = await onPreview(submitted);
      setPreview({ csv: submitted, result });
    } catch (err) {
      setError(errorMessage(err, "Couldn't check the file. Please try again."));
    } finally {
      setBusy(null);
    }
  };

  const runImport = async () => {
    if (!previewCurrent) return;
    setBusy('import');
    setError(null);
    try {
      const result = await onImport(csv);
      toast.success(`${title}: ${result.created} created, ${result.updated} updated, ${result.skipped} skipped.`);
      updateCsv('', null);
      setShowPaste(false);
      await onImported?.(result);
    } catch (err) {
      setError(errorMessage(err, 'Import failed. Please try again.'));
    } finally {
      setBusy(null);
    }
  };

  const errors = previewCurrent?.errors ?? [];

  return (
    <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
      <h3 className="text-sm font-black text-slate-900 dark:text-white">{title}</h3>
      {description && <p className="mt-1 text-xs font-bold text-slate-500 dark:text-slate-400">{description}</p>}

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <input
          id={inputId}
          type="file"
          accept=".csv,text/csv"
          className="sr-only"
          onChange={handleFile}
          disabled={disabled || busy !== null}
          data-testid="csv-file-input"
        />
        <label
          htmlFor={inputId}
          className={`${buttonBase} cursor-pointer bg-slate-900 text-white focus-within:ring-4 focus-within:ring-primary/30 dark:bg-white dark:text-slate-900 ${disabled || busy ? 'pointer-events-none opacity-40' : ''}`}
        >
          <FileUp className="h-4 w-4" />
          Choose CSV file
        </label>
        <button
          type="button"
          onClick={() => saveCsvFile(templateCsv, templateFilename)}
          className={`${buttonBase} border border-slate-200 text-slate-600 dark:border-slate-700 dark:text-slate-300`}
        >
          <Download className="h-4 w-4" />
          Download template
        </button>
      </div>

      {csv.trim() && (
        <p className="mt-3 text-xs font-bold text-slate-600 dark:text-slate-300">
          {fileName ? `${fileName} · ` : ''}{rowCount} row{rowCount === 1 ? '' : 's'}
        </p>
      )}

      <div className="mt-3">
        <button
          type="button"
          onClick={() => setShowPaste(value => !value)}
          aria-expanded={showPaste}
          className="min-h-[44px] text-xs font-black text-primary underline-offset-2 hover:underline"
        >
          Paste CSV instead
        </button>
        {showPaste && (
          <textarea
            aria-label="CSV text"
            value={csv}
            onChange={event => updateCsv(event.target.value, null)}
            className="mt-1 h-32 w-full resize-none rounded-lg border border-slate-200 bg-slate-50 p-3 font-mono text-xs font-semibold text-slate-700 outline-none focus:ring-4 focus:ring-primary/10 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-200"
          />
        )}
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={() => void runPreview()}
          disabled={disabled || busy !== null || !csv.trim()}
          className={`${buttonBase} border border-slate-200 text-slate-600 dark:border-slate-700 dark:text-slate-300`}
        >
          {busy === 'preview' ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          Preview
        </button>
        <button
          type="button"
          onClick={() => void runImport()}
          disabled={disabled || busy !== null || !previewCurrent || importable === 0}
          className={`${buttonBase} bg-primary text-white`}
        >
          {busy === 'import' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
          {previewCurrent ? `Import ${importable} row${importable === 1 ? '' : 's'}` : 'Import'}
        </button>
      </div>

      {previewCurrent && (
        <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs font-bold text-slate-600 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-300">
          <p>Will create {previewCurrent.created} · update {previewCurrent.updated} · skip {previewCurrent.skipped}</p>
          {errors.length > 0 && (
            <div className="mt-2 max-h-48 overflow-y-auto">
              <table className="w-full text-left text-rose-600 dark:text-rose-300">
                <tbody>
                  {errors.slice(0, MAX_ERRORS_SHOWN).map((rowError, index) => (
                    <tr key={`${rowError.row}:${index}`}>
                      <td className="whitespace-nowrap py-0.5 pr-3 align-top">Row {rowError.row}</td>
                      <td className="py-0.5">{rowError.message}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {errors.length > MAX_ERRORS_SHOWN && (
                <p className="mt-1 text-slate-500 dark:text-slate-400">and {errors.length - MAX_ERRORS_SHOWN} more</p>
              )}
            </div>
          )}
        </div>
      )}

      {error && (
        <div role="alert" className="mt-3 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-bold text-rose-700 dark:border-rose-900/50 dark:bg-rose-900/20 dark:text-rose-300">
          {error}
        </div>
      )}
    </section>
  );
}
