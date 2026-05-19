import { describe, expect, it } from "vitest";

import {
  CreateSessionResponseSchema,
  ErrorEnvelopeSchema,
  MAX_PARSE_PAGES,
  ParseStatusResponseSchema,
  ParseSubmitResponseSchema,
  friendlyJobMessage,
  isTerminalStatus,
  validateParseSubmit,
} from "@/features/parsing/schema";

describe("Zod response contracts (AC4)", () => {
  it("accepts a valid submit/session/status/error payload", () => {
    expect(ParseSubmitResponseSchema.parse({ jobId: "j1" })).toEqual({
      jobId: "j1",
    });
    expect(CreateSessionResponseSchema.parse({ linkId: "s1" })).toEqual({
      linkId: "s1",
    });
    expect(
      ParseStatusResponseSchema.parse({ status: "queued" }),
    ).toEqual({ status: "queued" });
    expect(
      ParseStatusResponseSchema.parse({
        status: "failed",
        message: "解析失敗",
      }),
    ).toEqual({ status: "failed", message: "解析失敗" });
    expect(
      ErrorEnvelopeSchema.parse({ error: { code: "X", message: "m" } }),
    ).toEqual({ error: { code: "X", message: "m" } });
  });

  it("rejects an invalid status / empty jobId", () => {
    expect(() =>
      ParseStatusResponseSchema.parse({ status: "weird" }),
    ).toThrow();
    expect(() => ParseSubmitResponseSchema.parse({ jobId: "" })).toThrow();
  });
});

describe("validateParseSubmit (AC4 request-shape gate)", () => {
  const img = (n: number) => Array(n).fill("image/jpeg");

  it("accepts a well-formed single-page submit", () => {
    expect(
      validateParseSubmit({ pageCount: 1, mimeTypes: img(1) }),
    ).toEqual({ ok: true });
  });

  it("accepts a well-formed multi-page submit at the cap", () => {
    expect(
      validateParseSubmit({
        pageCount: MAX_PARSE_PAGES,
        mimeTypes: img(MAX_PARSE_PAGES),
      }),
    ).toEqual({ ok: true });
  });

  it("rejects zero / non-integer pages", () => {
    expect(validateParseSubmit({ pageCount: 0, mimeTypes: [] }).ok).toBe(
      false,
    );
    expect(
      validateParseSubmit({ pageCount: 1.5, mimeTypes: img(2) }).ok,
    ).toBe(false);
  });

  it("rejects more than the hard page cap", () => {
    const r = validateParseSubmit({
      pageCount: MAX_PARSE_PAGES + 1,
      mimeTypes: img(MAX_PARSE_PAGES + 1),
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe("TOO_MANY_PAGES");
  });

  it("rejects a part-count / pageCount mismatch", () => {
    const r = validateParseSubmit({ pageCount: 3, mimeTypes: img(2) });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe("PART_COUNT_MISMATCH");
  });

  it("rejects a non-image part", () => {
    const r = validateParseSubmit({
      pageCount: 2,
      mimeTypes: ["image/jpeg", "application/pdf"],
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe("NOT_IMAGE");
  });
});

describe("friendlyJobMessage (AC2/AC3, never leak raw)", () => {
  it("maps progress states", () => {
    expect(friendlyJobMessage("queued")).toBe("排隊中…");
    expect(friendlyJobMessage("processing")).toBe("解析中…");
    expect(friendlyJobMessage("succeeded")).toBeUndefined();
    expect(friendlyJobMessage("degraded")).toContain("備援");
  });

  it("uses the stored friendly error for failed, else a default", () => {
    expect(friendlyJobMessage("failed", "卡號區無法辨識")).toBe(
      "卡號區無法辨識",
    );
    expect(friendlyJobMessage("failed", null)).toBe(
      "解析失敗，請再試一次。",
    );
    expect(friendlyJobMessage("failed", "")).toBe("解析失敗，請再試一次。");
  });
});

describe("isTerminalStatus (AC3 stop polling)", () => {
  it("is true only for terminal states", () => {
    expect(isTerminalStatus("succeeded")).toBe(true);
    expect(isTerminalStatus("failed")).toBe(true);
    expect(isTerminalStatus("degraded")).toBe(true);
    expect(isTerminalStatus("queued")).toBe(false);
    expect(isTerminalStatus("processing")).toBe(false);
  });
});
