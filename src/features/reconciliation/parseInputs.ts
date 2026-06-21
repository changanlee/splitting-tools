/**
 * Story 2.3 — pure input parsers for the inline-edit / add-line forms.
 *
 * UI accepts human-friendly strings (NT$2,208.50 / 99.9 / 100) but
 * server-side everything is integer cents (money guardrail). Each
 * parser returns the parsed value OR `null` on rejection — callers
 * surface the friendly error (NFR-R1, no raw parse trace leak).
 */
import { currencyDecimals } from "@/features/reconciliation/lib/formatCents";

/**
 * Parse a price string into an integer amount in the currency's MINOR
 * units. Currency-aware (2026-06-21): the number of accepted decimal
 * digits follows ISO 4217 — KRW/JPY have 0 (so "132580" → 132580, and a
 * decimal point is rejected), USD/TWD have 2 ("2,208.50" → 220850). When
 * `currency` is unknown/omitted, defaults to 2 (back-compat).
 *
 * Accepts an optional `NT$` prefix + thousand separators + optional
 * decimal. Rejects: empty, NaN, infinity, negative, scientific notation,
 * more decimal digits than the currency allows.
 */
export function parseCentsInput(
  input: string,
  currency?: string | null,
): number | null {
  if (typeof input !== "string") return null;
  const trimmed = input.trim();
  if (trimmed === "") return null;

  // Strip optional currency prefix and thousand separators.
  const stripped = trimmed.replace(/^NT\$/i, "").replace(/,/g, "").trim();
  if (stripped === "") return null;

  // Reject negative or scientific notation outright.
  if (/[eE+-]/.test(stripped)) return null;

  const decimals = currencyDecimals(currency);

  // Zero-decimal currency (KRW/JPY…): integers only, no decimal point.
  if (decimals === 0) {
    if (!/^\d+$/.test(stripped)) return null;
    const n = Number.parseInt(stripped, 10);
    return Number.isInteger(n) && n >= 0 ? n : null;
  }

  // Strict shape: digits, optional . then 1..decimals digits.
  const m = new RegExp(`^(\\d+)(?:\\.(\\d{1,${decimals}}))?$`).exec(stripped);
  if (!m) return null;

  const whole = Number.parseInt(m[1], 10);
  const fracStr = (m[2] ?? "").padEnd(decimals, "0");
  const frac = Number.parseInt(fracStr, 10);
  const cents = whole * 10 ** decimals + frac;
  if (!Number.isInteger(cents) || cents < 0) return null;
  return cents;
}

/** Parse a quantity input — strictly positive integer. */
export function parseQtyInput(input: string): number | null {
  if (typeof input !== "string") return null;
  const trimmed = input.trim();
  if (!/^\d+$/.test(trimmed)) return null;
  const n = Number.parseInt(trimmed, 10);
  if (!Number.isInteger(n) || n <= 0) return null;
  return n;
}

/** Parse a description — trim, length 1..100 chars. */
export function parseDescription(input: string): string | null {
  if (typeof input !== "string") return null;
  const trimmed = input.trim();
  if (trimmed.length < 1 || trimmed.length > 100) return null;
  return trimmed;
}
