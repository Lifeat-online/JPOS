import { describe, it, expect, vi } from 'vitest';
import { screen, fireEvent } from '@testing-library/react';
import { renderWithRouter } from './test-utils.tsx';
import { WelcomeView } from '../../src/components/WelcomeView.tsx';

describe('WelcomeView', () => {
  it('renders buttons and toggles dark mode', () => {
    const onLogin = vi.fn();
    const onTryNow = vi.fn();
    const onStartSetup = vi.fn();
    const onClientLogin = vi.fn();
    const toggleDarkMode = vi.fn();

    renderWithRouter(
      <WelcomeView
        onLogin={onLogin}
        onTryNow={onTryNow}
        onStartSetup={onStartSetup}
        onClientLogin={onClientLogin}
        isDarkMode={false}
        toggleDarkMode={toggleDarkMode}
      />
    );

    const adminLoginButtons = screen.getAllByRole('button', { name: /Admin Login/i });
    const tryNowButtons = screen.getAllByRole('button', { name: /Try Now/i });
    const startSetupButtons = screen.getAllByRole('button', { name: /Start Setup/i });

    expect(adminLoginButtons).toHaveLength(3);
    expect(tryNowButtons[0]).toBeInTheDocument();
    expect(startSetupButtons[0]).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^Client Login$/i })).toBeInTheDocument();
    expect(screen.getByText(/A point of sale system built to make/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Toggle dark mode/i })).toBeInTheDocument();

    fireEvent.click(tryNowButtons[0]);
    expect(onTryNow).toHaveBeenCalled();

    fireEvent.click(startSetupButtons[0]);
    expect(onStartSetup).toHaveBeenCalled();

    fireEvent.click(adminLoginButtons[0]);
    expect(onLogin).toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: /My Account/i }));
    expect(onClientLogin).toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: /Toggle dark mode/i }));
    expect(toggleDarkMode).toHaveBeenCalled();
  });
});
