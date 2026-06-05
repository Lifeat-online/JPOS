import { describe, it, expect, vi } from 'vitest';
import { screen, fireEvent } from '@testing-library/react';
import { renderWithRouter } from './test-utils.tsx';
import { LoginModal } from '../../src/components/LoginModal.tsx';

describe('LoginModal', () => {
  it('renders correctly and submits with valid values', async () => {
    const onSubmit = vi.fn(() => Promise.resolve());
    const onClose = vi.fn();

    renderWithRouter(<LoginModal isOpen={true} onClose={onClose} onSubmit={onSubmit} error={null} isLoading={false} />);

    fireEvent.change(screen.getByLabelText(/Email Address/i), { target: { value: 'user@example.com' } });
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'secret123' } });
    fireEvent.change(screen.getByLabelText(/2FA Code/i), { target: { value: '123456' } });
    fireEvent.click(screen.getByRole('button', { name: /sign in/i }));

    expect(onSubmit).toHaveBeenCalledWith('user@example.com', 'secret123', '123456');
  });

  it('closes when backdrop is clicked', async () => {
    const onSubmit = vi.fn(() => Promise.resolve());
    const onClose = vi.fn();

    renderWithRouter(<LoginModal isOpen={true} onClose={onClose} onSubmit={onSubmit} error={null} isLoading={false} />);
    fireEvent.click(screen.getByRole('button', { name: /close/i }));

    expect(onClose).toHaveBeenCalled();
  });
});
