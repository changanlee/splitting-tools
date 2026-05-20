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

import { ClaimPageBody } from "@/features/claiming/components/ClaimPageBody";
import { listClaims } from "@/features/claiming/server/claimRepo";
import { listIdentities } from "@/features/identity/server/identityRepo";
import { getReconciliationSummary } from "@/features/reconciliation/server/summary";
import { sessionExists } from "@/features/parsing/server/jobs";
import { isValidLinkId } from "@/lib/linkId";

interface Ctx {
  params: Promise<{ linkId: string }>;
}

export default async function ClaimPage({ params }: Ctx) {
  const { linkId } = await params;
  if (!isValidLinkId(linkId)) notFound();

  const exists = await sessionExists(linkId).catch(() => false);
  if (!exists) notFound();

  const [identitiesAll, claimsAll, summary] = await Promise.all([
    listIdentities(linkId).catch(() => []),
    listClaims(linkId).catch(() => []),
    getReconciliationSummary(linkId).catch(() => null),
  ]);

  const lines =
    summary?.lines.filter((l) => l.claimable && !l.isIrc) ?? [];
  const existing = identitiesAll.map((i) => ({ id: i.id, name: i.name }));
  const identitiesForResolve = identitiesAll.map((i) => ({
    id: i.id,
    name: i.name,
    deviceTokenHash: i.deviceTokenHash,
  }));

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
        identities={identitiesForResolve}
        existing={existing}
        lines={lines.map((l) => ({
          id: l.id,
          lineNo: l.lineNo,
          description: l.description,
          netCents: l.netCents,
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
