import type { Customer, Staff } from '../types';

export const STAFF_CUSTOMER_ID_PREFIX = 'staff:';

export function getStaffCustomerId(staffId: string) {
  return `${STAFF_CUSTOMER_ID_PREFIX}${staffId}`;
}

export function isStaffCustomerProfile(customer?: Pick<Customer, 'profileType' | 'id'> | null) {
  return Boolean(customer?.profileType === 'staff' || customer?.id.startsWith(STAFF_CUSTOMER_ID_PREFIX));
}

export function buildPosCustomerProfiles(customers: Customer[], staff: Staff[]): Customer[] {
  const customerEmails = new Set(customers.map(customer => customer.email?.trim().toLowerCase()).filter(Boolean));
  const customerNames = new Set(customers.map(customer => customer.name?.trim().toLowerCase()).filter(Boolean));

  const staffProfiles: Customer[] = staff
    .filter(member => member.status !== 'inactive')
    .filter(member => {
      const email = member.email?.trim().toLowerCase();
      const name = member.name?.trim().toLowerCase();
      return !(email && customerEmails.has(email)) && !(name && customerNames.has(name));
    })
    .map(member => ({
      id: getStaffCustomerId(member.id),
      name: member.name,
      email: member.email || '',
      phone: member.phone,
      notes: `Staff customer profile for ${member.role}`,
      loyaltyPoints: 0,
      walletBalance: 0,
      accountEnabled: false,
      accountLimit: 0,
      accountBalance: 0,
      profileType: 'staff',
      staffId: member.id,
      staffRole: member.role,
      discountPercent: Number(member.discountPercent || 0),
      createdAt: member.createdAt,
    }));

  return [
    ...customers.map(customer => ({
      ...customer,
      profileType: customer.profileType || ('customer' as const),
    })),
    ...staffProfiles,
  ].sort((a, b) => a.name.localeCompare(b.name));
}
