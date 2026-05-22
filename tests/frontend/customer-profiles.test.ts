import { describe, expect, it } from 'vitest';
import { buildPosCustomerProfiles, getStaffCustomerId, isStaffCustomerProfile } from '../../src/utils/customerProfiles';
import type { Customer, Staff } from '../../src/types';

const customers: Customer[] = [
  {
    id: 'cust_1',
    name: 'Regular Client',
    email: 'client@example.com',
  },
];

const staff: Staff[] = [
  {
    id: 'staff_1',
    name: 'Sarah Cashier',
    email: 'sarah@example.com',
    role: 'cashier',
    status: 'active',
    createdAt: '2026-01-01',
  },
  {
    id: 'staff_2',
    name: 'Regular Client',
    email: 'duplicate-name@example.com',
    role: 'manager',
    status: 'active',
    createdAt: '2026-01-01',
  },
];

describe('POS customer profiles', () => {
  it('adds active staff as selectable customer profiles', () => {
    const profiles = buildPosCustomerProfiles(customers, staff);
    const staffProfile = profiles.find(profile => profile.id === getStaffCustomerId('staff_1'));

    expect(staffProfile).toMatchObject({
      name: 'Sarah Cashier',
      email: 'sarah@example.com',
      profileType: 'staff',
      staffId: 'staff_1',
      accountEnabled: false,
    });
    expect(isStaffCustomerProfile(staffProfile)).toBe(true);
  });

  it('does not duplicate staff already present as a normal customer', () => {
    const profiles = buildPosCustomerProfiles(customers, staff);

    expect(profiles.some(profile => profile.id === getStaffCustomerId('staff_2'))).toBe(false);
  });
});
