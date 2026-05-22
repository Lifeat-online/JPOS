import type { AppConfig, Customer, HappyHourDiscount, Staff } from '../types';

export interface AppliedDiscount {
  amount: number;
  percent: number;
  label: string;
  source: 'none' | 'individual' | 'role' | 'happy_hour';
}

const clampPercent = (value: unknown) => Math.max(0, Math.min(100, Number(value || 0)));

function isTimeInWindow(nowMinutes: number, start: string, end: string) {
  const [startHour, startMinute] = start.split(':').map(Number);
  const [endHour, endMinute] = end.split(':').map(Number);
  if ([startHour, startMinute, endHour, endMinute].some(value => Number.isNaN(value))) return false;
  const startMinutes = startHour * 60 + startMinute;
  const endMinutes = endHour * 60 + endMinute;
  if (startMinutes === endMinutes) return true;
  if (startMinutes < endMinutes) return nowMinutes >= startMinutes && nowMinutes <= endMinutes;
  return nowMinutes >= startMinutes || nowMinutes <= endMinutes;
}

function getActiveHappyHourDiscount(rule: HappyHourDiscount, now: Date): AppliedDiscount | null {
  if (!rule.enabled) return null;
  const day = now.getDay();
  if (!rule.days?.includes(day)) return null;
  const nowMinutes = now.getHours() * 60 + now.getMinutes();
  if (!isTimeInWindow(nowMinutes, rule.startTime, rule.endTime)) return null;
  const percent = clampPercent(rule.discountPercent);
  if (percent <= 0) return null;
  return {
    amount: 0,
    percent,
    label: rule.name?.trim() || 'Happy hour',
    source: 'happy_hour',
  };
}

export function getApplicablePricingDiscount(
  subtotal: number,
  customer: Customer | null,
  config: AppConfig | null,
  now = new Date()
): AppliedDiscount {
  const candidates: AppliedDiscount[] = [];
  const individualPercent = clampPercent(customer?.discountPercent);

  if (individualPercent > 0 && customer) {
    candidates.push({
      amount: 0,
      percent: individualPercent,
      label: `${customer.name} discount`,
      source: 'individual',
    });
  }

  const staffRole = customer?.staffRole as Staff['role'] | undefined;
  const rolePercent = staffRole ? clampPercent(config?.business?.roleDiscounts?.[staffRole]) : 0;
  if (rolePercent > 0 && staffRole) {
    candidates.push({
      amount: 0,
      percent: rolePercent,
      label: `${staffRole.charAt(0).toUpperCase()}${staffRole.slice(1)} staff discount`,
      source: 'role',
    });
  }

  for (const rule of config?.business?.happyHourDiscounts || []) {
    const active = getActiveHappyHourDiscount(rule, now);
    if (active) candidates.push(active);
  }

  const best = candidates.sort((a, b) => b.percent - a.percent)[0];
  if (!best || subtotal <= 0) {
    return { amount: 0, percent: 0, label: '', source: 'none' };
  }

  return {
    ...best,
    amount: Number((subtotal * (best.percent / 100)).toFixed(2)),
  };
}
