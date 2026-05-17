import { describe, it, expect, vi } from 'vitest';
import { screen } from '@testing-library/react';
import { renderWithRouter } from './test-utils.tsx';
import { EnrollmentModal } from '../../src/components/EnrollmentModal.tsx';

describe('EnrollmentModal', () => {
  it('keeps the admin enrollment form scrollable inside the viewport', () => {
    renderWithRouter(
      <EnrollmentModal
        isOpen={true}
        onClose={vi.fn()}
        onSubmit={vi.fn()}
        error={null}
        isLoading={false}
      />
    );

    const form = screen.getByLabelText(/Business Name/i).closest('form');
    expect(form).toHaveClass('overflow-y-auto');
    expect(form?.parentElement).toHaveClass('max-h-[calc(100vh-2rem)]');
  });
});
