import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { SplitPaymentModal } from '../../src/components/modals/SplitPaymentModal.tsx';

describe('SplitPaymentModal restaurant bill split', () => {
  it('turns selected person shares into tender payments with split evidence', async () => {
    const onConfirm = vi.fn();

    render(
      <SplitPaymentModal
        isOpen
        cartTotal={90}
        isProcessing={false}
        onConfirm={onConfirm}
        onClose={vi.fn()}
        billSplitEnabled
        billSplitItems={[
          { cartItemId: 'line_1', name: 'Pizza', price: 60, quantity: 1 },
          { cartItemId: 'line_2', name: 'Juice', price: 30, quantity: 1 },
        ]}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: /Person 1 R45\.00/i }));
    expect(screen.getByRole('spinbutton', { name: /Amount to pay/i })).toHaveValue(45);
    fireEvent.click(screen.getByRole('button', { name: /Add Payment/i }));

    fireEvent.click(screen.getByRole('button', { name: /Person 2 R45\.00/i }));
    expect(screen.getByRole('spinbutton', { name: /Amount to pay/i })).toHaveValue(45);
    fireEvent.click(screen.getByRole('button', { name: /Add Payment/i }));

    fireEvent.click(screen.getByRole('button', { name: /Complete Sale/i }));

    await waitFor(() => {
      expect(onConfirm).toHaveBeenCalledWith([
        expect.objectContaining({
          method: 'cash',
          amount: 45,
          billSplitMode: 'person',
          billSplitLabel: 'Person 1',
          providerNote: 'Person split: Person 1',
        }),
        expect.objectContaining({
          method: 'cash',
          amount: 45,
          billSplitMode: 'person',
          billSplitLabel: 'Person 2',
          providerNote: 'Person split: Person 2',
        }),
      ]);
    });
  });
});
