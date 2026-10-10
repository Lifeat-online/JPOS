import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { CsvImportCard } from '../../src/components/CsvImportCard.tsx';
import type { BatchMutationResult } from '../../src/types.ts';

const result = (over: Partial<BatchMutationResult> = {}): BatchMutationResult => ({
  dryRun: true, created: 2, updated: 1, skipped: 0, errors: [], rows: [], ...over,
});

function setup(over: Partial<React.ComponentProps<typeof CsvImportCard>> = {}) {
  const onPreview = vi.fn().mockResolvedValue(result());
  const onImport = vi.fn().mockResolvedValue(result({ dryRun: false }));
  render(
    <CsvImportCard title="Import things" templateFilename="t.csv" templateCsv="a,b" onPreview={onPreview} onImport={onImport} {...over} />,
  );
  return { onPreview, onImport };
}

function chooseFile(content: string, name = 'rows.csv') {
  const input = screen.getByTestId('csv-file-input') as HTMLInputElement;
  const file = new File([content], name, { type: 'text/csv' });
  fireEvent.change(input, { target: { files: [file] } });
}

describe('CsvImportCard', () => {
  it('shows filename and row count after choosing a file', async () => {
    setup();
    chooseFile('name,price\nA,1\nB,2\n');
    expect(await screen.findByText(/rows\.csv · 2 rows/)).toBeTruthy();
  });

  it('enables Import only after a preview of the current csv', async () => {
    const { onPreview } = setup();
    chooseFile('name\nA\nB\nC');
    await screen.findByText(/3 rows/);
    expect((screen.getByRole('button', { name: 'Import' }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: 'Preview' }));
    await screen.findByText('Will create 2 · update 1 · skip 0');
    expect(onPreview).toHaveBeenCalledWith('name\nA\nB\nC');
    expect((screen.getByRole('button', { name: 'Import 3 rows' }) as HTMLButtonElement).disabled).toBe(false);

    fireEvent.click(screen.getByRole('button', { name: 'Paste CSV instead' }));
    fireEvent.change(screen.getByLabelText('CSV text'), { target: { value: 'name\nZ' } });
    expect((screen.getByRole('button', { name: 'Import' }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('renders row errors from the preview', async () => {
    setup({ onPreview: vi.fn().mockResolvedValue(result({ errors: [{ row: 3, message: 'Bad email' }] as any })) });
    fireEvent.click(screen.getByRole('button', { name: 'Paste CSV instead' }));
    fireEvent.change(screen.getByLabelText('CSV text'), { target: { value: 'h\nx' } });
    fireEvent.click(screen.getByRole('button', { name: 'Preview' }));
    expect(await screen.findByText('Row 3')).toBeTruthy();
    expect(screen.getByText('Bad email')).toBeTruthy();
  });

  it('rejects files over 2 MB', async () => {
    const { onPreview } = setup();
    const input = screen.getByTestId('csv-file-input') as HTMLInputElement;
    const big = new File(['x'], 'big.csv', { type: 'text/csv' });
    Object.defineProperty(big, 'size', { value: 2 * 1024 * 1024 + 1 });
    fireEvent.change(input, { target: { files: [big] } });
    expect((await screen.findByRole('alert')).textContent).toMatch(/2 MB/);
    expect((screen.getByRole('button', { name: 'Preview' }) as HTMLButtonElement).disabled).toBe(true);
    expect(onPreview).not.toHaveBeenCalled();
  });

  it('imports and resets after a successful preview', async () => {
    const onImported = vi.fn();
    const { onImport } = setup({ onImported });
    chooseFile('h\nA');
    await screen.findByText(/1 row/);
    fireEvent.click(screen.getByRole('button', { name: 'Preview' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Import 3 rows' }));
    await waitFor(() => expect(onImported).toHaveBeenCalled());
    expect(onImport).toHaveBeenCalledWith('h\nA');
    expect(screen.queryByText(/rows\.csv/)).toBeNull();
  });
});
