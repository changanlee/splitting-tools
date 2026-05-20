"use server";

/**
 * Story 2.3 — Server Actions for line edit / delete / add.
 *
 * Progressive enhancement: forms `action={...}` POST to these
 * server-only functions; no client JS needed for the happy path. On
 * failure they `throw` a friendly Error (caught by the route's
 * error.tsx OR surfaced via the form-state pattern in callers). On
 * success they `revalidatePath` so SubtotalBar + suspicious-line
 * recompute on the next render.
 *
 * Scope (Story 2.3): mutate ONLY `gross_cents` / `description` /
 * `qty` on existing lines, or add/delete a plain product line. IRC
 * re-attribution is Story 2.4 — edits to a line carrying an IRC
 * attribution conservatively reset `net_cents := gross_cents` so we
 * never display a stale post-net that no longer matches the IRC. The
 * payer can re-bind IRC in 2.4.
 *
 * No audit log here (Story 4.9 = payer change log); no lifecycle
 * gating beyond "session exists".
 */
import { randomUUID } from "node:crypto";

import { and, asc, desc, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";

import { db } from "@/lib/db/client";
import { receiptLines, sessions } from "@/db/schema";

import {
  parseCentsInput,
  parseDescription,
  parseQtyInput,
} from "@/features/reconciliation/parseInputs";

const FRIENDLY_INVALID = "輸入內容格式不正確，請確認後再試。";
const FRIENDLY_NOT_FOUND = "找不到這筆品項或分帳，請重新整理。";
const FRIENDLY_UNEXPECTED = "暫時無法儲存變更，請稍後再試。";

async function assertSession(linkId: string): Promise<void> {
  const rows = await db
    .select({ id: sessions.id })
    .from(sessions)
    .where(eq(sessions.id, linkId))
    .limit(1);
  if (!rows[0]) throw new Error(FRIENDLY_NOT_FOUND);
}

export async function editLineAction(
  linkId: string,
  lineId: string,
  formData: FormData,
): Promise<void> {
  const description = parseDescription(String(formData.get("description") ?? ""));
  const qty = parseQtyInput(String(formData.get("qty") ?? ""));
  const cents = parseCentsInput(String(formData.get("amount") ?? ""));

  if (description === null || qty === null || cents === null) {
    throw new Error(FRIENDLY_INVALID);
  }

  try {
    await assertSession(linkId);
    // Conservative: net_cents := gross_cents on any edit. If this
    // line was a parent that had IRC attribution, the prior fold no
    // longer matches; Story 2.4 will let the payer re-bind.
    const result = await db
      .update(receiptLines)
      .set({
        description,
        qty,
        grossCents: cents,
        netCents: cents,
      })
      .where(
        and(eq(receiptLines.id, lineId), eq(receiptLines.sessionId, linkId)),
      );
    // drizzle pg's update returns void by default; existence is
    // already gated by assertSession + composite WHERE. A 0-row
    // update silently no-ops, which is acceptable here (the row
    // could have been deleted between page render and submit).
    void result;
  } catch (e) {
    if (e instanceof Error && e.message === FRIENDLY_NOT_FOUND) throw e;
    console.error(
      "[editLineAction] failed:",
      e instanceof Error ? e.message : String(e),
    );
    throw new Error(FRIENDLY_UNEXPECTED);
  }

  revalidatePath(`/splits/${linkId}/review`);
}

export async function deleteLineAction(
  linkId: string,
  lineId: string,
): Promise<void> {
  try {
    await assertSession(linkId);
    await db
      .delete(receiptLines)
      .where(
        and(eq(receiptLines.id, lineId), eq(receiptLines.sessionId, linkId)),
      );
  } catch (e) {
    if (e instanceof Error && e.message === FRIENDLY_NOT_FOUND) throw e;
    console.error(
      "[deleteLineAction] failed:",
      e instanceof Error ? e.message : String(e),
    );
    throw new Error(FRIENDLY_UNEXPECTED);
  }
  revalidatePath(`/splits/${linkId}/review`);
}

export async function addLineAction(
  linkId: string,
  formData: FormData,
): Promise<void> {
  const description = parseDescription(String(formData.get("description") ?? ""));
  const qty = parseQtyInput(String(formData.get("qty") ?? ""));
  const cents = parseCentsInput(String(formData.get("amount") ?? ""));

  if (description === null || qty === null || cents === null) {
    throw new Error(FRIENDLY_INVALID);
  }

  try {
    await assertSession(linkId);

    // line_no = max(existing) + 1, scoped to this session. Use one
    // round-trip to read the highest; insert is a separate query —
    // a concurrent edit could theoretically race this, but for the
    // single-payer review flow this is benign (worst case duplicate
    // line_no, which we tolerate; the unique constraint is on
    // (parse_job_id, line_no) — a manually added line has no
    // parse_job_id reference at this layer... wait, parse_job_id is
    // NOT NULL on the schema. So we need to derive a parse_job_id.
    //
    // Resolution: pick the parse_job_id from any existing line in
    // the same session (they all belong to the same parse job per
    // 1.5 persistReceiptLines contract). If no lines exist yet,
    // refuse to add (the page wouldn't render the add UI in that
    // state — AC3 case 2).
    const seedRow = await db
      .select({
        lineNo: receiptLines.lineNo,
        parseJobId: receiptLines.parseJobId,
      })
      .from(receiptLines)
      .where(eq(receiptLines.sessionId, linkId))
      .orderBy(desc(receiptLines.lineNo))
      .limit(1);
    const seed = seedRow[0];
    if (!seed) {
      throw new Error(FRIENDLY_NOT_FOUND);
    }

    await db.insert(receiptLines).values({
      id: randomUUID(),
      sessionId: linkId,
      parseJobId: seed.parseJobId,
      lineNo: seed.lineNo + 1,
      description,
      rawText: null,
      qty,
      grossCents: cents,
      netCents: cents,
      isIrc: false,
      claimable: true,
      ircAttributedTo: null,
      orphan: false,
    });
  } catch (e) {
    if (e instanceof Error && (e.message === FRIENDLY_NOT_FOUND || e.message === FRIENDLY_INVALID)) throw e;
    console.error(
      "[addLineAction] failed:",
      e instanceof Error ? e.message : String(e),
    );
    throw new Error(FRIENDLY_UNEXPECTED);
  }

  revalidatePath(`/splits/${linkId}/review`);
}

// `asc` import retained for future ordering use cases; silence the
// "unused" lint by keeping a typed reference. (drizzle re-exports
// `asc`/`desc` from the same module; we use `desc` above.)
export const _internalAsc = asc;
