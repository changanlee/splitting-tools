# Parsing regression fixtures

## Receipt #5564 — the canonical regression anchor

`parsed_sum` for the real Costco receipt #5564 is **NT$2208.50 =
`220850` integer cents**. This is the cross-epic regression contract:

- **Story 1.4 / 1.5** replace `receipt-5564.placeholder.ts` with the real
  receipt image + the LLM-parsed line items, and the
  `parsed_sum == 2208.50` invariant becomes a live assertion against that
  parsed output.
- **Story 5.1** implements the deterministic settlement function
  (`src/lib/money/settle.ts`, FR50); the `settlement_sum == parsed_sum`
  invariant then asserts the settlement of #5564 sums back to `220850`.
- Story 1.4 also adds the **3–5 receipt variants** (multi-page, discount
  lines, tax rounding, etc.) alongside #5564.

> ⚠️ Story 1.1 (scaffold) only ships the **placeholder** + the harness
> wiring. The CI pipeline genuinely runs these assertions today (against
> the placeholder anchor); later stories swap the data/logic **without
> rebuilding the pipeline**. Do not delete or rename the invariant test
> ids — they are carry-forward anchors.
