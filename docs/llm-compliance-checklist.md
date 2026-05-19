# LLM Compliance Checklist — splitting_tools

> Project-local SSOT for the **7 non-negotiables** that every LLM-boundary
> story must account for. Adopted 2026-05-19 from the Plutus verification
> method (proportionate subset — this is a small non-commercial tool, no
> over-engineering). Authoritative source of the rules themselves:
> `~/.claude/CLAUDE.md` Side Project 工程標準 + `architecture.md`.

## How stories use this

A story is an **LLM-boundary story** if its diff touches
`src/lib/llm/**` (the single Claude vision boundary `visionAdapter`), the
parse endpoint / parse worker, or `llm_costs` / `rate_counters`.

Every LLM-boundary story spec MUST include an **`## LLM Compliance`**
subsection mapping items 1–7 to one of:

- **✅ on-spec** — story has an AC + Task exercising it; cite AC# + code path
- **⏸ inherited (story X)** — quote the prior story/commit that satisfied
  it; add one Task that verifies the wiring still holds (no re-implement)
- **⚠ deferred** — intentional gap; MUST point to a `deferred-work.md`
  entry with priority + reason
- **N/A (by architecture)** — genuinely not applicable; cite the
  architecture decision (e.g. item 6 below)

**Gate:** a story MUST NOT flip to `ready-for-dev` if any item is
unaccounted. Items **1, 2, 3, 4, 5 are P0** — they cannot land in
`deferred-work.md` without an explicit user override. Items **6, 7** are
P1. Non-LLM stories (e.g. Story 1.2 — pure client capture/mask) record
"N/A — no LLM call" and skip the subsection.

**Code review:** when a diff is an LLM-boundary diff, the
`bmad-code-review` run adds an **LLM Compliance Hunter** that emits one
finding per uncovered/deferred item (file:line evidence or deferred-work
id). Non-LLM diffs auto-skip this hunter.

## The 7 non-negotiables (localized to this stack)

| # | Requirement | splitting_tools mechanism | Owning story | Sev |
|---|---|---|---|---|
| 1 | Exponential backoff + jitter retry ≥3 (5xx/429 transient) | pg-boss built-in jittered backoff (NFR-L1); only via `visionAdapter` | 1.1 foundation → **1.4** | P0 |
| 2 | Persisted token/cost budget (DB/Redis, not memory; ≥ per-user-per-day) | `llm_costs` table (Story 1.1) + per-session-day aggregate; `rate_counters` | 1.1 foundation → **1.4** (NFR-L3) / **1.7** | P0 |
| 3 | >1s ops async/queue (no blocking request thread) | pg-boss worker; parse submitted as job, immediate `jobId` | **1.3** (NFR-P1/L4) → 1.4 | P0 |
| 4 | Graceful degradation / fallback chain | Sonnet 4.6 → Haiku 4.5 → cache → static → friendly msg | **1.4** (NFR-R1) | P0 |
| 5 | Structured per-call LLM log (model, tokens, latency, cost, ids, success) | `llm_costs` columns; written every call inside `visionAdapter` | 1.1 schema → **1.4** (NFR-L2/L5) | P0 |
| 6 | SSE streaming chat UX | **N/A by architecture** — async job + polling model (not chat); `ParseProgress`/job-status polling, not token streaming. Cite architecture.md Implementation Sequence. | — | P0→N/A |
| 7 | Per-user rate limit at LLM boundary | `rate_counters` token-bucket per session / per-IP at parse endpoint | **1.7** (FR46 / NFR-S7 / NFR-L5) | P1 |

## Story ledger (which stories are LLM-boundary)

- **1.1 scaffold** — laid foundations only (`llm_costs`/`rate_counters`
  tables, pg-boss worker shell, `visionAdapter` NotImplemented stub). No
  LLM call. ✅ foundations in place.
- **1.2 capture/compress/mask** — pure client-side, **no LLM call → N/A**.
- **1.3 async parse submit + polling** — LLM-boundary (item 3 on-spec;
  1,2,4,5 ⏸ pending 1.4; 7 ⏸ pending 1.7) — fill subsection at create-story.
- **1.4 vision LLM parse (LLM-Ops wrapper)** — the core LLM story; items
  1,2,4,5 ✅ on-spec here; 3 ⏸ inherited 1.3.
- **1.7 parse endpoint budget** — item 7 ✅ on-spec; 2 reinforced.
- All other epics (2–6) — non-LLM unless a future story adds an LLM call;
  then this checklist applies.
