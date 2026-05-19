import { describe, expect, it } from "vitest";

import {
  addPage,
  allPagesDecided,
  computeSignature,
  dedupePages,
  movePage,
  nextPageId,
  orderedPageIds,
  type Page,
  removePage,
} from "@/lib/image/pages";

const p = (id: string, signature = id, decided = true): Page => ({
  id,
  signature,
  decided,
});

describe("addPage (AC1/AC4: append, immutable)", () => {
  it("appends to the end and does not mutate the input", () => {
    const a = [p("1")];
    const b = addPage(a, p("2"));
    expect(b.map((x) => x.id)).toEqual(["1", "2"]);
    expect(a.map((x) => x.id)).toEqual(["1"]); // original untouched
  });
});

describe("removePage (AC3: remove by id)", () => {
  it("removes the matching id, preserving order", () => {
    const list = [p("1"), p("2"), p("3")];
    expect(removePage(list, "2").map((x) => x.id)).toEqual(["1", "3"]);
  });
  it("is a no-op when id is absent", () => {
    const list = [p("1")];
    expect(removePage(list, "x").map((x) => x.id)).toEqual(["1"]);
  });
});

describe("movePage (AC3: reorder with boundary safety)", () => {
  it("moves a middle page up", () => {
    const list = [p("1"), p("2"), p("3")];
    expect(movePage(list, "2", "up").map((x) => x.id)).toEqual([
      "2",
      "1",
      "3",
    ]);
  });
  it("moves a middle page down", () => {
    const list = [p("1"), p("2"), p("3")];
    expect(movePage(list, "2", "down").map((x) => x.id)).toEqual([
      "1",
      "3",
      "2",
    ]);
  });
  it("is a no-op moving the first page up (top boundary)", () => {
    const list = [p("1"), p("2")];
    expect(movePage(list, "1", "up")).toBe(list);
  });
  it("is a no-op moving the last page down (bottom boundary)", () => {
    const list = [p("1"), p("2")];
    expect(movePage(list, "2", "down")).toBe(list);
  });
  it("is a no-op when id is absent", () => {
    const list = [p("1")];
    expect(movePage(list, "x", "up")).toBe(list);
  });
  it("does not mutate the input", () => {
    const list = [p("1"), p("2")];
    movePage(list, "1", "down");
    expect(list.map((x) => x.id)).toEqual(["1", "2"]);
  });
});

describe("dedupePages (AC4: keep first by signature, preserve order)", () => {
  it("keeps the first occurrence of each signature", () => {
    const list = [
      p("a", "sig1"),
      p("b", "sig2"),
      p("c", "sig1"),
      p("d", "sig2"),
      p("e", "sig3"),
    ];
    expect(dedupePages(list).map((x) => x.id)).toEqual(["a", "b", "e"]);
  });
  it("returns empty for empty, and is identity for all-unique", () => {
    expect(dedupePages([])).toEqual([]);
    const u = [p("1", "s1"), p("2", "s2")];
    expect(dedupePages(u).map((x) => x.id)).toEqual(["1", "2"]);
  });
});

describe("allPagesDecided (AC5: non-empty AND every page decided)", () => {
  it("is false for an empty list", () => {
    expect(allPagesDecided([])).toBe(false);
  });
  it("is true when every page is decided", () => {
    expect(allPagesDecided([p("1"), p("2")])).toBe(true);
  });
  it("is false when any page is undecided", () => {
    expect(allPagesDecided([p("1"), p("2", "s2", false)])).toBe(false);
  });
});

describe("orderedPageIds", () => {
  it("returns ids in list order", () => {
    expect(orderedPageIds([p("x"), p("y"), p("z")])).toEqual(["x", "y", "z"]);
  });
});

describe("nextPageId (secure-context-free unique id)", () => {
  it("returns distinct ids on successive calls", () => {
    const a = nextPageId();
    const b = nextPageId();
    expect(a).not.toBe(b);
    expect(typeof a).toBe("string");
    expect(a.length).toBeGreaterThan(0);
  });
});

describe("computeSignature (AC4: deterministic non-crypto dedupe signature)", () => {
  it("is deterministic for identical input", () => {
    expect(computeSignature(100, [1, 2, 3])).toBe(
      computeSignature(100, [1, 2, 3]),
    );
  });
  it("changes when the size differs", () => {
    expect(computeSignature(100, [1, 2, 3])).not.toBe(
      computeSignature(101, [1, 2, 3]),
    );
  });
  it("changes when the sampled bytes differ", () => {
    expect(computeSignature(100, [1, 2, 3])).not.toBe(
      computeSignature(100, [1, 2, 4]),
    );
  });
  it("handles an empty sample", () => {
    const s = computeSignature(0, []);
    expect(typeof s).toBe("string");
    expect(s.length).toBeGreaterThan(0);
  });
  it("accepts a Uint8Array sample (ArrayLike)", () => {
    expect(computeSignature(10, new Uint8Array([9, 8, 7]))).toBe(
      computeSignature(10, [9, 8, 7]),
    );
  });
});
