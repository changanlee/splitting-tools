/**
 * Integer-cents → human-readable money string. PURE, node-testable.
 *
 * Currency-aware: the prefix follows the receipt's ISO 4217 code
 * (stamped by visionAdapter onto sessions.currency). Unknown / missing
 * currency → no prefix (the amount stays readable; we don't guess a
 * locale). Sign is preserved for delta displays (`-¥1,850` / `+¥850`).
 * Uses Math operations only — no `Intl.NumberFormat` because Node
 * locale data varies across runtimes (Vercel edge / CI Linux) and the
 * format is fixed for v1.
 */

/**
 * ISO 4217 → display prefix. Covers the currencies the LLM is
 * instructed to detect; extend as more receipts surface in production.
 * Order: CJK first (most likely Costco markets in scope), then USD, then
 * other common Asia/EU.
 */
export const CURRENCY_PREFIX: Record<string, string> = {
  CNY: "¥",
  TWD: "NT$",
  HKD: "HK$",
  JPY: "¥",
  KRW: "₩",
  USD: "US$",
  EUR: "€",
  GBP: "£",
  AUD: "A$",
  CAD: "C$",
  SGD: "S$",
  THB: "฿",
  MYR: "RM",
};

/**
 * ISO 4217 minor-unit digits (the currency "exponent"). Verified against
 * ISO 4217 (2026-06-21). A stored money integer is in these MINOR units,
 * so ₩4,980 (KRW, exp 0) is 4980 and $16.50 (USD, exp 2) is 1650. Most
 * currencies use 2; a set use 0 (no minor unit), a few use 3. Unknown /
 * missing currency defaults to 2 (the global majority).
 *
 * Bug history: before this, money was hard-coded to 2 decimals, so KRW
 * ₩4,980 displayed as ₩47.80 (百分位 misread as a decimal point).
 */
const ZERO_DECIMAL_CURRENCIES = new Set([
  "KRW", "JPY", "VND", "CLP", "ISK", "BIF", "DJF", "GNF", "KMF",
  "PYG", "RWF", "UGX", "VUV", "XAF", "XOF", "XPF",
]);
const THREE_DECIMAL_CURRENCIES = new Set([
  "BHD", "IQD", "JOD", "KWD", "LYD", "OMR", "TND",
]);

export function currencyDecimals(currency?: string | null): number {
  if (currency == null || currency === "") return 2;
  const code = currency.toUpperCase();
  if (ZERO_DECIMAL_CURRENCIES.has(code)) return 0;
  if (THREE_DECIMAL_CURRENCIES.has(code)) return 3;
  return 2;
}

export interface FormatCentsOptions {
  /** ISO 4217 currency code. Wins over `prefix`. Unknown code → no prefix. */
  currency?: string | null;
  /** Explicit prefix override. Used only when `currency` is not set. */
  prefix?: string;
  /** Include +/- sign explicitly when non-zero (default false → no plus). */
  signed?: boolean;
}

function resolvePrefix(opts: FormatCentsOptions): string {
  if (opts.currency != null && opts.currency !== "") {
    const code = opts.currency.toUpperCase();
    return CURRENCY_PREFIX[code] ?? "";
  }
  return opts.prefix ?? "";
}

export function formatCents(
  amount: number,
  opts: FormatCentsOptions = {},
): string {
  const prefix = resolvePrefix(opts);
  // Money guardrail (fail-loud): integer minor units only. Non-finite OR
  // non-integer degrades to em-dash rather than silently rounding —
  // a fractional unit leaking in upstream should surface as a visible
  // bug, not vanish into truncation drift (review P1).
  if (!Number.isInteger(amount)) return `${prefix}—`;

  // Currency-aware: KRW/JPY have NO minor unit (don't divide), USD/TWD
  // have 2. `amount` is integer minor units; format per the exponent.
  const decimals = currencyDecimals(opts.currency);
  const divisor = 10 ** decimals;
  const negative = amount < 0;
  const abs = Math.abs(amount);
  const whole = Math.trunc(abs / divisor);

  // Thousand separators on the whole part. Manual to dodge any
  // Intl runtime quirks.
  const wholeStr = whole.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  const sign = negative ? "-" : opts.signed && amount > 0 ? "+" : "";
  if (decimals === 0) return `${sign}${prefix}${wholeStr}`;
  const fractionStr = (abs % divisor).toString().padStart(decimals, "0");
  return `${sign}${prefix}${wholeStr}.${fractionStr}`;
}

/**
 * Round-trip an integer minor-unit amount into a PLAIN editable string
 * (no prefix, no thousand separators) for a form `defaultValue` — the
 * inverse of `parseCentsInput`. Honours the currency's decimals: KRW →
 * "4980", USD → "16.50". Non-integer → "".
 */
export function formatAmountPlain(
  amount: number,
  currency?: string | null,
): string {
  if (!Number.isInteger(amount)) return "";
  const decimals = currencyDecimals(currency);
  const divisor = 10 ** decimals;
  const negative = amount < 0;
  const abs = Math.abs(amount);
  const whole = Math.trunc(abs / divisor);
  const sign = negative ? "-" : "";
  if (decimals === 0) return `${sign}${whole}`;
  const frac = (abs % divisor).toString().padStart(decimals, "0");
  return `${sign}${whole}.${frac}`;
}
