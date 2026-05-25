/**
 * Story 5.3 — plain-text settlement export. Pure. The friend pastes
 * this back into the chat as the canonical "X owes NT$Y" summary.
 *
 * Format intentionally simple: one line per person + a tail summary.
 * No emoji-vomit; just the math.
 */
import { formatCents } from "@/features/reconciliation/lib/formatCents";

export interface PlaintextInput {
  parsedSumCents: number;
  printedTotalCents: number | null;
  unverified: boolean;
  /** ISO 4217 from sessions.currency; null → no prefix. */
  currency: string | null;
  perIdentity: {
    name: string;
    cents: number;
    /** What this person claimed — listed under their line. `weight` is
     *  the share count they took on that line; only rendered when ≥ 2
     *  (default 1 = a single share, leave silent to avoid clutter). */
    items?: { description: string; cents: number; weight?: number }[];
  }[];
  pendingCents: number;
  orphanIrcCents: number;
}

export function buildSettlementText(args: PlaintextInput): string {
  const fmt = (c: number) => formatCents(c, { currency: args.currency });
  const lines: string[] = [];
  lines.push("📑 這次的分帳");
  const headerTotal = args.printedTotalCents ?? args.parsedSumCents;
  lines.push(`總額 ${fmt(headerTotal)}`);
  if (args.unverified) lines.push("⚠ 未經對帳驗證");
  lines.push("");
  if (args.perIdentity.length === 0) {
    lines.push("（尚無人認領）");
  } else {
    for (const p of args.perIdentity) {
      lines.push(`${p.name}　${fmt(p.cents)}`);
      for (const it of p.items ?? []) {
        const qty = (it.weight ?? 1) >= 2 ? ` ×${it.weight}` : "";
        lines.push(`  ・${it.description}${qty} ${fmt(it.cents)}`);
      }
    }
  }
  if (args.pendingCents > 0) {
    lines.push("");
    lines.push(`待認領 ${fmt(args.pendingCents)}`);
  }
  if (args.orphanIrcCents !== 0) {
    lines.push(`孤兒 IRC ${fmt(args.orphanIrcCents)}`);
  }
  return lines.join("\n");
}
