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

## Resolved

_(none yet — entries move here with a `RESOLVED (date, by story/commit)`
line and a one-line resolution summary; never deleted.)_
