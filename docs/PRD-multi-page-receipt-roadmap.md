# Roadmap: 多頁長收據擷取與解析（CIP integration）

> Canonical roadmap doc for the multi-page-receipt requirement folded
> into v1. Created 2026-05-19 via the Change Integration Protocol after
> the requirement surfaced during on-device dogfood ("一張拍不完"). User
> decision (2026-05-19): **pull into v1, re-sequence Epic 1.**

## 1. Trigger & inventory (CIP Phase 1)

- Surfaced: on-device W-1-2-1 manual test — long receipt (Costco, the
  product's own origin story) does not fit in one photo.
- SSOT read: `prd.md` FR1 / `epics.md` Epic 1 / `sprint-status.yaml` /
  `brainstorming-session-2026-05-17-1812.md`.
- Pre-existing state: FR1 said **一張** (single image). Feasibility was
  **n=1** single image. `brainstorming:115` already listed
  「超長收據中段模糊」 as a *known-but-untested* risk;
  `epics.md:349` regression testdata already wants a 「超長/折疊」 variant.
  No FR/Epic/Story covered multi-image. Single-image was deliberate.

## 2. Map (CIP Phase 2)

| Target | Impact | Nature |
|---|---|---|
| FR1 | 「一張」→「一或多張（連續分頁）」 | Transformative (contract) |
| Story 1.2 (done) | single File→canvas→1 blob → ordered N pages | Retrofit → carved into **Story 1-2b** |
| Story 1.2 AC2 1600px | per-page ≤1600px keeps each page legible — the single-long-image resolution risk is **resolved by** multi-page (no separate fix) | resolved-by-design |
| Story 1.3 (backlog) | upload N blobs; job carries page count | design-time fold-in |
| Story 1.4 (backlog) | single Claude vision call with N images; cost×N logged to `llm_costs` | fold-in, ~1.3–1.5× |
| Story 1.5 (backlog) | `parsed_sum = Σ across pages − IRC`; page dedupe/order | fold-in, ~1.3–1.5× |
| Story 1.6 (backlog) | structure reject must handle multi-page | fold-in |
| Story 1.7 (backlog) | budget counts images; hard page cap | fold-in |

## 3. Re-sequence (CIP Phase 4)

Locked Epic 1 ordering preserved: `1-1 → 1-2 → **1-2b** → 1-3 → 1-4 →
1-5 → 1-6 → 1-7`.

- **NEW Story 1-2b — 多頁長收據擷取**: extend the capture state machine
  to an ordered list of pages; per-page mask (NFR-S3 unchanged, per
  page); add / remove / reorder pages; output an **ordered array of
  masked + compressed blobs**. Only true retrofit; isolated here so the
  done+reviewed Story 1.2 history stays intact.
- 1-3..1-7: fold the multi-image contract into ACs **at create-story
  time** (backlog → no done-retrofit cost).

### Cost vs add-only baseline

- Add-only (rejected, silent): uncontrolled retrofit discovered after
  1.4/1.5 ship.
- Conflict-aware: **+1 story (1-2b)**; 1.4 & 1.5 ≈ 1.3–1.5× effort.
  Epic 1: 7 → **8 stories**. Cheap *now* because 1.3–1.7 are still
  backlog (design-time fold-in, not done retrofit).

## 4. Risks (CIP Phase 6)

- **HIGH** — LLM cost: N images per parse. NFR-L3/L5 budget must count
  images + enforce a hard page cap. Multi-page parse accuracy is now
  **n=0** (single was n=1) → v1 regression testdata MUST include a real
  multi-page case (extends the existing 超長 variant). → `W-CR-5`.
- **MEDIUM** — cross-page reconciliation (1.5): printed total on one
  page; duplicate / missing / out-of-order page → wrong `parsed_sum`.
  The Epic 2 reconciliation gate catches sum mismatch (its job), but
  1-2b/1.4 need page dedupe + stable ordering.
- **MEDIUM** — UX over-engineering on a 小工具: keep multi-page
  capture dead-simple (「再拍下一段 / 完成」); resist a heavy page
  manager. Honors 「小工具非商業 / 拒絕過度設計」.
- **LOW** — SSOT consistency: FR1 / epics / sprint-status / story
  numbering updated together in this commit.
- **INFO** — single-long-image 1600px resolution risk: resolved by
  multi-page; no separate fix needed.

## 5. Decision points

1. **Retrofit vehicle** → new **Story 1-2b** (TAKEN — preserves done
   Story 1.2; retrofit visible/tracked; no history rewrite).
2. **LLM multi-image strategy** (decide at 1.4 create-story) —
   *recommended:* single Claude vision call with N images (native
   multi-image, one cost record, simpler reconciliation) vs
   per-page+merge.
3. **Max pages cap** (decide at 1.7) — *recommended:* hard cap, default
   **≤5 pages/parse**, to bound LLM cost + UX.

## 6. Commit (CIP Phase 5) — files synced

`prd.md` FR1 · `epics.md` (FR1 + Story 1.2 note + new Story 1-2b +
1.3–1.7 fold-in notes) · `sprint-status.yaml` (insert
`1-2b-multi-page-capture`) · `deferred-work.md` (`W-CR-5`) · project
memory · this roadmap.
