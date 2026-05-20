/**
 * Story 2.7 — "核對流程永不卡死" invariant (FR16 / NFR-R2).
 *
 * Every reconciliation state MUST have an explicit forward path the
 * payer can take. This pure function encodes that mapping, so:
 *   - the UI can render the "下一步" affordance with the right label
 *   - tests can assert the mapping is total (every state covered)
 *
 * Forward-path rules:
 *   - verified                → can progress (next: 產生連結)
 *   - unverified              → can progress (next: 產生連結，帶警示)
 *   - mismatch                → cannot progress YET, but every escape
 *                                hatch is listed (edit / IRC rebind /
 *                                manual total / force-pass) — UX must
 *                                surface ≥ 1
 *   - awaiting_printed_total  → cannot progress YET; escape hatches
 *                                are manual-total OR force-pass
 *
 * The contract guarantees `nextHints.length >= 1` in every state —
 * tested exhaustively. No state is a dead end.
 */
import type { ReconciliationState } from "@/features/reconciliation/compute";

export interface ProgressDecision {
  /** True when the payer can directly move to the share / link step. */
  canProgress: boolean;
  /**
   * Friendly繁中 forward-path hints — always ≥ 1 (no deadlock).
   * The UI surfaces these next to the "下一步" button.
   */
  nextHints: string[];
}

export function canProgress(state: ReconciliationState): ProgressDecision {
  switch (state) {
    case "verified":
      return {
        canProgress: true,
        nextHints: ["金額已對齊，可按「下一步」產生分享連結。"],
      };
    case "unverified":
      return {
        canProgress: true,
        nextHints: [
          "已選擇未驗證放行，可按「下一步」產生分享連結（將附帶未驗證警示）。",
          "亦可在上方「取消未驗證狀態」回到對帳修正。",
        ],
      };
    case "mismatch":
      return {
        canProgress: false,
        nextHints: [
          "逐行檢查並修正品項（編輯／新增／刪除）。",
          "若 IRC 折扣綁錯，可調整 IRC 母品項。",
          "若印製總額讀錯，可手動更正印製總額。",
          "若真的無法對齊，可選「未驗證強制放行」逃生口。",
        ],
      };
    case "awaiting_printed_total":
      return {
        canProgress: false,
        nextHints: [
          "請手動輸入收據印製總額以開始對帳。",
          "或直接選「未驗證強制放行」逃生口。",
        ],
      };
    default: {
      // Exhaustiveness check — TypeScript will surface a missing
      // state at compile time. At runtime this is a fail-loud (no
      // state should ever reach here; matches project convention).
      const _exhaustive: never = state;
      throw new Error(`unreachable reconciliation state: ${String(_exhaustive)}`);
    }
  }
}
