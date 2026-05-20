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
  perIdentity: { name: string; cents: number }[];
  pendingCents: number;
  orphanIrcCents: number;
}

export function buildSettlementText(args: PlaintextInput): string {
  const lines: string[] = [];
  lines.push("📑 這次的分帳");
  const headerTotal = args.printedTotalCents ?? args.parsedSumCents;
  lines.push(`總額 ${formatCents(headerTotal)}`);
  if (args.unverified) lines.push("⚠ 未經對帳驗證");
  lines.push("");
  if (args.perIdentity.length === 0) {
    lines.push("（尚無人認領）");
  } else {
    for (const p of args.perIdentity) {
      lines.push(`${p.name}　${formatCents(p.cents)}`);
    }
  }
  if (args.pendingCents > 0) {
    lines.push("");
    lines.push(`待認領 ${formatCents(args.pendingCents)}`);
  }
  if (args.orphanIrcCents !== 0) {
    lines.push(`孤兒 IRC ${formatCents(args.orphanIrcCents)}`);
  }
  return lines.join("\n");
}
