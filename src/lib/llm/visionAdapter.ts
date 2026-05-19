/**
 * visionAdapter — THE single boundary for the only external Claude vision call.
 *
 * 🚫 SCOPE (Story 1.1 = scaffold only): this is an intentional NOT-IMPLEMENTED
 * shell. NO LLM logic here yet. It exists now so the boundary is cemented from
 * day one and nothing can grow a competing call site.
 *
 * Future stories fill this — and MUST NOT bypass it:
 *   - Story 1.3: async parse job wiring (pg-boss producer/consumer)
 *   - Story 1.4: the actual Claude vision call + LLM-Ops wrapper
 *       (NFR-L1 retry ≥3 jittered exp backoff, NFR-L2 Zod-validated JSON,
 *        NFR-L3 cost persistence per-session-day -> `llm_costs`,
 *        NFR-L4 runs in worker process, NFR-L5/S7 budget gate,
 *        R1 degradation chain Sonnet 4.6 -> Haiku 4.5 -> cache -> static -> friendly)
 *   - Story 1.7: parse endpoint budget / rate-limit gate -> `rate_counters`
 *
 * Refs:
 *   - architecture.md#Project-Structure-&-Boundaries (L433-459, L554-556):
 *       "唯一 Claude 視覺呼叫經 src/lib/llm/visionAdapter；任何 LLM 呼叫只經
 *        visionAdapter，不繞過 LLM-Ops 包裹" — bypassing is FORBIDDEN.
 *   - ~/.claude/CLAUDE.md Side Project 7 non-negotiables (retry/cost/log/
 *     degradation/rate-limit) attach HERE, not at any call site.
 */

export class VisionAdapterNotImplementedError extends Error {
  constructor() {
    super(
      "visionAdapter is a Story 1.1 scaffold stub. Implement in Story 1.4 " +
        "(LLM-Ops wrapper). Do NOT call Claude directly anywhere else.",
    );
    this.name = "VisionAdapterNotImplementedError";
  }
}

/**
 * Parse a receipt image via the single Claude vision boundary.
 *
 * NOT IMPLEMENTED in Story 1.1 (scaffold). Signature is intentionally left
 * to Story 1.4 to define alongside the Zod-validated contract (NFR-L2);
 * declaring it now would pre-empt that story's design decision.
 */
export function parseReceiptImage(): never {
  // TODO(Story 1.4): implement Claude vision call wrapped in LLM-Ops
  // (retry/degradation/log/cost/budget). See architecture.md L433-459.
  throw new VisionAdapterNotImplementedError();
}
