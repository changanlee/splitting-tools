/**
 * Story 2.1 — 付款人核對閘門 page (FR8).
 *
 * Server Component (Next 16 default). Reads receipt_lines + sessions
 * server-side, computes the three-state reconciliation, and renders
 * the StickySubtotalBar + readonly ReceiptLineRow list. Zero client
 * island in 2-1; later stories add interactivity per their scope
 * (2-2 locate, 2-3 edit, 2-4 IRC rebind, 2-5 manual total, 2-6/2-7
 * force-pass / never-deadlock).
 *
 * ctx.params is a Promise in Next 16 — sticking with 1-3/1-7 pattern.
 */
import { notFound } from "next/navigation";

import { isValidLinkId } from "@/lib/linkId";

import { computeReconciliation } from "@/features/reconciliation/compute";
import { AddLineForm } from "@/features/reconciliation/components/AddLineForm";
import { ForcePassForm } from "@/features/reconciliation/components/ForcePassForm";
import { IrcRebindForm } from "@/features/reconciliation/components/IrcRebindForm";
import { NextStepGate } from "@/features/reconciliation/components/NextStepGate";
import { OrphanIrcBanner } from "@/features/reconciliation/components/OrphanIrcBanner";
import { PrintedTotalForm } from "@/features/reconciliation/components/PrintedTotalForm";
import { ReceiptLineEditForm } from "@/features/reconciliation/components/ReceiptLineEditForm";
import { ReceiptLineRow } from "@/features/reconciliation/components/ReceiptLineRow";
import { StickySubtotalBar } from "@/features/reconciliation/components/StickySubtotalBar";
import { SuspiciousSummary } from "@/features/reconciliation/components/SuspiciousSummary";
import { UnverifiedBanner } from "@/features/reconciliation/components/UnverifiedBanner";
import { getReconciliationSummary } from "@/features/reconciliation/server/summary";
import {
  buildSuspiciousContext,
  classifySuspicious,
  type SuspiciousResult,
} from "@/features/reconciliation/suspicious";

interface Ctx {
  params: Promise<{ linkId: string }>;
  searchParams: Promise<{ edit?: string }>;
}

export default async function ReviewPage({ params, searchParams }: Ctx) {
  const { linkId } = await params;
  const { edit: editingLineId } = await searchParams;

  // Story 3.1 — closes W-2-1-3: reject obviously-malformed linkIds
  // with a clean 404 instead of letting them hit the DB and get
  // swallowed into a generic friendly-error page.
  if (!isValidLinkId(linkId)) {
    notFound();
  }

  let summary: Awaited<ReturnType<typeof getReconciliationSummary>>;
  try {
    summary = await getReconciliationSummary(linkId);
  } catch (e) {
    // NFR-R1: never leak raw DB/system errors to the user.
    console.error(
      "[review] getReconciliationSummary failed:",
      e instanceof Error ? e.message : String(e),
    );
    return (
      <main className="min-h-dvh px-4 py-8 max-w-md mx-auto">
        <h1 className="text-lg font-semibold mb-2">核對閘門</h1>
        <p className="text-sm text-muted-foreground">
          暫時無法載入對帳結果，請稍後再試。
        </p>
      </main>
    );
  }

  if (!summary) {
    // Session does not exist — 404. Full link semantics = Story 3.1;
    // device-token authz = Epic 4. v1 only checks existence.
    notFound();
  }

  // AC3 ②: parse hasn't produced rows yet (queued/processing/failed,
  // or succeeded with no lines). Don't render the SubtotalBar three
  // states — that would imply a baseline to compare against.
  if (summary.lines.length === 0) {
    return (
      <main className="min-h-dvh px-4 py-8 max-w-md mx-auto">
        <h1 className="text-lg font-semibold mb-2">核對閘門</h1>
        <p className="text-sm text-muted-foreground">
          解析尚未完成或尚無逐行品項，請回到上一頁繼續等待。
        </p>
      </main>
    );
  }

  const reconciliation = computeReconciliation(
    summary.parsedSumCents,
    summary.printedTotalCents,
    summary.unverified, // Story 2.6
  );

  const orphanCount = summary.lines.filter((l) => l.orphan).length;

  // Story 2.2 — compute suspicious classification once, server-side.
  // Pass per-line results into ReceiptLineRow and collect line-nos
  // for the SuspiciousSummary anchor list.
  const suspiciousCtx = buildSuspiciousContext(summary.lines);
  const suspiciousByLine = new Map<string, SuspiciousResult>();
  const suspiciousLineNos: number[] = [];
  for (const l of summary.lines) {
    const r = classifySuspicious(l, suspiciousCtx);
    if (r.severity === "suspicious") {
      suspiciousByLine.set(l.id, r);
      suspiciousLineNos.push(l.lineNo);
    }
  }

  return (
    <main className="min-h-dvh max-w-md mx-auto flex flex-col">
      <StickySubtotalBar
        parsedSumCents={summary.parsedSumCents}
        reconciliation={reconciliation}
        currency={summary.currency}
      />
      {/* Story 2.6 — unverified force-pass banner (FR15 propagation). */}
      <UnverifiedBanner unverified={summary.unverified} />
      {/* Review P3: even when SubtotalBar reads 'verified' (green ✓),
          orphan IRCs mean per-line attribution is incomplete — surface
          that fact next to the trust signal so it can't be missed. */}
      <OrphanIrcBanner orphanCount={orphanCount} />
      {/* Story 2.2 — anchor list to suspicious rows (FR9). */}
      <SuspiciousSummary suspiciousLineNos={suspiciousLineNos} />
      <h1 className="px-4 pt-4 pb-2 text-base font-semibold">
        核對逐行品項
      </h1>
      <ol className="flex-1" aria-label="收據逐行品項">
        {summary.lines.map((l) => {
          // Story 2.4 — IRC row in edit mode → IrcRebindForm
          if (editingLineId === l.id && l.isIrc) {
            const candidates = summary.lines.filter((c) => !c.isIrc);
            return (
              <IrcRebindForm
                key={l.id}
                linkId={linkId}
                ircLine={l}
                candidates={candidates}
              />
            );
          }
          // Story 2.3 — non-IRC row in edit mode → ReceiptLineEditForm
          if (editingLineId === l.id && !l.isIrc) {
            return (
              <ReceiptLineEditForm
                key={l.id}
                linkId={linkId}
                line={l}
                currency={summary.currency}
              />
            );
          }
          // Default — read-only row with optional edit anchor.
          // Both IRC and non-IRC rows can enter edit mode now (2.3
          // owns line-edit, 2.4 owns IRC re-bind; the row component
          // doesn't care which form the page picks).
          return (
            <ReceiptLineRow
              key={l.id}
              line={l}
              currency={summary.currency}
              suspicious={suspiciousByLine.get(l.id)}
              editHref={
                !editingLineId
                  ? `/splits/${linkId}/review?edit=${l.id}`
                  : undefined
              }
            />
          );
        })}
      </ol>
      <PrintedTotalForm
        linkId={linkId}
        currentCents={summary.printedTotalCents}
        currency={summary.currency}
      />
      <AddLineForm linkId={linkId} currency={summary.currency} />
      <ForcePassForm
        linkId={linkId}
        currentlyUnverified={summary.unverified}
      />
      <NextStepGate linkId={linkId} state={reconciliation.state} />
    </main>
  );
}
