/**
 * Story 3.2/3.3 — 分享頁面 (FR18/FR19).
 *
 * Server Component renders MessageCard preview + ShareActions client
 * island. The share URL is `${origin}/splits/[linkId]/claim`
 * (Epic 4's claim entry); for v1 fallback to /splits/[linkId]/review
 * if we don't know the claim path yet.
 *
 * Note: Story 3.1 made `/splits/[linkId]/review`'s NextStepGate
 * point here, so verified/unverified flows land on this page.
 */
import { headers } from "next/headers";
import { notFound } from "next/navigation";

import { isValidLinkId } from "@/lib/linkId";

import {
  MessageCard,
  buildShareText,
} from "@/features/linking/components/MessageCard";
import { ShareActions } from "@/features/linking/components/ShareActions";
import { getShareSummary } from "@/features/linking/server/shareSummary";

interface Ctx {
  params: Promise<{ linkId: string }>;
}

export default async function SharePage({ params }: Ctx) {
  const { linkId } = await params;
  if (!isValidLinkId(linkId)) notFound();

  let summary: Awaited<ReturnType<typeof getShareSummary>>;
  try {
    summary = await getShareSummary(linkId);
  } catch (e) {
    console.error(
      "[share] getShareSummary failed:",
      e instanceof Error ? e.message : String(e),
    );
    return (
      <main className="min-h-dvh px-4 py-8 max-w-md mx-auto">
        <h1 className="text-lg font-semibold mb-2">分享分帳</h1>
        <p className="text-sm text-muted-foreground">
          暫時無法載入分享資訊，請稍後再試。
        </p>
      </main>
    );
  }
  if (!summary) notFound();

  // Build the share URL. We try to reconstruct the origin from
  // request headers (Next 16 supports `headers()` in Server
  // Components); fall back to relative path so the card still works
  // in dev.
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "";
  const proto = h.get("x-forwarded-proto") ?? "https";
  const origin = host ? `${proto}://${host}` : "";
  // Story 4.1 will own /splits/[linkId]/claim. Until then point at
  // /review (already shipped) so the URL is always valid.
  const sharePath = `/splits/${linkId}/review`;
  const shareUrl = `${origin}${sharePath}`;

  const cardProps = {
    shareUrl,
    createdAt: summary.createdAt,
    parsedSumCents: summary.parsedSumCents,
    printedTotalCents: summary.printedTotalCents,
    unverified: summary.unverified,
    lineCount: summary.lineCount,
  };
  const shareText = buildShareText(cardProps);

  return (
    <main className="min-h-dvh max-w-md mx-auto flex flex-col gap-4 px-4 py-6">
      <header>
        <h1 className="text-lg font-semibold">分享分帳</h1>
        <p className="text-xs text-muted-foreground">
          以下卡片是朋友會看到的內容（防詐騙：不只貼裸 URL）。
        </p>
      </header>
      <MessageCard {...cardProps} />
      <ShareActions shareText={shareText} shareUrl={shareUrl} />
      <a
        href={`/splits/${linkId}/review`}
        className="self-start text-xs text-primary underline underline-offset-2 hover:no-underline"
      >
        ← 回核對閘門
      </a>
      <footer className="px-1 py-3 text-xs text-muted-foreground border-t">
        Story 3.2/3.3 完成（訊息卡 + 分享/複製）。Story 4.1 之後分享連結將指向認領頁。
      </footer>
    </main>
  );
}
