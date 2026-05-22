/**
 * Story 4.1/4.2/4.4/4.5 — 朋友認領頁面.
 *
 * Server Component fetches the session, all identities, all claims,
 * and all claimable receipt_lines. The page is split client-side by
 * MyIdentityResolver:
 *   - if the device-token matches a known identity → render the
 *     ClaimBoard (each ClaimRow has my checkbox + my weight + my
 *     running subtotal)
 *   - otherwise → render the IdentityPicker entry (4.1/4.2)
 */
import { notFound } from "next/navigation";

import { eq } from "drizzle-orm";

import { db } from "@/lib/db/client";
import { sessions } from "@/db/schema";
import { ClaimPageBody } from "@/features/claiming/components/ClaimPageBody";
import { listClaims } from "@/features/claiming/server/claimRepo";
import { listIdentities } from "@/features/identity/server/identityRepo";
import { getReconciliationSummary } from "@/features/reconciliation/server/summary";
import { sessionExists } from "@/features/parsing/server/jobs";
import { isFrozen } from "@/features/settlement/freeze";
import { isValidLinkId } from "@/lib/linkId";

interface Ctx {
  params: Promise<{ linkId: string }>;
  searchParams: Promise<{ added?: string; removed?: string }>;
}

export default async function ClaimPage({ params, searchParams }: Ctx) {
  const { linkId } = await params;
  const { added, removed } = await searchParams;
  if (!isValidLinkId(linkId)) notFound();

  const exists = await sessionExists(linkId).catch(() => false);
  if (!exists) notFound();

  // Story 5.5 — a finalized split is read-only. Show a clear notice
  // instead of the claim board, so nobody lands on controls whose
  // server action would reject with FRIENDLY_FROZEN and surface as a
  // raw 500 ("This page couldn't load").
  const statusRow = await db
    .select({ status: sessions.status })
    .from(sessions)
    .where(eq(sessions.id, linkId))
    .limit(1);
  if (statusRow[0] && isFrozen(statusRow[0].status)) {
    return (
      <main className="min-h-dvh max-w-md mx-auto flex flex-col gap-4 px-4 py-10">
        <h1 className="text-lg font-semibold">這筆分帳已定案</h1>
        <p className="text-sm text-muted-foreground">
          結算完成後分帳就鎖定了，無法再認領或修改。要重新分，請拍一張新收據開另一筆分帳。
        </p>
        <a
          href={`/splits/${linkId}/settle`}
          className="self-start rounded bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90"
        >
          查看結算結果 →
        </a>
      </main>
    );
  }

  const [identitiesAll, claimsAll, summary] = await Promise.all([
    listIdentities(linkId).catch(() => []),
    listClaims(linkId).catch(() => []),
    getReconciliationSummary(linkId).catch(() => null),
  ]);

  const lines =
    summary?.lines.filter((l) => l.claimable && !l.isIrc) ?? [];
  const existing = identitiesAll.map((i) => ({ id: i.id, name: i.name }));

  return (
    <main className="min-h-dvh max-w-md mx-auto flex flex-col gap-4 px-4 py-6">
      <header>
        <h1 className="text-lg font-semibold">認領</h1>
        <p className="text-xs text-muted-foreground">
          勾選你吃的品項；同一品項多人勾選可設定份額（4.5 加權）。
        </p>
      </header>
      <ClaimPageBody
        linkId={linkId}
        existing={existing}
        addedName={added ?? null}
        removedName={removed ?? null}
        lines={lines.map((l) => ({
          id: l.id,
          lineNo: l.lineNo,
          description: l.description,
          netCents: l.netCents,
          shareCount: l.shareCount,
        }))}
        claims={claimsAll.map((c) => ({
          receiptLineId: c.receiptLineId,
          identityId: c.identityId,
          identityName: c.identityName,
          weight: c.weight,
        }))}
        unverified={summary?.unverified ?? false}
        currency={summary?.currency ?? null}
      />
    </main>
  );
}
