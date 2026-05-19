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

- **Status:** RESOLVED (2026-05-20 02:33, by retry #5). The
  docker-verify (its whole purpose) surfaced 3 real, distinct
  blockers, each fixed without weakening the lockfile or
  minimumReleaseAge policy: (1) supply-chain window cleared ~01:44;
  (2) slow build-network timed out on the large next/swc tarballs →
  added pnpm `fetch-timeout 600000`/`fetch-retries 5` to both
  Dockerfiles (`--frozen-lockfile` kept); (3) pnpm 10
  `ERR_PNPM_IGNORED_BUILDS` → added `pnpm.onlyBuiltDependencies`
  allowlist (esbuild/sharp/unrs-resolver) to package.json AND pinned
  `"packageManager":"pnpm@10.32.1"` so docker corepack uses the same
  pnpm as the host. Final verify GREEN: db healthy; worker logs
  `database reachable → drizzle migrate complete → pg-boss started`
  (G2 init order proven end-to-end); web HTTP 200; web→db:5432 OPEN.
  Compose torn down clean. Story 1.1 → done.
- **Priority:** P1
- **Story:** 1-1-project-scaffold-ci (Task 9, AC3)
- **Gap:** In-container `pnpm install --frozen-lockfile` blocked by the
  environment `minimumReleaseAge` supply-chain policy rejecting
  `@unrs/resolver-binding-*@1.12.0` (dev-only ESLint transitive published
  2026-05-18 ~15:54Z, inside the ~24h window). NOT a scaffold defect.
- **Reason for defer:** External, time-bounded policy; user decision
  2026-05-19 = wait for the window, do not weaken the Dockerfile.
- **⚠️ Trigger CORRECTED (2026-05-20 00:03, non-silent):** the original
  `~23:54` was computed from only the *earliest* flagged package
  (`@unrs/resolver-binding@1.12.0` ~15:54Z). A retry at 2026-05-20 00:00
  CST showed the lockfile also contains LATER-published transitives the
  policy rejects — the binding one (`typescript-eslint@8.59.4`,
  `@typescript-eslint/*@8.59.4`, `enhanced-resolve@5.21.4`,
  `baseline-browser-mapping@2.10.31`), latest = **`typescript-eslint@8.59.4`
  published `2026-05-18T17:43:49Z`** → clears 24h at
  `2026-05-19T17:43:49Z` = **2026-05-20 ~01:44 CST**. Lockfile is
  UNCHANGED this session (no deps added); the original estimate simply
  undercounted. Still NOT a scaffold defect; user decision unchanged
  (wait the window — do NOT `pnpm clean --lockfile` / relax policy /
  weaken Dockerfile).
- **Trigger / resolve when:** env clock ≥ ~2026-05-20 01:44 CST
  (publish 2026-05-18T17:43:49Z + 24h, +margin). Then run
  `WEB_PORT=3010 DB_PORT=55470 docker compose up -d --build`, verify the 3
  services (db/web/worker) + web↔db, then push Story 1.1 to review→done.
- **Tracked in:** `1-1-project-scaffold-ci.md` Task 9 + Debug Log;
  `MEMORY.md` (estimate-correction lesson).

## W-1-2-1 — Story 1.2 manual browser verification (camera/HEIC/drag)

- **Status:** RESOLVED (2026-05-19, by on-device test on real iOS
  Safari) — core manual path PASSED (capture entry → native chooser →
  library upload → compress ~482KB → draw mask → card masked → gate
  enables → ready). Two sub-items honestly marked **manual N/A**,
  covered by code/unit instead: (1) out-of-bounds-drag → gate stays
  disabled — iOS touch can't drag finger off-element, protection by P2
  fix (store clamped rect, gate on clamped) + `geometry.test.ts`
  zero-area-when-outside test; (2) decode-error friendly message — iOS
  Safari decodes HEIC natively and `accept="image/*"` blocks non-image
  picks, so the path is near-untriggerable on iOS by normal use; trivial
  typed-error→friendlyError mapping covered at code level. Detail in
  `1-2-capture-compress-mask.md#On-device 驗證結果`.
- **Priority:** P1
- **Story:** 1-2-capture-compress-mask (AC1/AC3/AC6)
- **Gap:** Canvas/pointer interactions cannot be auto-tested in the node
  CI env (AC5 strategy keeps the canvas glue out of node unit tests to
  avoid heavy deps). Specifically un-automated: real device camera capture
  (`capture="environment"`), drag-to-draw/move/remove mask rectangles,
  iOS HEIC decode-failure → friendly-error path. **(2026-05-19 added)**
  Post-review fix: `capture` removed — manual test MUST confirm iOS
  Safari shows the native chooser (Take Photo / Photo Library / Files)
  and that **uploading an existing photo** runs the full
  compress→mask→ready flow (AC1「可改選相簿」).
- **Reason for defer:** Requires a real iOS Safari / Android Chrome
  device; the pure gating maths (`computeResizedDimensions`,
  `clampMaskRect`, `hasUsableMaskOrSkip`) IS fully node-tested (19 tests).
- **Trigger / resolve when:** Manual pass on a real iOS Safari + Android
  Chrome device (weak-network simulation for the store scenario). Record
  result in `1-2-capture-compress-mask.md` Debug Log, then close here.
- **Tracked in:** `1-2-capture-compress-mask.md` Completion Notes (manual
  verification 待辦).

---

## W-1-2b-1 — Story 1.2b multi-page manual browser verification

- **Status:** OPEN
- **Priority:** P1
- **Story:** 1-2b-multi-page-capture (AC1/AC2/AC3/AC6/AC8)
- **Gap:** canvas/pointer/objectURL interactions not node-testable
  (same strategy as W-1-2-1). Un-automated: multi-page accumulate
  ("再拍下一段"), per-page mask, page reorder (上移/下移) + remove,
  finish → ordered deduped Blob[], single-page parity with 1.2,
  thumbnail object-URL lifecycle (no leak on remove/dedupe/reset).
- **Reason for defer:** needs a real iOS Safari / Android Chrome
  device; the list maths (`pages.ts`) IS fully node-tested (21 tests).
- **Trigger / resolve when:** manual pass on the running dev server
  (`http://192.168.1.8:3001`) on a real device — capture ≥2 pages,
  reorder, remove, dedupe (re-capture identical), finish; confirm
  single-page still equals 1.2. Record in `1-2b-...md` Debug Log,
  then close here.
- **Tracked in:** `1-2b-multi-page-capture.md` Completion Notes.

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

## Deferred from: CIP — multi-page receipt (2026-05-19)

> Source: `docs/PRD-multi-page-receipt-roadmap.md`. Multi-page pulled
> into v1, Epic 1 re-sequenced (new Story 1-2b). These are tracked
> risks the re-sequence created.

### W-CR-5 — multi-page parse accuracy is n=0; regression testdata gap

- **Status:** OPEN
- **Priority:** P1
- **Story:** owned by 1-4-vision-llm-parse / 1-5-irc-match-parsed-sum
- **Gap:** single-image feasibility was n=1 (#5564). Multi-page parse
  (N images → one logical receipt, `parsed_sum` across pages) is
  **n=0** — completely unvalidated. `epics.md:349` already wants a
  超長/折疊 regression variant; it must become a *real multi-page*
  fixture, not a single tall image.
- **Reason for defer:** real fixtures land with the LLM stories;
  cannot validate before 1-2b/1.4 exist.
- **Trigger / resolve when:** Story 1.4/1.5 — add a multi-page #5564
  (or equivalent) fixture; assert `parsed_sum == Σ pages − IRC`
  holds; close here.
- **Note:** the single-long-image 1600px-compression resolution risk
  is **resolved by design** (per-page ≤1600px keeps text legible) —
  no separate entry needed.

---

## Resolved

- **W-1-1-1** — RESOLVED 2026-05-20 (docker retry #5): scaffold docker
  compose verified (db/web/worker, G2 init order, web↔db). 3 distinct
  blockers fixed (supply-chain window; pnpm fetch-resilience; pnpm10
  onlyBuiltDependencies + packageManager pin) without weakening
  lockfile/policy. Full entry kept above with RESOLVED status.
- **W-1-2-1** — RESOLVED 2026-05-19 (on-device iOS Safari test): Story
  1.2 capture/compress/mask core manual path passed on a real device;
  out-of-bounds-gate & decode-error sub-items honestly reclassified as
  manual-N/A, covered by P2 fix + node tests / code-level mapping. Full
  entry kept above with RESOLVED status.
