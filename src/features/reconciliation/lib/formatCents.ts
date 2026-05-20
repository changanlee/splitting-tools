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
  cents: number,
  opts: FormatCentsOptions = {},
): string {
  const prefix = resolvePrefix(opts);
  // Money guardrail (fail-loud): integer cents only. Non-finite OR
  // non-integer degrades to em-dash rather than silently rounding —
  // a half-cent leaking in upstream should surface as a visible bug,
  // not vanish into truncation drift (review P1).
  if (!Number.isInteger(cents)) return `${prefix}—`;

  const negative = cents < 0;
  const abs = Math.abs(cents);
  const whole = Math.trunc(abs / 100);
  const fraction = abs % 100;

  // Thousand separators on the whole part. Manual to dodge any
  // Intl runtime quirks.
  const wholeStr = whole.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  const fractionStr = fraction.toString().padStart(2, "0");

  const sign = negative ? "-" : opts.signed && cents > 0 ? "+" : "";
  return `${sign}${prefix}${wholeStr}.${fractionStr}`;
}
