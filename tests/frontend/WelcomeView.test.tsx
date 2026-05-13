import { describe, it, expect, vi } from 'vitest';
import { screen, fireEvent } from '@testing-library/react';
import { renderWithRouter } from './test-utils.tsx';
import { WelcomeView } from '../../src/components/WelcomeView.tsx';

describe('WelcomeView', () => {
  it('renders buttons and toggles dark mode', () => {
    const onLogin = vi.fn();
    const onClientLogin = vi.fn();
    const toggleDarkMode = vi.fn();

    renderWithRouter(
      <WelcomeView
        onLogin={onLogin}
        onClientLogin={onClientLogin}
        isDarkMode={false}
        toggleDarkMode={toggleDarkMode}
      />
    );

    const staffLoginButtons = screen.getAllByRole('button', { name: /Staff Login/i });
    const tryNowButtons = screen.getAllByRole('button', { name: /Try Now/i });
    const startSetupButtons = screen.getAllByRole('button', { name: /Start Setup/i });

    expect(staffLoginButtons).toHaveLength(2);
    expect(tryNowButtons[0]).toBeInTheDocument();
    expect(startSetupButtons[0]).toBeInTheDocument();
    expect(screen.getByText(/A point of sale system built to make/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Toggle dark mode/i })).toBeInTheDocument();

    fireEvent.click(tryNowButtons[0]);
    expect(onLogin).toHaveBeenCalled();

    fireEvent.click(startSetupButtons[0]);
    expect(onLogin).toHaveBeenCalledTimes(2);

    fireEvent.click(screen.getByRole('button', { name: /My Account/i }));
    expect(onClientLogin).toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: /Toggle dark mode/i }));
    expect(toggleDarkMode).toHaveBeenCalled();
  });
});
