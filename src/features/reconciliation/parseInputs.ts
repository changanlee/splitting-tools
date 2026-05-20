/**
 * Story 2.3 — pure input parsers for the inline-edit / add-line forms.
 *
 * UI accepts human-friendly strings (NT$2,208.50 / 99.9 / 100) but
 * server-side everything is integer cents (money guardrail). Each
 * parser returns the parsed value OR `null` on rejection — callers
 * surface the friendly error (NFR-R1, no raw parse trace leak).
 */

/**
 * Parse a price string (in dollars) into integer cents.
 * Accepts `NT$2,208.50`, `2208.5`, `2208`, `0`, leading/trailing
 * whitespace. Rejects: empty, NaN, infinity, negative, > 2 decimal
 * digits, anything beyond an optional currency prefix + digits +
 * optional decimal. Returns the integer cents (rounded? No — we
 * accept exactly 0-2 decimal digits and multiply, so no rounding
 * happens; >2 decimals reject).
 */
export function parseCentsInput(input: string): number | null {
  if (typeof input !== "string") return null;
  const trimmed = input.trim();
  if (trimmed === "") return null;

  // Strip optional currency prefix and thousand separators.
  const stripped = trimmed.replace(/^NT\$/i, "").replace(/,/g, "").trim();
  if (stripped === "") return null;

  // Reject negative or scientific notation outright.
  if (/[eE+-]/.test(stripped)) return null;

  // Strict shape: digits, optional . then 1-2 digits.
  const m = /^(\d+)(?:\.(\d{1,2}))?$/.exec(stripped);
  if (!m) return null;

  const whole = Number.parseInt(m[1], 10);
  const fracStr = (m[2] ?? "").padEnd(2, "0");
  const frac = Number.parseInt(fracStr, 10);
  const cents = whole * 100 + frac;
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
