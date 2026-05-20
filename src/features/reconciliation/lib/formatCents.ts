/**
 * Integer-cents → human-readable NT$ string. PURE, node-testable.
 *
 * Receipts use NT (Taiwan) — `NT$` prefix; 2 decimal places; thousand
 * separators. Sign is preserved for delta displays (`-NT$1,850` /
 * `+NT$850`); the caller can opt for absolute via `signed: false`.
 * Uses Math operations only — no `Intl.NumberFormat` because Node
 * locale data varies across runtimes (Vercel edge / CI Linux) and the
 * format is fixed for v1.
 */
export interface FormatCentsOptions {
  /** Prefix override (default "NT$"). */
  prefix?: string;
  /** Include +/- sign explicitly when non-zero (default false → no plus). */
  signed?: boolean;
}

export function formatCents(
  cents: number,
  opts: FormatCentsOptions = {},
): string {
  const prefix = opts.prefix ?? "NT$";
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
