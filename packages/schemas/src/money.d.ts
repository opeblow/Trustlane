import { z } from 'zod';
export declare const CurrencyCode: z.ZodEnum<{
    USD: "USD";
    EUR: "EUR";
    GBP: "GBP";
    CAD: "CAD";
    AUD: "AUD";
    JPY: "JPY";
}>;
export type CurrencyCodeT = z.infer<typeof CurrencyCode>;
export declare const Money: z.ZodObject<{
    amount: z.ZodNumber;
    currency: z.ZodEnum<{
        USD: "USD";
        EUR: "EUR";
        GBP: "GBP";
        CAD: "CAD";
        AUD: "AUD";
        JPY: "JPY";
    }>;
}, z.core.$strip>;
export type MoneyT = z.infer<typeof Money>;
export declare const SUPPORTED_CURRENCIES: CurrencyCodeT[];
export declare const CURRENCY_SYMBOL: Record<CurrencyCodeT, string>;
/** Convert a major-unit amount to integer minor units (cents). */
export declare function toMinorUnits(amount: number): number;
/** Convert integer minor units back to a rounded major-unit amount. */
export declare function fromMinorUnits(minor: number): number;
export declare function money(amount: number, currency: CurrencyCodeT): MoneyT;
export declare function addMoney(a: MoneyT, b: MoneyT): MoneyT;
export declare function multiplyMoney(a: MoneyT, factor: number): MoneyT;
export declare function isSameMoney(a: MoneyT, b: MoneyT): boolean;
export declare function formatMoney(value: MoneyT, locale?: string): string;
//# sourceMappingURL=money.d.ts.map