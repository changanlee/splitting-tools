import { describe, expect, it } from "vitest";

import { recomputeNets } from "@/features/reconciliation/recompute";

describe("recomputeNets — IRC re-fold over current line set", () => {
  it("parent net = gross + Σ(child IRC); IRC orphan if no valid parent", () => {
    const lines = [
      { id: "p1", grossCents: 9990, isIrc: false, ircAttributedTo: null },
      { id: "p2", grossCents: 4490, isIrc: false, ircAttributedTo: null },
      { id: "i1", grossCents: -900, isIrc: true, ircAttributedTo: "p2" },
      { id: "i2", grossCents: -500, isIrc: true, ircAttributedTo: null },
    ];
    const out = recomputeNets(lines);
    const byId = Object.fromEntries(out.map((o) => [o.id, o]));
    expect(byId.p1).toEqual({ id: "p1", netCents: 9990, orphan: false });
    expect(byId.p2).toEqual({ id: "p2", netCents: 4490 - 900, orphan: false });
    expect(byId.i1).toEqual({ id: "i1", netCents: -900, orphan: false });
    expect(byId.i2).toEqual({ id: "i2", netCents: -500, orphan: true });
  });

  it("multiple IRC same parent accumulate", () => {
    const lines = [
      { id: "p", grossCents: 10000, isIrc: false, ircAttributedTo: null },
      { id: "a", grossCents: -500, isIrc: true, ircAttributedTo: "p" },
      { id: "b", grossCents: -300, isIrc: true, ircAttributedTo: "p" },
    ];
    const out = recomputeNets(lines);
    expect(out.find((o) => o.id === "p")?.netCents).toBe(10000 - 500 - 300);
  });

  it("IRC pointing at a non-existent id → orphan", () => {
    const lines = [
      { id: "p", grossCents: 1000, isIrc: false, ircAttributedTo: null },
      { id: "i", grossCents: -100, isIrc: true, ircAttributedTo: "ghost" },
    ];
    const out = recomputeNets(lines);
    expect(out.find((o) => o.id === "i")?.orphan).toBe(true);
    // Parent untouched
    expect(out.find((o) => o.id === "p")?.netCents).toBe(1000);
  });

  it("IRC pointing at another IRC (illegal) → orphan", () => {
    const lines = [
      { id: "i1", grossCents: -500, isIrc: true, ircAttributedTo: null },
      { id: "i2", grossCents: -300, isIrc: true, ircAttributedTo: "i1" },
    ];
    const out = recomputeNets(lines);
    expect(out.every((o) => o.orphan === true)).toBe(true);
  });

  it("conservation: Σ gross preserved by recompute (re-fold doesn't shift the sum)", () => {
    const lines = [
      { id: "p1", grossCents: 9990, isIrc: false, ircAttributedTo: null },
      { id: "p2", grossCents: 4490, isIrc: false, ircAttributedTo: null },
      { id: "i", grossCents: -900, isIrc: true, ircAttributedTo: "p1" },
    ];
    const grossSum = lines.reduce((a, l) => a + l.grossCents, 0);
    const out = recomputeNets(lines);
    // Σ gross equals the verified-baseline by definition (we don't
    // mutate gross). The recompute's correctness contract is on the
    // net distribution: Σ(parent net) + Σ(IRC own net) - Σ(IRC gross
    // again on parents) should equal Σ gross. Simpler invariant:
    // Σ(parent net) + Σ(orphan IRC net) for the claimable settlement
    // basis equals Σ gross (1.5 AC4 decomposition).
    const claimableSum = out
      .filter((o, i) => !lines[i].isIrc)
      .reduce((a, o) => a + o.netCents, 0);
    const orphanIrcSum = out
      .filter((o, i) => lines[i].isIrc && o.orphan)
      .reduce((a, o) => a + o.netCents, 0);
    expect(claimableSum + orphanIrcSum).toBe(grossSum);
  });
});
