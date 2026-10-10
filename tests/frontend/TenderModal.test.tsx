import type React from 'react';
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

  describe('keyboard', () => {
    const setup = (overrides: Partial<React.ComponentProps<typeof TenderModal>> = {}) => {
      const onConfirm = vi.fn();
      const onClose = vi.fn();
      render(
        <TenderModal
          method="cash"
          cartTotal={50}
          tenderedAmount={50}
          cardOverageAction="tip"
          isProcessing={false}
          onTenderedChange={vi.fn()}
          onCardOverageChange={vi.fn()}
          onConfirm={onConfirm}
          onClose={onClose}
          {...overrides}
        />
      );
      return { onConfirm, onClose };
    };

    it('closes on Escape', () => {
      const { onClose } = setup();
      fireEvent.keyDown(window, { key: 'Escape' });
      expect(onClose).toHaveBeenCalledTimes(1);
    });

    it('confirms on Enter when payment is sufficient', () => {
      const { onConfirm } = setup();
      fireEvent.keyDown(screen.getByRole('spinbutton'), { key: 'Enter' });
      expect(onConfirm).toHaveBeenCalledTimes(1);
    });

    it('does not confirm on Enter when amount is insufficient', () => {
      const { onConfirm } = setup({ tenderedAmount: 10 });
      fireEvent.keyDown(window, { key: 'Enter' });
      expect(onConfirm).not.toHaveBeenCalled();
    });

    it('ignores Enter from a focused button', () => {
      const { onConfirm } = setup();
      fireEvent.keyDown(screen.getByRole('button', { name: /Confirm/i }), { key: 'Enter' });
      expect(onConfirm).not.toHaveBeenCalled();
    });

    it('ignores Enter and Escape while processing', () => {
      const { onConfirm, onClose } = setup({ isProcessing: true });
      fireEvent.keyDown(window, { key: 'Enter' });
      fireEvent.keyDown(window, { key: 'Escape' });
      expect(onConfirm).not.toHaveBeenCalled();
      expect(onClose).not.toHaveBeenCalled();
    });
  });
});
