import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { BnplPaymentModal } from '../../src/components/modals/BnplPaymentModal.tsx';

describe('BnplPaymentModal', () => {
  it('captures BNPL provider approval details for checkout', async () => {
    const onConfirm = vi.fn();
    render(
      <BnplPaymentModal
        isOpen
        cartTotal={850}
        isProcessing={false}
        onConfirm={onConfirm}
        onClose={vi.fn()}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: /PayFlex/i }));
    fireEvent.change(screen.getByPlaceholderText(/approval, order/i), {
      target: { value: 'PF-APPROVED-123' },
    });
    fireEvent.change(screen.getByPlaceholderText(/Optional approval/i), {
      target: { value: 'Approved on customer phone' },
    });
    fireEvent.click(screen.getByRole('button', { name: /Capture/i }));

    await waitFor(() => {
      expect(onConfirm).toHaveBeenCalledWith({
        provider: 'payflex',
        providerReference: 'PF-APPROVED-123',
        providerStatus: 'approved',
        providerNote: 'Approved on customer phone',
      });
    });
  });
});
