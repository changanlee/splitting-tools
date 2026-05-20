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

- **Status:** RESOLVED (2026-05-20, by Story 1.4). The parse consumer
  landed (`parseWorker`); `src/workers/index.ts` `boss.on("error")`
  now logs and `process.exit(1)` so the orchestrator restarts a
  broken-queue worker instead of treating it as healthy. Trigger
  ("Story adds the parse consumer") met and addressed.
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

## W-1-3-1 — Story 1.3 runtime integration smoke (upload→enqueue→poll)

- **Status:** OPEN
- **Priority:** P1
- **Story:** 1-3-async-parse-job-polling (AC1/AC2/AC3/AC5)
- **Gap:** Route Handler ↔ pg-boss ↔ Postgres integration is not
  node-tested (AC8 strategy; same precedent as W-1-2-1/W-1-2b-1). Pure
  logic (Zod/validate/budget/status-map) IS node-tested (12 tests);
  typecheck+build green. Un-verified at runtime: `POST /api/splits`
  → `POST .../parse-jobs` (multipart, p95<1s `{jobId}`) → pg-boss job
  actually enqueued → `GET .../[jobId]` returns status → poll stops at
  terminal; enqueue-failure → markJobFailed terminal path.
- **Reason for defer:** needs the docker stack up + an end-to-end
  exercise; heavy to automate inside the autonomous loop.
- **Trigger / resolve when:** `WEB_PORT=3010 DB_PORT=55470 docker
  compose up -d --build`, then curl the 3 endpoints (create session →
  multipart submit a small JPEG → poll). Confirm jobId <1s, a
  `pgboss`-schema job row exists, status endpoint friendly-only.
  Record in `1-3-...md` Debug Log, close here. (Note: no consumer yet
  — job stays `queued`/in pg-boss until Story 1.4; that is expected.)
- **Tracked in:** `1-3-async-parse-job-polling.md` Completion Notes.

## W-1-4-1 — Story 1.4 real vision-LLM runtime verification

