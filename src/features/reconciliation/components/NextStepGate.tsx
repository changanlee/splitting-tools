/**
 * Story 2.7 — "下一步" gate + always-present forward hints (FR16).
 *
 * Renders either the active "下一步" button (when state allows
 * progression) or a descriptive list of escape hatches (when state
 * doesn't yet allow). EVERY state shows at least one forward hint —
 * the page can never be a dead end.
 *
 * The share/link page is Story 3.1's owner; until that lands, the
 * 下一步 anchor points at `/splits/[linkId]/share` (will 404 today,
 * but the form contract is stable).
 */
import { canProgress } from "@/features/reconciliation/canProgress";
import type { ReconciliationState } from "@/features/reconciliation/compute";

interface Props {
  linkId: string;
  state: ReconciliationState;
}

export function NextStepGate({ linkId, state }: Props) {
  const decision = canProgress(state);
  return (
    <section
      aria-label="下一步"
      className="border-t border-border bg-background px-4 py-4 flex flex-col gap-3"
    >
      {decision.canProgress ? (
        <a
          href={`/splits/${linkId}/share`}
          className="self-start rounded bg-primary text-primary-foreground px-4 py-2 text-sm font-semibold hover:opacity-90"
        >
          下一步：產生分享連結 →
        </a>
      ) : (
        <div className="self-start rounded border border-dashed border-muted-foreground/40 px-4 py-2 text-sm text-muted-foreground">
          目前無法產生連結。請先處理下方任一前進路徑。
        </div>
      )}
      <ul className="list-disc pl-5 text-xs text-muted-foreground space-y-1">
        {decision.nextHints.map((h, i) => (
          <li key={i}>{h}</li>
        ))}
      </ul>
    </section>
  );
}
