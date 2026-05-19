import { describe, expect, it } from "vitest";

import { classifyReceiptStructure } from "@/features/parsing/structureGuard";
import type { ParsedReceipt } from "@/features/parsing/schema";

const line = (
  description: string,
  amountCents: number,
  rawText?: string,
  qty = 1,
) => ({ description, amountCents, rawText, qty });

/**
 * A clearly-labelled SYNTHETIC #5564-shaped receipt (NOT OCR data —
 * real #5564 end-to-end stays gated W-1-4-1 / W-CR-5). Tax-inclusive,
 * no standalone tax line, NT integer cents, #5564-style product codes,
 * one negative IRC line (Story 1.5 territory). Used as the `ok:true`
 * baseline the disqualifier tests mutate.
 */
const synthetic5564 = (): ParsedReceipt => ({
  lines: [
    line("每一克巧克力牛乳", 4490, "8511322 1x 44.90"),
    line("氣泡蘋果汁汽水", 9990, "8500664 1x 99.90"),
    line("IRC", -900, "IRC #8511322"),
  ],
});

describe("classifyReceiptStructure — accepts #5564 same-structure (AC1)", () => {
  it("SYNTHETIC #5564 shape → ok:true (not OCR data, labelled)", () => {
    expect(classifyReceiptStructure(synthetic5564())).toEqual({ ok: true });
  });
});

describe("disqualifier signals → reject with classified reason (AC2)", () => {
  it("independent tax line → independent_tax_line", () => {
    const r = synthetic5564();
    r.lines.push(line("營業稅", 525, "TAX 5.25"));
    expect(classifyReceiptStructure(r)).toEqual({
      ok: false,
      reason: "independent_tax_line",
    });
  });

  it("latin TAX/VAT/GST keyword → independent_tax_line", () => {
    for (const kw of ["TAX 1.00", "VAT 20%", "GST"]) {
      const r = synthetic5564();
      r.lines.push(line(kw, 100, kw));
      expect(classifyReceiptStructure(r)).toEqual({
        ok: false,
        reason: "independent_tax_line",
      });
    }
  });

  it("foreign currency marker → foreign_currency", () => {
    for (const fc of ["USD 12.00", "US$12.00", "¥1200", "€10,00", "HK$98"]) {
      const r = synthetic5564();
      r.lines.push(line("imported item", 1200, `8512345 1x ${fc}`));
      expect(classifyReceiptStructure(r)).toEqual({
        ok: false,
        reason: "foreign_currency",
      });
    }
  });

  it("no recognizable #5564 product code → no_recognizable_product_code", () => {
    const r: ParsedReceipt = {
      lines: [line("milk", 4490, "1x 44.90"), line("juice", 9990, "1x 99.90")],
    };
    expect(classifyReceiptStructure(r)).toEqual({
      ok: false,
      reason: "no_recognizable_product_code",
    });
  });

  it("all-negative, no #5564 product-shape line → no_recognizable_product_code", () => {
    // Neither line has the code+qty×price #5564 shape, so the stronger
    // positive-confirmation fails BEFORE the no-positive-amount check.
    // no_code > structural is the spec precedence and this is the more
    // precise reason (there genuinely is no recognizable #5564 line).
    const r: ParsedReceipt = {
      lines: [
        line("IRC", -900, "IRC #8511322"),
        line("IRC", -300, "8511322 IRC"),
      ],
    };
    expect(classifyReceiptStructure(r)).toEqual({
      ok: false,
      reason: "no_recognizable_product_code",
    });
  });

  it("empty receipt → reject (fail-closed), structural_inconsistency", () => {
    expect(classifyReceiptStructure({ lines: [] })).toEqual({
      ok: false,
      reason: "structural_inconsistency",
    });
  });
});

describe("priority is deterministic: tax > currency > no_code > struct (AC2)", () => {
  it("tax + currency + no code co-occur → tax wins", () => {
    const r: ParsedReceipt = {
      lines: [
        line("juice", 9990, "1x USD 99.90"), // currency + no code
        line("TAX", 525, "VAT 5.25"), // tax
      ],
    };
    expect(classifyReceiptStructure(r)).toEqual({
      ok: false,
      reason: "independent_tax_line",
    });
  });

  it("currency + no code co-occur (no tax) → currency wins", () => {
    const r: ParsedReceipt = {
      lines: [line("juice", 9990, "1x €99.90")], // currency + no #5564 code
    };
    expect(classifyReceiptStructure(r)).toEqual({
      ok: false,
      reason: "foreign_currency",
    });
  });
});

describe("multi-page concatenated receipt (AC3 / CIP fold-in)", () => {
  it("tax line appearing in a LATER page is still detected", () => {
    // 1.2b/1.5 concatenate pages into one ParsedReceipt; a disqualifier
    // anywhere in the stream must still trigger (no page-position bias).
    const r: ParsedReceipt = {
      lines: [
        line("page1 item", 4490, "8511322 1x 44.90"),
        line("page1 item", 9990, "8500664 1x 99.90"),
        line("page2 item", 1500, "8519804 1x 15.00"),
        line("營業稅", 800, "TAX 8.00"), // last page footer
      ],
    };
    expect(classifyReceiptStructure(r)).toEqual({
      ok: false,
      reason: "independent_tax_line",
    });
  });
});

describe("FR7 fail-CLOSED: realistic non-#5564 domestic receipt → reject (review P1)", () => {
  // The headline FR7 harm: a common Taiwan domestic (NOT Costco #5564)
  // receipt — tax-INCLUSIVE (no tax keyword), NT$ (no foreign symbol),
  // positive amounts, but only INCIDENTAL digits (date / order-no /
  // phone / loyalty-no, never a #5564 code+qty×price product line).
  // A "any \d{3,} run" positive signal fail-OPENs here (silent
  // mis-split); the strengthened code+qty×price shape must reject it.
  it("convenience-store style receipt (date/order digits, no #5564 line) → no_recognizable_product_code", () => {
    const r: ParsedReceipt = {
      lines: [
        line("飲料", 3500, "A0012 飲料 35"),
        line("便當", 8000, "便當 80 2026-05-20"),
        line("發票", 0, "電子發票 AB12345678 序號 0009999"),
      ],
    };
    expect(classifyReceiptStructure(r)).toEqual({
      ok: false,
      reason: "no_recognizable_product_code",
    });
  });

  it("receipt whose only 3+ digit run is a phone/transaction number → reject", () => {
    const r: ParsedReceipt = {
      lines: [
        line("品項一", 1280, "品項一 12.80"),
        line("謝謝惠顧", 0, "TEL 0223456789 交易序號 1234567"),
      ],
    };
    expect(classifyReceiptStructure(r)).toEqual({
      ok: false,
      reason: "no_recognizable_product_code",
    });
  });

  it("genuine #5564 product-shape line (code + qty×price) still accepts", () => {
    // Guard the patch didn't over-tighten: the SYNTHETIC #5564 shape
    // (NOT OCR data) must remain ok:true.
    expect(classifyReceiptStructure(synthetic5564())).toEqual({ ok: true });
  });
});

describe("integer-cents only, NT$ is NOT foreign (AC1/AC8)", () => {
  it("NT$ / TWD markers do not trip foreign_currency", () => {
    const r: ParsedReceipt = {
      lines: [
        line("item", 4490, "8511322 1x NT$44.90"),
        line("item", 9990, "8500664 1x TWD 99.90"),
      ],
    };
    expect(classifyReceiptStructure(r)).toEqual({ ok: true });
  });
});
