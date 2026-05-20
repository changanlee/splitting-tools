/**
 * Story 5.4/5.5 — finalize (lock the session as readonly) /
 * un-finalize. Two-step confirmation via native <details>.
 */
import { finalizeSessionAction } from "@/features/settlement/server/actions";

interface Props {
  linkId: string;
  status: string;
  pendingCents: number;
}

export function FinalizeForm({ linkId, status, pendingCents }: Props) {
  const bound = finalizeSessionAction.bind(null, linkId);
  if (status === "finalized") {
    return (
      <form
        action={bound}
        className="rounded-md border border-input bg-muted/40 px-4 py-3 flex items-center gap-3 text-sm"
      >
        <input type="hidden" name="confirmed" value="undo" />
        <span className="flex-1 text-muted-foreground">
          🔒 此分帳已定案（唯讀）。
        </span>
        <button
          type="submit"
          className="rounded border border-input bg-background px-3 py-1.5 text-sm font-medium hover:bg-accent"
        >
          解除定案
        </button>
      </form>
    );
  }
  return (
    <details className="rounded-md border border-border">
      <summary className="px-4 py-3 cursor-pointer text-sm font-medium hover:bg-accent/50">
        🔒 完成分帳（將鎖定為唯讀）
      </summary>
      <form action={bound} className="px-4 py-3 flex flex-col gap-2 text-sm">
        <p className="text-xs text-muted-foreground leading-relaxed">
          定案後分帳轉為唯讀，認領 / 編輯 / IRC 改綁全部停用（NFR-S5）。
          {pendingCents > 0 ? (
            <>
              {" "}
              <strong>目前還有 NT${(pendingCents / 100).toFixed(2)} 待認領</strong>
              ，定案表示這筆由付款人吸收。
            </>
          ) : null}
        </p>
        <input type="hidden" name="confirmed" value="yes" />
        <button
          type="submit"
          className="self-start rounded bg-primary text-primary-foreground px-3 py-1.5 text-sm font-medium hover:opacity-90"
        >
          確認定案
        </button>
      </form>
    </details>
  );
}
