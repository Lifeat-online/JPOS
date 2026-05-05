import { describe, it, expect, vi } from 'vitest';
import { screen, fireEvent } from '@testing-library/react';
import { renderWithRouter } from './test-utils.tsx';
import { WelcomeView } from '../../src/components/WelcomeView.tsx';

describe('WelcomeView', () => {
  it('renders buttons and toggles dark mode', () => {
    const onLogin = vi.fn();
    const onClientLogin = vi.fn();
    const toggleDarkMode = vi.fn();

    renderWithRouter(<WelcomeView onLogin={onLogin} onClientLogin={onClientLogin} isDarkMode={false} toggleDarkMode={toggleDarkMode} />);

    expect(screen.getByRole('button', { name: /Staff Login/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Toggle dark mode/i })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Toggle dark mode/i }));
    expect(toggleDarkMode).toHaveBeenCalled();
  });
});