- **Status:** ⚠️ **PARTIALLY RESOLVED 2026-05-20** — vision-LLM runtime +
  OpenRouter migration GREEN against **a** real multi-page receipt; the
  **specific Taiwan #5564 ground-truth** still NOT verified (the smoke
  receipt was a 中國大陸 Costco, item names in 簡體中文 — not the
  Taiwan-spec fixture the placeholder anchor is named for). The
  regression `it.todo` REMAINS gated; honest non-silent split below.
  - **Resolved portion (smoke against a real 2-page CN-Costco receipt
    via `http://172.20.10.3:3010` from iPhone over LAN; docker compose):**
    - parse_jobs `7919e058…` → `succeeded` in 33s wall (9.1s vision call)
    - 28 lines persisted; 3 IRC discounts attributed (#8511322 → line 4,
      #8519804 → line 9, #8511865 → line 19); pre-IRC gross = 220,850
      cents, post-IRC net = **213,150 cents** (~NT$2,131.50 if read as
      hundredths)
    - llm_costs row: `model=anthropic/claude-sonnet-4.6`, `prompt=3681`,
      `completion=1594`, `cost_usd=0.034953`, `success=t` — confirms the
      OpenRouter slug path (no leftover Anthropic-direct call)
    - Cost preference: live `usage.cost` (markup-inclusive) honoured
    - Single-attempt success on primary; no fallback to Haiku triggered;
      no degraded write; friendly-error path NOT exercised this run
    - Pre-flight bug found+fixed: pg-boss v12 requires `createQueue`
      before `work`; worker exited (1) silently within seconds of boot
      until commit `3cca628` added the idempotent create on both
      `parseWorker` and `lifecycleWorker`.
  - **Still OPEN (W-1-4-1b):** the spec's #5564 anchor (`220_850` cents
    in `regression-invariants.test.ts`) is a **Taiwan** receipt. Need
    one upload of an actual TW #5564 to fill the `it.todo`, plus an
    induced failure to exercise the friendly-`parse_jobs.error` path
    + the haiku fallback chain (NFR-R1). Whether the #5564 anchor itself
    needs revisiting — it might have been authored from the pre-IRC
    gross of a different physical receipt — is a separate decision
    (don't unilaterally rename the anchor).
- **Priority:** P1
- **Story:** 1-4-vision-llm-parse (AC2/AC3/AC5/AC9)
- **Gap:** no `OPENROUTER_API_KEY` in the autonomous env, so the actual
  multi-image call (`anthropic/claude-sonnet-4.6` primary → `anthropic/
  claude-haiku-4.5` fallback via OpenRouter), structured-output JSON
  schema enforcement, token-usage→cost (preferring OpenRouter's
  `usage.cost` field over the offline cost.ts table), retry/degradation
  on real 429/5xx, and #5564 parse accuracy are NOT runtime-verified.
  Pure logic (schema/cost/retry) IS node-tested; visionAdapter is
  type-checked + static-scanned (single boundary, no leak).
- **Reason for defer:** needs a real API key + a real receipt; can't
  be done unattended without fabricating (would violate "no lying").
- **Trigger / resolve when:** with `OPENROUTER_API_KEY` set, run the
  worker against a real #5564 image; confirm structured lines parse,
  `llm_costs` row written with non-zero cost (live `usage.cost` if
  returned), degradation path on an induced failure, friendly-only
  `parse_jobs.error`. Record in `1-4-...md` Debug Log; then fill the
  regression `it.todo`.
- **Tracked in:** `1-4-vision-llm-parse.md`; relates to W-CR-5.

## W-1-4-2 — Degradation cache / last-good tier

- **Status:** OPEN
- **Priority:** Phase-later
- **Story:** parsing reliability (revisit when a prior-good store exists)
- **Gap:** NFR-R1 names a "cache / last-good" tier between model
  fallback and the static/friendly message. Not implemented — there
  is no persisted prior-good parse to fall back to yet. The chain
  today is sonnet×3 → haiku×3 → friendly (still satisfies retry≥3 +
  cheaper-model degradation + no raw leak).
- **Reason for defer:** building a last-good cache now (no store, no
  reuse key) is premature; the friendly terminal already prevents a
  deadlock (NFR-R2).
- **Trigger / resolve when:** if/when parsed receipts are persisted
  (Story 1.5 receipt_lines), add a last-good lookup before the
  friendly fallback.

## W-1-4-3 — Formalize 1.4→1.5 parsed-line persistence

- **Status:** ✅ RESOLVED 2026-05-20 (Story 1.5 dev-story)
- **Priority:** P1
- **Story:** owned by 1-5-irc-match-parsed-sum
- **Gap:** Story 1.4 hands the parsed receipt to 1.5 as the **pg-boss
  job output** (handler return value) — deliberate, since AC6 forbids
  an app schema-table change in 1.4. Story 1.5 needs IRC attribution
  over `receipt_lines`; the canonical persistence (a `receipt_lines`
  table + how 1.5 reads 1.4's output) is 1.5's to formalize.
- **Reason for defer:** receipt_lines schema is Story 1.5 scope;
  1.4 must not pre-empt it. Job-output hand-off is the minimal,
  single-Postgres, no-schema-change bridge.
- **Resolution:** Story 1.5 owns `receipt_lines` — added the Drizzle
  table (`src/db/schema.ts`, migration `0001_gifted_night_thrasher`),
  the pure IRC algorithm (`src/features/parsing/irc.ts`), and the
  idempotent writer (`persistReceiptLines`). The read path is the
  **minimal in-worker hand-off**: `parseWorker` success branch does
  `attributeIrc(outcome.receipt) → persistReceiptLines → markJobStatus`
  in one guarded try/catch (no cross-process pg-boss-output read; a DB
  blip best-effort `markJobFailed` and never rethrows, preserving
  NFR-R2 / no Claude re-parse). parsed_sum is `Σ gross_cents` over a
  job's rows (no schema bloat; spec AC6). Failed/degraded jobs write
  nothing. Gate green (typecheck/lint/test 82pass2todo/build).

## W-1-3-2 — Move parse images out of the pg-boss payload at scale

- **Status:** OPEN
- **Priority:** Phase-later
- **Story:** infra / scale-stage (revisit when DAU or receipt volume
  grows, or pages cap raised)
- **Gap:** Story 1.3 carries masked page images as base64 inside the
  pg-boss job payload (single-Postgres, no schema change, cross-
  container — correct & minimal now; bounded by MAX_PARSE_PAGES=5
  ≈ ~3MB/job). At scale this bloats the queue table / WAL.
- **Reason for defer:** premature object storage = the
  "為萬一爆紅過度設計" anti-pattern; the architecture mandates single
  Postgres at DAU<10k stage-0.
- **Trigger / resolve when:** before raising the page cap materially
  OR at the 10k–50k scale stage — move blobs to object storage /
  shared volume, payload carries only references.

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

## Deferred from: code review of story-1.5 (2026-05-20)

- **W-CR-6** — parseWorker total-DB-outage double-fault. Status: OPEN,
  Priority: P2. If `persistReceiptLines` fails AND the best-effort
  `markJobFailed` also fails (full DB outage), the job is left
  non-terminal until pg-boss redelivery. Pre-existing Story 1.4
  design (W-CR-1 already adjudicated the terminal-write-failure
  tradeoff: do NOT rethrow → no Claude re-cost). Story 1.5 widened the
  guarded block (persist now inside it) and added P3 (a post-persist
  status-write failure no longer flips the job to a permanent wrong
  "failed"), which narrows exposure. Residual: a sustained total
  outage self-heals only on redelivery once the DB recovers (persist
  is now transactional + idempotent). Revisit if NFR-R2 needs a hard
  bound (e.g. a dead-letter / max-redelivery alarm).
- **W-CR-7** — receipt_lines FK `ON DELETE no action` vs Story 6.1.
  Status: OPEN, Priority: owned by 6-1-30day-verifiable-destroy.
  Deleting a `sessions`/`parse_jobs` row with child `receipt_lines`
  is blocked unless children are deleted first. This matches the
  existing schema convention (`parse_jobs`/`llm_costs` → `sessions`
  are also plain `.references()` = no action) — NOT a 1.5 regression.
  Story 6.1 owns 30-day verifiable destruction and must define the
  cascade/ordered-delete (and decide CASCADE vs app-ordered) across
  all child tables incl. receipt_lines. Carry into Story 6.1 ACs.
- **W-CR-8** — receipt_lines bulk-insert bind-parameter ceiling.
  Status: OPEN, Priority: Phase-later (scale-stage, akin to W-1-3-2).
  `persistReceiptLines` does one bulk `insert().values([...])`; ~14
  columns × rows hits Postgres' 65535 bind-param limit at ~4680 rows.
  Not reachable today: input is hard-capped at `MAX_PARSE_PAGES=5`
  (a Costco receipt is ≪ a few hundred lines). Revisit (chunked
  inserts) only if the page cap is raised or row counts grow.

## Deferred from: Epic 4 autonomous batch (2026-05-20)

- **W-4-3-1** — Story 4.3 (identity-token isolation hardening).
  Status: OPEN, P2. v1 ships last-write-wins for `mode='pick'` — a
  second device with a different token that picks an existing
  identity REBINDS the row to its token (the original device loses
  authz). Acceptable for the friend-group trust model in v1; harden
  to "name+token nonce" or require confirmation when the row was
  bound < N minutes ago. Owner: 4-3 follow-up.
- **W-4-7-1** — Story 4.7 (pending race authority). Status: OPEN, P2.
  Pending-line COUNT is surfaced in ClaimBoardBody; full
  payer-side arbitration UI (highlight unclaimed lines, force-assign
  via payer, conflict resolution between simultaneous claimers via
  server-arbitrated last-writer-wins+notify) deferred to follow-up.
- **W-4-8-1** — Story 4.8 (claim-board polling). Status: OPEN, P2.
  Current revalidation is form-based (each submit triggers
  `revalidatePath`). A React-Query 5-10s polling layer over a
  `GET /api/splits/[linkId]/board` JSON endpoint is the next step
  for friends watching shares update live. Defer until traffic
  warrants — for ~3 friends in a Costco trip, form revalidate is
  sufficient.
- **W-4-9-1** — Story 4.9 (audit-trail prior-value capture). Status:
  OPEN, P3. The undo path for `action='weight'` only knows the NEW
  weight (no prior captured in details). v1 falls back to weight=1
  on undo. Capture prior in details on `setClaimWeightAction` to
  make undo exact.

## Deferred — Epic 5 stretch (not started 2026-05-20)

- **Story 5.2** settlement-page-trust-thumbnail — settlement UI
  surface; backlog.
- **Story 5.3** plaintext-export — text dump for sharing;
  backlog.
- **Story 5.4** payer-absorb-finalize — explicit absorb of pending +
  finalize session; backlog.
- **Story 5.5** freeze-readonly-late-joiner — frozen state once
  finalized; backlog.

## Deferred — Epic 6 stretch (not started 2026-05-20)

- **Story 6.1** 30-day-verifiable-destroy — lifecycleWorker + verified
  delete (NFR-S4); backlog.

## Deferred from: code review of story-2.1 (2026-05-20)

- **W-2-1-3** — `linkId` URL-segment shape validation. Status: OPEN,
  owned by 3-1-unguessable-link. Today `/splits/[linkId]/review` reads
  `linkId` straight into a Drizzle parameterized `eq(sessions.id, …)`
  with no length/charset guard. Malformed input causes a Postgres
  query error swallowed by the page's friendly-error catch — the
  payer sees "暫時無法載入" indistinguishably from a real outage.
  Not SQL-injectable (parameterized). Story 3.1 owns link-id format
  (base64url, ≥128-bit entropy) and should add the regex guard +
  honest 404 path then; fold into 3-1's AC.
- **W-2-1-4** — IRC visual grouping (sort children under their parent).
  Status: OPEN, owned by 2-4-irc-rebind-parent. Currently
  ReceiptLineRow renders flat by `line_no` ASC, which matches
  1.5's preserved scan order. For typical #5564 receipts an IRC line
  follows its parent in scan order so the visual reads correctly,
  but an out-of-order parse would show 折抵 above the discounted
  line. Story 2.4 will introduce IRC-rebind UX and is the natural
  place to ship a `groupIrcUnderParent(lines)` layout helper. Defer
  the layout polish to that story.

## Deferred from: Story 2.1 (2026-05-20)

- **W-2-1-1** — Sticky/visual smoke on real mobile. Status: OPEN,
  Priority: P3 (post-deploy). `StickySubtotalBar` + readonly review
  page are Server-Component pure CSS; sticky scroll behaviour, dark-
  mode rendering, and "賣場 single-glance" usability need an actual
  device pass once a session exists in a deployed env. Algorithm
  proven by `compute.test.ts` / `formatCents.test.ts`; UI verifies
  via build + manual.
- **W-2-1-2** — End-to-end aggregation accuracy on REAL receipts.
  Status: OPEN, gated by `W-1-4-1` / `W-CR-5`. The pure
  `computeReconciliation` and `formatCents` are node-tested; the SQL
  read in `getReconciliationSummary` is glue (typecheck + build
  verified). Real `parsed_sum = Σ gross_cents` accuracy against a
  live #5564 parse depends on running the full 1.4→1.5 pipeline with
  an API key (gated W-1-4-1) and was honestly NOT claimed here.

## Deferred from: Story 1.7 (2026-05-20)

- **W-1-7-1** — `checkParseBudget` fail-OPEN on DB outage (v1 explicit
  tradeoff). Status: OPEN, Priority: P2 (revisit at stage ≥ 1k DAU).
  If the `rate_counters` upsert throws (DB blip / unavailable), the
  seam logs and returns `ok:true` so a legitimate payer is not
  deadlocked (NFR-R2 / NFR-P1 preferred over grief shield in v1; the
  preceding `validateParseSubmit` + `sessionExists` lookups would
  have already failed under a real DB outage). At stage ≥ 1 we may
  invert to fail-CLOSED with a circuit breaker + alerting; until
  then, the explicit choice is documented here and in the seam.
- **W-1-7-2** — Per-traffic budget tuning + real concurrency / race.
  Status: OPEN, Priority: post-deploy. `PER_SESSION_DAILY_PAGES=40`,
  `PER_IP_DAILY_PAGES=200`, `RATE_WINDOW_MS=24h` are conservative
  stage-0 defaults — tune with real traffic distributions. The single
  UPSERT can over-count slightly at burst boundaries (accepted
  v1 grief-shield tradeoff). Real high-concurrency race / per-minute
  burst limiting / CAPTCHA-style mitigations belong here.
- **W-1-7-3** — Trusted-proxy gate / IP-spoofing hardening for bare
  deployments. Status: OPEN, Priority: P2 (depends on deployment).
  `extractClientIp` trusts the X-Forwarded-For first hop, which is
  correct ONLY behind a single trusted proxy that overwrites/normalizes
  XFF (Cloudflare / Vercel / our reverse proxy). A bare deployment
  (direct exposure) lets an attacker rotate XFF to bypass the per-IP
  cap entirely. v1 ships behind a known proxy, so the assumption is
  documented but not enforced. Add `TRUST_PROXY=1` env gate + safe
  fallback (e.g. Node `req.socket.remoteAddress` via the underlying
  adapter) when staging supports it.
- **W-1-7-4** — `rate_counters` TTL/GC for orphaned/spam keys.
  Status: OPEN, Priority: stage ≥ 1 (monitoring + cleanup).
  `checkParseBudget` writes a `session:<linkId>` key BEFORE
  `sessionExists` — by design, so grief on nonexistent linkIds is
  rate-limited too — but it also leaves orphan rows for junk linkIds.
  Spam from rotated IPs likewise leaves IP rows. There is no cron /
  cleanup path today; add a daily worker that `DELETE FROM
  rate_counters WHERE window_start < NOW() - INTERVAL '2 days'`
  when traffic warrants it (or piggy-back on Story 6.1
  lifecycleWorker once that lands).
- **W-1-7-1 (extended 2026-05-20, story-1.7 code-review)** —
  `Promise.all` coupled fail-OPEN: if the IP-key UPSERT throws AFTER
  the session-key UPSERT already incremented (or vice-versa), the
  catch in `checkParseBudget` fails OPEN on the whole request — but
  the successful key now carries `+pages` phantom usage. Self-heals
  over 24h as the window rolls. Same fail-OPEN-class residual as
  pool-exhaustion → all-fail-OPEN under heavy burst. Both are the
  accepted v1 NFR-R2/NFR-P1 tradeoff (legitimate payer not deadlocked
  > strict enforcement). Revisit alongside W-1-7-1 with circuit
  breaker + alerting at stage ≥ 1k DAU.

## Deferred from: code review of story-1.6 (2026-05-20)

- **W-CR-9** — structureGuard tax/currency heuristic precision.
  Status: **VOID 2026-05-20** — FR7 reverted; `structureGuard.ts` deleted
  along with its tests. The precision concern is moot (no classifier
  to tune). Kept here as historical record. Original text below:
  Status: OPEN, Priority: P2 (gated by W-1-4-1). `TAX_RE` matches a
  tax substring *anywhere* in `rawText+description`: `tax-free`
  (hyphen is a `\b`), a product name containing `稅額`, or — most
  importantly — the real #5564 footer if Story 1.4 emits it as a line
  carrying `營業稅`/`稅額` (both matched) would FALSE-REJECT the very
  receipt v1 must accept (AC1). `FOREIGN_CURRENCY_RE` matches a bare
  `[¥€£₩]` anywhere (decorative glyph in a product name → false
  reject) and misses glued tokens like `USD12` (`\bUSD\b` boundary →
  false negative). These are precision-tuning concerns on a heuristic
  that *fundamentally cannot be validated without real #5564 OCR*
  (gated W-1-4-1; W-CR-5 multi-page n=0). The spec's Debug Log already
  records the deliberate fail-closed tradeoff (bare single `稅`/`税`
  excluded on purpose); fail-closed conservative false-reject is the
  explicit FR7 stance. Do NOT guess-tune without real data. Revisit
  with W-1-4-1 (live parse) to confirm which footer/lines 1.4 actually
  emits, then tighten anchoring (line-dominated-by-tax-term, currency
  adjacent to a numeric amount).
- **W-CR-6 (extended 2026-05-20, story-1.6)** — the Story 1.6
  structure-reject path (`markJobFailed(STRUCTURE_REJECT_MESSAGE)
  .catch(log); continue;`) is another instance of the same accepted
  best-effort double-fault residual: if that `markJobFailed` fails on
  a DB blip the job stays non-terminal until pg-boss redelivery. Same
  pattern as the 1.4 visionAdapter-exhausted `else` branch and 1.5;
  NOT 1.6-specific. Covered by the existing W-CR-6 tradeoff (no
  rethrow → no Claude re-cost; self-heals on redelivery). No separate
  entry — tracked here under W-CR-6.

---

## Resolved

- **W-1-1-1** — RESOLVED 2026-05-20 (docker retry #5): scaffold docker
  compose verified (db/web/worker, G2 init order, web↔db). 3 distinct
  blockers fixed (supply-chain window; pnpm fetch-resilience; pnpm10
  onlyBuiltDependencies + packageManager pin) without weakening
  lockfile/policy. Full entry kept above with RESOLVED status.
- **W-CR-1** — RESOLVED 2026-05-20 (Story 1.4): parse consumer landed;
  pg-boss post-start error now logs + exits non-zero (orchestrator
  restarts) instead of a silently-dead worker. Full entry above.
- **W-1-2-1** — RESOLVED 2026-05-19 (on-device iOS Safari test): Story
  1.2 capture/compress/mask core manual path passed on a real device;
  out-of-bounds-gate & decode-error sub-items honestly reclassified as
  manual-N/A, covered by P2 fix + node tests / code-level mapping. Full
  entry kept above with RESOLVED status.
- **W-1-4-3** — RESOLVED 2026-05-20 (Story 1.5 dev-story): receipt_lines
  table + pure IRC algorithm + idempotent writer landed; 1.4→1.5
  hand-off formalized as the minimal in-worker success-path bridge
  (no cross-process output read; NFR-R2 preserved). Full entry above.
