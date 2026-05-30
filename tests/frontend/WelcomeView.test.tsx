import { describe, it, expect, vi } from 'vitest';
import { screen, fireEvent, within, waitFor } from '@testing-library/react';
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
    expect(screen.getByText(/See what MasePOS actually does/i)).toBeInTheDocument();
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

  it('opens the mobile menu drawer with login and theme actions', async () => {
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

    fireEvent.click(screen.getByRole('button', { name: /Open menu/i }));

    const drawer = document.querySelector('aside');
    expect(drawer).toBeInTheDocument();

    const drawerView = within(drawer as HTMLElement);
    expect(drawerView.getByRole('button', { name: /^Client Login$/i })).toBeInTheDocument();
    expect(drawerView.getByRole('button', { name: /^Admin Login$/i })).toBeInTheDocument();
    expect(drawerView.getByRole('button', { name: /^Dark Mode$/i })).toBeInTheDocument();
    expect(drawerView.getByRole('button', { name: /^Start Setup$/i })).toBeInTheDocument();
    expect(drawerView.getByRole('link', { name: /Features/i })).toBeInTheDocument();
    expect(drawerView.getByRole('link', { name: /Packages/i })).toBeInTheDocument();

    fireEvent.click(drawerView.getByRole('button', { name: /^Dark Mode$/i }));
    expect(toggleDarkMode).toHaveBeenCalled();

    fireEvent.click(drawerView.getByRole('button', { name: /^Admin Login$/i }));
    expect(onLogin).toHaveBeenCalled();

    await waitFor(() => {
      expect(document.querySelector('aside')).not.toBeInTheDocument();
    });
  });
});
