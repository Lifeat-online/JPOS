import React, { ReactElement } from 'react';
import { MemoryRouter } from 'react-router-dom';
import { render, RenderOptions } from '@testing-library/react';

type Options = {
  route?: string;
} & Omit<RenderOptions, 'queries'>;

export function renderWithRouter(ui: ReactElement, { route = '/', ...options }: Options = {}) {
  window.history.pushState({}, 'Test page', route);

  return render(<MemoryRouter>{ui}</MemoryRouter>, options);
}
