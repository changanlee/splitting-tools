/**
 * Claude model IDs for the single vision boundary (Story 1.4).
 * architecture.md L207: primary Sonnet 4.6, fallback Haiku 4.5. Kept as
 * constants so the degradation chain + tests reference one source.
 */
export const PRIMARY_MODEL = "claude-sonnet-4-6";
export const FALLBACK_MODEL = "claude-haiku-4-5-20251001";

/** Degradation order: try primary, then the cheaper fallback. */
export const DEGRADATION_MODELS = [PRIMARY_MODEL, FALLBACK_MODEL] as const;
