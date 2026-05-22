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
    const retailModeButtons = screen.getAllByRole('button', { name: /Try Retail Mode/i });
    const restaurantModeButtons = screen.getAllByRole('button', { name: /Try Restaurant Mode/i });
    const startSetupButtons = screen.getAllByRole('button', { name: /Start Setup/i });

    expect(adminLoginButtons).toHaveLength(3);
    expect(screen.queryByRole('button', { name: /^Try Now$/i })).not.toBeInTheDocument();
    expect(retailModeButtons[0]).toBeInTheDocument();
    expect(restaurantModeButtons[0]).toBeInTheDocument();
    expect(startSetupButtons[0]).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: /^Client Login$/i })[0]).toBeInTheDocument();
    expect(screen.getByText(/See what Jimmy's POS actually does/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Toggle dark mode/i })).toBeInTheDocument();

    fireEvent.click(retailModeButtons[0]);
    expect(onTryNow).toHaveBeenCalledWith('retail');

    fireEvent.click(restaurantModeButtons[0]);
    expect(onTryNow).toHaveBeenCalledWith('restaurant');

    fireEvent.click(startSetupButtons[0]);
    expect(onStartSetup).toHaveBeenCalled();

    fireEvent.click(adminLoginButtons[0]);
    expect(onLogin).toHaveBeenCalled();

    fireEvent.click(screen.getAllByRole('button', { name: /^Client Login$/i })[0]);
    expect(onClientLogin).toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: /Toggle dark mode/i }));
    expect(toggleDarkMode).toHaveBeenCalled();
  });
});
