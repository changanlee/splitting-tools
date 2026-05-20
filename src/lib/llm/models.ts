/**
 * Claude model slugs for the single vision boundary (Story 1.4).
 * architecture.md L207: primary Sonnet 4.6, fallback Haiku 4.5.
 *
 * Migrated to OpenRouter (2026-05-20): the underlying model is still
 * Anthropic's Sonnet 4.6 / Haiku 4.5 — we just call it via OpenRouter's
 * OpenAI-compatible endpoint so cost / billing / rate-limit lives on
 * one provider relationship. OpenRouter slugs use dots:
 * `anthropic/claude-sonnet-4.6`, `anthropic/claude-haiku-4.5`.
 */
export const PRIMARY_MODEL = "anthropic/claude-sonnet-4.6";
export const FALLBACK_MODEL = "anthropic/claude-haiku-4.5";

/** Degradation order: try primary, then the cheaper fallback. */
export const DEGRADATION_MODELS = [PRIMARY_MODEL, FALLBACK_MODEL] as const;
