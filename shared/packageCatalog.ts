export type PackageTier = 'free' | 'starter' | 'business' | 'whitelabel';
export type DeliveryModel = 'hosted_saas' | 'docker_licence';
export type PackageFeature =
  | 'jpos_branding'
  | 'own_logo'
  | 'images'
  | 'ai'
  | 'analytics'
  | 'local_server_sync'
  | 'full_branding'
  | 'priority_support'
  | 'updates';

export interface JposPackage {
  id: PackageTier;
  name: string;
  priceLabel: string;
  priceCents: number;
  billing: 'free' | 'monthly' | 'once_off';
  delivery: DeliveryModel;
  maxRegisters: number;
  maxProducts: number;
  maxStaff: number;
  maxCustomers: number;
  features: PackageFeature[];
  limitsLabel: string;
  description: string;
  ctaLabel: string;
  highlighted?: boolean;
}

export interface PackageAddOn {
  id: 'whitelabel_support';
  name: string;
  priceLabel: string;
  priceCents: number;
  billing: 'monthly';
  appliesTo: PackageTier[];
  features: PackageFeature[];
  description: string;
}

export const JPOS_PACKAGES: JposPackage[] = [
  {
    id: 'free',
    name: 'Free',
    priceLabel: 'R0',
    priceCents: 0,
    billing: 'free',
    delivery: 'hosted_saas',
    maxRegisters: 2,
    maxProducts: 100,
    maxStaff: 3,
    maxCustomers: 100,
    features: ['jpos_branding'],
    limitsLabel: '2 registers, 100 products, 3 staff, MasePOS branding',
    description: 'Hosted starter workspace for testing, small counters, and proof-of-fit.',
    ctaLabel: 'Start Free',
  },
  {
    id: 'starter',
    name: 'Starter',
    priceLabel: 'R399/mo',
    priceCents: 39900,
    billing: 'monthly',
    delivery: 'hosted_saas',
    maxRegisters: 5,
    maxProducts: 1000,
    maxStaff: 15,
    maxCustomers: 2000,
    features: ['own_logo', 'images'],
    limitsLabel: '5 registers, 1,000 products, 15 staff, own logo, images',
    description: 'Hosted POS for small operators who need branded selling and product images.',
    ctaLabel: 'Choose Starter',
  },
  {
    id: 'business',
    name: 'Business',
    priceLabel: 'R999/mo',
    priceCents: 99900,
    billing: 'monthly',
    delivery: 'hosted_saas',
    maxRegisters: 15,
    maxProducts: -1,
    maxStaff: 50,
    maxCustomers: -1,
    features: ['own_logo', 'images', 'ai', 'analytics', 'local_server_sync'],
    limitsLabel: '15 registers, unlimited products, 50 staff, AI features, reports, Windows local sync',
    description: 'Hosted growth tier with reporting, AI assistance, and paid Windows outage sync for larger teams.',
    ctaLabel: 'Choose Business',
    highlighted: true,
  },
  {
    id: 'whitelabel',
    name: 'White-label',
    priceLabel: 'R25,000 once-off',
    priceCents: 2500000,
    billing: 'once_off',
    delivery: 'docker_licence',
    maxRegisters: -1,
    maxProducts: -1,
    maxStaff: -1,
    maxCustomers: -1,
    features: ['full_branding', 'own_logo', 'images', 'ai', 'analytics', 'local_server_sync'],
    limitsLabel: 'Unlimited registers, products, staff, and customers; full branding, Windows local sync, source not included',
    description: 'A Docker image with a signed licence key for self-hosted branded deployments and paid Windows outage sync.',
    ctaLabel: 'Request Licence',
  },
];

export const JPOS_PACKAGE_ADDONS: PackageAddOn[] = [
  {
    id: 'whitelabel_support',
    name: 'White-label + Support+',
    priceLabel: 'R3,500/mo',
    priceCents: 350000,
    billing: 'monthly',
    appliesTo: ['whitelabel'],
    features: ['updates', 'priority_support'],
    description: 'Keeps white-label customers on the latest version with update access and priority support.',
  },
];

export function getPackageByTier(tier: string | null | undefined): JposPackage | undefined {
  return JPOS_PACKAGES.find((pkg) => pkg.id === tier);
}

export function getHostedPackage(tier: string | null | undefined): JposPackage {
  const pkg = getPackageByTier(tier);
  if (pkg && pkg.delivery === 'hosted_saas') return pkg;
  return JPOS_PACKAGES[0];
}

export function featureSetForPackage(tier: PackageTier, includeSupport = false): PackageFeature[] {
  const pkg = getPackageByTier(tier);
  if (!pkg) return [];
  const features = new Set<PackageFeature>(pkg.features);
  if (includeSupport && tier === 'whitelabel') {
    for (const feature of JPOS_PACKAGE_ADDONS[0].features) features.add(feature);
  }
  return [...features];
}

export function hasPackageFeature(features: readonly string[], feature: PackageFeature): boolean {
  return features.includes(feature) || features.includes('full_branding');
}
