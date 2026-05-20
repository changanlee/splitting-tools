/**
 * Story 6.1 — lifecycleWorker. Schedules a daily destruction pass
 * against `sessions.expires_at < NOW()` using pg-boss recurring
 * cron. The pass + verification lives in
 * `src/features/lifecycle/server/destroy.ts`; this file only wires
 * the schedule and logs the structured report.
 */
import type { PgBoss } from "pg-boss";

import { runDestructionPass } from "@/features/lifecycle/server/destroy";

const LIFECYCLE_QUEUE = "lifecycle-destroy";
/** Daily at 03:00 UTC — well outside Costco-hours load. */
const LIFECYCLE_CRON = "0 3 * * *";

export async function registerLifecycleWorker(boss: PgBoss): Promise<void> {
  // pg-boss v12: queue must exist before `work(...)` / `schedule(...)`.
  try {
    await boss.createQueue(LIFECYCLE_QUEUE);
  } catch (e) {
    console.warn("[lifecycleWorker] createQueue:", e);
  }
  await boss.work(LIFECYCLE_QUEUE, async () => {
    const start = Date.now();
    try {
      const report = await runDestructionPass();
      console.log(
        "[lifecycle] destroy pass:",
        JSON.stringify({
          ...report,
          // Don't dump the full id list in steady-state — just the
          // count. Useful for forensics if verification fails.
          deletedSessionIds:
            report.expiredSessionCount > 0
              ? `<${report.expiredSessionCount} sessions>`
              : "[]",
          latencyMs: Date.now() - start,
        }),
      );
      if (!report.verified) {
        // Verification failed — FK cascade left dangling rows.
        // Surface loudly; ops should investigate. NOT swallowed.
        console.error(
          "[lifecycle] DESTROY VERIFICATION FAILED — residual rows remain",
          report.residual,
        );
      }
    } catch (e) {
      console.error(
        "[lifecycle] destroy pass threw:",
        e instanceof Error ? e.message : String(e),
      );
    }
  });

  // Schedule (idempotent — pg-boss dedupes on (queue, cron)).
  await boss.schedule(LIFECYCLE_QUEUE, LIFECYCLE_CRON);
  console.log(
    `[lifecycle] scheduled ${LIFECYCLE_QUEUE} cron='${LIFECYCLE_CRON}'`,
  );
}
