import { describe, it, expect, vi } from 'vitest';
import { screen, fireEvent } from '@testing-library/react';
import { renderWithRouter } from './test-utils.tsx';
import { PublicPackagesPage } from '../../src/views/PublicPackagesPage.tsx';

describe('PublicPackagesPage', () => {
  it('renders packages outside the authenticated app shell', () => {
    const onLogin = vi.fn();
    const onTryNow = vi.fn();
    const onStartSetup = vi.fn();
    const onClientLogin = vi.fn();
    const toggleDarkMode = vi.fn();

    renderWithRouter(
      <PublicPackagesPage
        onLogin={onLogin}
        onTryNow={onTryNow}
        onStartSetup={onStartSetup}
        onClientLogin={onClientLogin}
        isDarkMode={false}
        toggleDarkMode={toggleDarkMode}
      />
    );

    expect(screen.getByText(/Pick the package that matches/i)).toBeInTheDocument();
    expect(screen.getByText(/R999\/mo/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Terminal/i })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Try Now/i }));
    expect(onTryNow).toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: /Toggle dark mode/i }));
    expect(toggleDarkMode).toHaveBeenCalled();
  });
});
