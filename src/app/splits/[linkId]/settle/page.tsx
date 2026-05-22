/**
 * Story 5.2/5.3/5.4/5.5 — 結算頁面.
 *
 * Server Component runs settle() once via getSettlementView, renders
 * per-identity breakdown, plaintext export, and the finalize gate.
 * When session.status === 'finalized', the page is read-only (no
 * edit affordances) — claim/edit/IRC server actions also refuse the
 * write at their own boundary (defense in depth).
 */
import { notFound } from "next/navigation";

import { ExportPlaintextActions } from "@/features/settlement/components/ExportPlaintextActions";
import { FinalizeForm } from "@/features/settlement/components/FinalizeForm";
import { SettlementSummary } from "@/features/settlement/components/SettlementSummary";
import { buildSettlementText } from "@/features/settlement/plaintext";
import { getSettlementView } from "@/features/settlement/server/settlementView";
import { isValidLinkId } from "@/lib/linkId";

interface Ctx {
  params: Promise<{ linkId: string }>;
}

export default async function SettlePage({ params }: Ctx) {
  const { linkId } = await params;
  if (!isValidLinkId(linkId)) notFound();

  let view: Awaited<ReturnType<typeof getSettlementView>>;
  try {
    view = await getSettlementView(linkId);
  } catch (e) {
    console.error(
      "[settle] failed:",
      e instanceof Error ? e.message : String(e),
    );
    return (
      <main className="min-h-dvh px-4 py-8 max-w-md mx-auto">
        <h1 className="text-lg font-semibold mb-2">結算</h1>
        <p className="text-sm text-muted-foreground">
          暫時無法載入結算結果，請稍後再試。
        </p>
      </main>
    );
  }
  if (!view) notFound();

  const shareText = buildSettlementText({
    parsedSumCents: view.parsedSumCents,
    printedTotalCents: view.printedTotalCents,
    unverified: view.unverified,
    currency: view.currency,
    perIdentity: view.perIdentity.map((p) => ({
      name: p.name,
      cents: p.cents,
      items: p.items,
    })),
    pendingCents: view.pendingCents,
    orphanIrcCents: view.orphanIrcCents,
  });

  return (
    <main className="min-h-dvh max-w-md mx-auto flex flex-col gap-4 px-4 py-6">
      <header>
        <h1 className="text-lg font-semibold">結算</h1>
      </header>
      <SettlementSummary {...view} />
      <ExportPlaintextActions shareText={shareText} />
      <FinalizeForm
        linkId={linkId}
        status={view.status}
        pendingCents={view.pendingCents}
        currency={view.currency}
      />
      <nav className="text-xs flex gap-3 pt-2 border-t border-border">
        <a
          href={`/splits/${linkId}/review`}
          className="text-primary underline underline-offset-2 hover:no-underline"
        >
          ← 核對閘門
        </a>
        <a
          href={`/splits/${linkId}/claim`}
          className="text-primary underline underline-offset-2 hover:no-underline"
        >
          認領頁
        </a>
        <a
          href={`/splits/${linkId}/share`}
          className="text-primary underline underline-offset-2 hover:no-underline"
        >
          分享頁
        </a>
      </nav>
    </main>
  );
}
