import { describe, it, expect, vi } from 'vitest';
import { screen, fireEvent, within, waitFor } from '@testing-library/react';
import { renderWithRouter } from './test-utils.tsx';
import { WelcomeView } from '../../src/components/WelcomeView.tsx';

describe('WelcomeView', () => {
  // NOTE: This test previously asserted "Try Retail Mode" / "Try Restaurant
  // Mode" buttons calling onTryNow('retail'|'restaurant'). Those buttons were
  // removed when the landing-page redesign collapsed the mode-picker into a
  // single Setup flow. The remaining assertions cover what the component
  // actually renders today.
  it('renders the header CTAs and toggles dark mode', () => {
    const onLogin = vi.fn();
    const onStartSetup = vi.fn();
    const onClientLogin = vi.fn();
    const toggleDarkMode = vi.fn();

    renderWithRouter(
      <WelcomeView
        onLogin={onLogin}
        onTryNow={vi.fn()}
        onStartSetup={onStartSetup}
        onClientLogin={onClientLogin}
        isDarkMode={false}
        toggleDarkMode={toggleDarkMode}
      />
    );

    const adminLoginButtons = screen.getAllByRole('button', { name: /Admin Login/i });
    const startSetupButtons = screen.getAllByRole('button', { name: /Start Setup/i });

    expect(adminLoginButtons.length).toBeGreaterThan(0);
    expect(startSetupButtons.length).toBeGreaterThan(0);
    expect(screen.getAllByRole('button', { name: /^Client Login$/i })[0]).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Toggle dark mode/i })).toBeInTheDocument();

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
