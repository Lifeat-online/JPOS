import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { TenderModal } from '../../src/components/modals/TenderModal.tsx';

describe('TenderModal', () => {
  it('requires and returns card terminal confirmation details', async () => {
    const onConfirm = vi.fn();

    const Harness = () => {
      const [tenderedAmount, setTenderedAmount] = useState('');
      return (
        <TenderModal
          method="card"
          cartTotal={100}
          tenderedAmount={tenderedAmount}
          cardOverageAction="tip"
          isProcessing={false}
          onTenderedChange={setTenderedAmount}
          onCardOverageChange={vi.fn()}
          onConfirm={onConfirm}
          onClose={vi.fn()}
        />
      );
    };

    render(<Harness />);

    const confirmButton = screen.getByRole('button', { name: /Confirm/i });
    expect(confirmButton).toBeDisabled();

    fireEvent.change(screen.getByRole('spinbutton'), {
      target: { value: '100' },
    });
    expect(confirmButton).toBeDisabled();

    fireEvent.change(screen.getByPlaceholderText(/Yoco-Front/i), {
      target: { value: 'Yoco-Front-01' },
    });
    fireEvent.change(screen.getByPlaceholderText(/Optional terminal reference/i), {
      target: { value: 'YOCO-RECEIPT-123' },
    });
    fireEvent.change(screen.getByPlaceholderText(/Optional auth code/i), {
      target: { value: 'AUTH-123' },
    });
    fireEvent.click(confirmButton);

    await waitFor(() => {
      expect(onConfirm).toHaveBeenCalledWith({
        provider: 'yoco',
        providerDeviceId: 'Yoco-Front-01',
        providerReference: 'YOCO-RECEIPT-123',
        authorizationCode: 'AUTH-123',
        providerStatus: 'approved',
        providerNote: null,
      });
    });
  });
});
