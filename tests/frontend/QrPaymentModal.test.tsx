import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { QrPaymentModal } from '../../src/components/modals/QrPaymentModal.tsx';

describe('QrPaymentModal', () => {
  it('captures provider reference details for checkout', async () => {
    const onConfirm = vi.fn();
    render(
      <QrPaymentModal
        isOpen
        cartTotal={123.45}
        isProcessing={false}
        onConfirm={onConfirm}
        onClose={vi.fn()}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: /Yoco Link/i }));
    fireEvent.change(screen.getByPlaceholderText(/Yoco receipt/i), {
      target: { value: 'YOCO-LINK-123' },
    });
    fireEvent.change(screen.getByPlaceholderText(/Optional link/i), {
      target: { value: 'https://pay.yoco.example/link/123' },
    });
    fireEvent.change(screen.getByPlaceholderText(/Optional settlement/i), {
      target: { value: 'Paid on customer phone' },
    });
    fireEvent.click(screen.getByRole('button', { name: /Capture/i }));

    await waitFor(() => {
      expect(onConfirm).toHaveBeenCalledWith({
        provider: 'yoco_payment_link',
        providerReference: 'YOCO-LINK-123',
        providerStatus: 'confirmed',
        providerNote: 'Paid on customer phone',
        qrPayload: 'https://pay.yoco.example/link/123',
      });
    });
  });
});
