import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

const api = vi.hoisted(() => ({
  getHardwareDevices: vi.fn(),
  getHardwareEvents: vi.fn(),
  createHardwareDevice: vi.fn(),
  updateHardwareDevice: vi.fn(),
  deleteHardwareDevice: vi.fn(),
  testHardwareDevice: vi.fn(),
}));
vi.mock('../../src/api', () => api);

import { HardwareAdaptersPanel } from '../../src/components/HardwareAdaptersPanel';

function selectNetwork() {
  const selects = screen.getAllByRole('combobox');
  fireEvent.change(selects[1], { target: { value: 'escpos_network' } });
}

describe('HardwareAdaptersPanel network printer form', () => {
  beforeEach(() => {
    Object.values(api).forEach(fn => fn.mockReset());
    api.getHardwareDevices.mockResolvedValue([]);
    api.getHardwareEvents.mockResolvedValue([]);
    api.createHardwareDevice.mockResolvedValue({});
  });

  it('renders host and port inputs instead of the JSON textarea', async () => {
    render(<HardwareAdaptersPanel tenantId="t1" workstations={[]} />);
    selectNetwork();
    expect(screen.getByLabelText(/Printer IP address \/ hostname/)).toBeInTheDocument();
    expect(screen.getByLabelText('Port')).toHaveValue(9100);
    expect(screen.queryByLabelText('Connection config (JSON)')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Show advanced/ }));
    expect(screen.getByLabelText('Connection config (JSON)')).toBeInTheDocument();
  });

  it('saves edited host and port in the payload', async () => {
    render(<HardwareAdaptersPanel tenantId="t1" workstations={[]} />);
    selectNetwork();
    fireEvent.change(screen.getByLabelText(/Printer IP address/), { target: { value: '192.168.0.50' } });
    fireEvent.change(screen.getByLabelText('Port'), { target: { value: '9200' } });
    fireEvent.click(screen.getByRole('button', { name: /Save adapter/ }));
    await waitFor(() => expect(api.createHardwareDevice).toHaveBeenCalled());
    expect(api.createHardwareDevice.mock.calls[0][1].connectionConfig).toEqual({ host: '192.168.0.50', port: 9200 });
  });

  it('disables Save for an out-of-range port or missing host', () => {
    render(<HardwareAdaptersPanel tenantId="t1" workstations={[]} />);
    selectNetwork();
    const save = screen.getByRole('button', { name: /Save adapter/ });
    expect(save).toBeDisabled();
    fireEvent.change(screen.getByLabelText(/Printer IP address/), { target: { value: '10.0.0.5' } });
    expect(save).not.toBeDisabled();
    fireEvent.change(screen.getByLabelText('Port'), { target: { value: '70000' } });
    expect(save).toBeDisabled();
    expect(screen.getByText(/1 to 65535/)).toBeInTheDocument();
  });

  it('shows a reset hint when the JSON is invalid', () => {
    render(<HardwareAdaptersPanel tenantId="t1" workstations={[]} />);
    selectNetwork();
    fireEvent.click(screen.getByRole('button', { name: /Show advanced/ }));
    fireEvent.change(screen.getByLabelText('Connection config (JSON)'), { target: { value: '{ nope' } });
    expect(screen.getByText('Fix the JSON or reset to defaults')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Save adapter/ })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Reset' }));
    expect(screen.getByLabelText('Port')).toHaveValue(9100);
  });
});
