import { describe, expect, it } from "vitest";

import { checkParseBudget } from "@/features/parsing/server/budget";

describe("checkParseBudget (Story 1.3 seam — default pass; 1.7 enforces)", () => {
  it("passes for any session id (seam contract)", () => {
    expect(checkParseBudget("s1")).toEqual({ ok: true });
    expect(checkParseBudget("")).toEqual({ ok: true });
    expect(checkParseBudget("ip:abc")).toEqual({ ok: true });
  });
});
