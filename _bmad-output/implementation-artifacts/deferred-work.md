# Deferred Work Registry — splitting_tools

> Persistent SSOT for intentionally-deferred gaps. **No silent
> downgrades**: every deferral has an ID, priority, reason, and is closed
> (not deleted) with a resolution note + date when resolved. Adopted
> 2026-05-19 from the Plutus verification method (proportionate subset).
>
> ID format: `W-<epic>-<story>-<seq>`. Priority: **P0** (must resolve
> before dependent work / launch), **P1** (resolve when trigger condition
> hits), **Phase-later** (explicitly out for now per product scope).
> Status: `OPEN` | `RESOLVED (date, by)`.

---

## W-1-1-1 — Story 1.1 `docker compose up` runtime re-verify

- **Status:** OPEN
- **Priority:** P1
- **Story:** 1-1-project-scaffold-ci (Task 9, AC3)
- **Gap:** In-container `pnpm install --frozen-lockfile` blocked by the
  environment `minimumReleaseAge` supply-chain policy rejecting
  `@unrs/resolver-binding-*@1.12.0` (dev-only ESLint transitive published
  2026-05-18 ~15:54Z, inside the ~24h window). NOT a scaffold defect.
- **Reason for defer:** External, time-bounded policy; user decision
  2026-05-19 = wait for the window, do not weaken the Dockerfile.
- **Trigger / resolve when:** env clock ≥ ~2026-05-19 23:54 local (UTC+8;
  publish+24h). Then run
  `WEB_PORT=3010 DB_PORT=55470 docker compose up -d --build`, verify the 3
  services (db/web/worker) + web↔db, then push Story 1.1 to review.
- **Tracked in:** `1-1-project-scaffold-ci.md` Task 9 + Debug Log.

## W-1-2-1 — Story 1.2 manual browser verification (camera/HEIC/drag)

- **Status:** OPEN
- **Priority:** P1
- **Story:** 1-2-capture-compress-mask (AC1/AC3/AC6)
- **Gap:** Canvas/pointer interactions cannot be auto-tested in the node
  CI env (AC5 strategy keeps the canvas glue out of node unit tests to
  avoid heavy deps). Specifically un-automated: real device camera capture
  (`capture="environment"`), drag-to-draw/move/remove mask rectangles,
  iOS HEIC decode-failure → friendly-error path.
- **Reason for defer:** Requires a real iOS Safari / Android Chrome
  device; the pure gating maths (`computeResizedDimensions`,
  `clampMaskRect`, `hasUsableMaskOrSkip`) IS fully node-tested (19 tests).
- **Trigger / resolve when:** Manual pass on a real iOS Safari + Android
  Chrome device (weak-network simulation for the store scenario). Record
  result in `1-2-capture-compress-mask.md` Debug Log, then close here.
- **Tracked in:** `1-2-capture-compress-mask.md` Completion Notes (manual
  verification 待辦).

---

## Deferred from: code review (2026-05-19, commit 8dfcb87)

> Source: `/code-review` of the scaffold commit (Blind + Edge + LLM
> Compliance hunters). These are real but intentionally NOT actioned now —
> each is by-design scaffold scope or scale-stage, recorded so the gap is
> never silent. The 9 patch groups from the same review were applied in
> the follow-up fix commit; the LLM-Compliance hunter returned clean.

### W-CR-1 — pg-boss post-start liveness / health signal

- **Status:** OPEN
- **Priority:** P1
- **Story:** owned by 1-3-async-parse-job-polling onward
- **Gap:** After `boss.start()` a later pg-boss `error` is only logged;
  with no consumers (Story 1.1 scope) and no health/liveness signal an
  orchestrator sees the worker as healthy while the queue is dead.
- **Reason for defer:** Story 1.1 scope is "prove boot order, no
  consumers". Liveness is only meaningful once `parseWorker` exists.
- **Trigger / resolve when:** Story 1.3 adds the parse consumer — add a
  health/liveness check + non-zero exit on fatal queue error then.

### W-CR-2 — Drizzle migrate advisory lock for concurrent workers

- **Status:** OPEN
- **Priority:** Phase-later
- **Story:** infra / scale-stage
- **Gap:** `migrate()` runs on every worker boot with no advisory lock; >1
  worker replica racing first-boot migration could deadlock/partial-apply.
- **Reason for defer:** Single worker in compose, DAU<10k stage-0
  single-instance playbook. Adding an advisory lock now is the
  "為萬一爆紅過度設計" anti-pattern.
- **Trigger / resolve when:** before introducing >1 worker replica
  (auto-scaling group, stage 10k–50k) — wrap migrate in
  `pg_advisory_lock`.

### W-CR-3 — `status` columns are free-text, no CHECK / enum

- **Status:** OPEN
- **Priority:** Phase-later
- **Story:** revisit when a story first writes/depends on these states
- **Gap:** `sessions.status` / `parse_jobs.status` are `text` with a
  comment-only enum and several nullable columns have no CHECK constraint;
  nothing prevents an invalid status string.
- **Reason for defer:** Deliberate minimal scaffold (`schema.ts` header:
  add on demand). Adding enums/CHECKs before any writer exists is
  premature for a small non-commercial tool.
- **Trigger / resolve when:** the first story that writes a status
  transition (Epic 1.3+/Epic 2) — add a CHECK or Drizzle enum in that
  story's migration.

### W-CR-4 — regression-invariants harness uses placeholder tautologies

- **Status:** OPEN (by design — do NOT weaken before trigger)
- **Priority:** P1
- **Story:** 1-4-vision-llm-parse / 1-5-irc-match-parsed-sum / 5-1-settlement-deterministic-fn
- **Gap:** `regression-invariants.test.ts` placeholder assertions are
  self-equal and `it.todo` markers report green; AC6 provides no real
  regression protection *at this commit*.
- **Reason for defer:** Intentional, documented carry-forward anchor
  (test/file headers + sprint-status `CARRY-FORWARD ANCHORS`). The
  pipeline-executes-green proof is the only Story 1.1 goal here.
- **Trigger / resolve when:** Story 1.4/1.5 swap in the real #5564
  fixture; Story 5.1 wires `src/lib/money/settle.ts`. Replace placeholder
  with live assertions WITHOUT renaming the `it.todo` anchors.

---

## Resolved

_(none yet — entries move here with a `RESOLVED (date, by story/commit)`
line and a one-line resolution summary; never deleted.)_
