import { describe, expect, it } from "vitest";

import { isValidDeviceToken } from "@/features/identity/deviceToken";

describe("isValidDeviceToken — shape guard", () => {
  it("accepts realistic 32-byte base64url tokens (43 chars)", () => {
    expect(isValidDeviceToken("a".repeat(43))).toBe(true);
    expect(isValidDeviceToken("abc_123-XYZdef_456-WV0123456789A123456789B0")).toBe(true);
  });

  it("rejects too-short / too-long / non-string / bad charset", () => {
    expect(isValidDeviceToken("short")).toBe(false);
    expect(isValidDeviceToken("a".repeat(19))).toBe(false);
    expect(isValidDeviceToken("a".repeat(65))).toBe(false);
    expect(isValidDeviceToken("a!.b!c")).toBe(false);
    expect(isValidDeviceToken(null)).toBe(false);
    expect(isValidDeviceToken(undefined)).toBe(false);
    expect(isValidDeviceToken(12345)).toBe(false);
  });
});
