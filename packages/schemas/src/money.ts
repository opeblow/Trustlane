import { z } from 'zod';

export const CurrencyCode = z
  .enum(['USD', 'EUR', 'GBP', 'CAD', 'AUD', 'JPY'])
  .describe('ISO-4217 currency code');

export type CurrencyCodeT = z.infer<typeof CurrencyCode>;

export const Money = z.object({
  /** Decimal amount in major units, e.g. 1499.99. Never a formatted string. */
  amount: z.number().finite(),
  currency: CurrencyCode,
});
export type MoneyT = z.infer<typeof Money>;

export const SUPPORTED_CURRENCIES: CurrencyCodeT[] = [
  'USD',
  'EUR',
  'GBP',
  'CAD',
  'AUD',
  'JPY',
];

export const CURRENCY_SYMBOL: Record<CurrencyCodeT, string> = {
  USD: '$',
  EUR: '\u20ac',
  GBP: '\u00a3',
  CAD: 'CA$',
  AUD: 'A$',
  JPY: '\u00a5',
};

/** Convert a major-unit amount to integer minor units (cents). */
export function toMinorUnits(amount: number): number {
  return Math.round((amount + Number.EPSILON) * 100);
}

/** Convert integer minor units back to a rounded major-unit amount. */
export function fromMinorUnits(minor: number): number {
  return Math.round(minor) / 100;
}

export function money(amount: number, currency: CurrencyCodeT): MoneyT {
  return { amount: fromMinorUnits(toMinorUnits(amount)), currency };
}

export function addMoney(a: MoneyT, b: MoneyT): MoneyT {
  if (a.currency !== b.currency) {
    throw new Error(`currency mismatch: cannot add ${a.currency} and ${b.currency}`);
  }
  return money(fromMinorUnits(toMinorUnits(a.amount) + toMinorUnits(b.amount)), a.currency);
}

export function multiplyMoney(a: MoneyT, factor: number): MoneyT {
  return money(fromMinorUnits(Math.round(toMinorUnits(a.amount) * factor)), a.currency);
}

export function isSameMoney(a: MoneyT, b: MoneyT): boolean {
  return a.currency === b.currency && toMinorUnits(a.amount) === toMinorUnits(b.amount);
}

export function formatMoney(value: MoneyT, locale = 'en-US'): string {
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency: value.currency,
    maximumFractionDigits: value.currency === 'JPY' ? 0 : 2,
  }).format(value.amount);
}