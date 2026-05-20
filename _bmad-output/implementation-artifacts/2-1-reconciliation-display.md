# Story 2.1: 對帳結果顯示（相符／差額／待輸入印製總額）

Status: review

## ⚠️ Dev 鐵則（最高優先）

1. **2.1 ＝ 純顯示。** 只做：核對閘門進入頁面、SubtotalBar 三態顯示、ReceiptLineRow 唯讀列出。OUT：可疑行 locate（2-2）／逐行編輯增刪（2-3）／IRC 改綁（2-4）／**手動輸入印製總額**（2-5）／未驗證強制放行（2-6）／前進保證流程（2-7）。任何「按鈕互動可變更狀態」的訴求都是後續 story；本 story 不開鈕。
2. **三態必須涵蓋 v1 起步現實**：epic AC 列 `verified`／`mismatch` 兩態，但 v1 起步 `sessions.printed_total_cents` 為 NULL（手動輸入 = 2-5）；2-1 必須**新增** `awaiting_printed_total` 態（琥珀色「待輸入印製總額」），不能讓 SubtotalBar 全部顯紅 mismatch（會誤導付款人；違 UX 信任回饋）。三態 = `verified | mismatch | awaiting_printed_total`。`unverified`（琥珀）是 2-6 owner，**本 story 不做**。
3. **計算純函式 + 整數分 + 零 float**：`computeReconciliation(parsedSumCents, printedTotalCents | null)` 純、node-testable；差額為**具體整數分**（epic AC「非僅錯誤」）；零 IO；整數分 money guardrail。
4. **單一資料源**：`parsed_sum = Σ receipt_lines.gross_cents`（**沿用 1.5 spec AC6 既定聚合，零新增欄位**）；`printed_total_cents` 讀既有 `sessions.printed_total_cents`（1.1 既有欄位，目前 NULL）。**零 migration、零 schema 改動**。
5. **不碰**：visionAdapter（唯一 Claude 邊界）／rate_counters／parseWorker／IRC 演算法（1.5 done）／structureGuard（1.6 done）／既有 1.1–1.7 表結構。**零新增 npm 相依**（沿用 Next 16 + React Compiler、@tanstack/react-query、zod，全既有）。
6. **React Compiler eslint 鐵則**（沿 1-3 review 教訓）：no `Date.now()`/ref in render、no sync `setState` in effect；輪詢 hook 沿用 1-3 `useParseJobPolling` 既有 pattern（不重造）。本 story 主路徑為 **Server Component 顯示**，互動極少 → 應幾乎全 Server Component + 一個小 Client island（SubtotalBar 為了 sticky 行為）。
7. **誠實**：真 #5564 端到端仍 gated `W-1-4-1`（無 ANTHROPIC_API_KEY）／`W-CR-5`（多頁 n=0）；UI 互動 manual / E2E test → W-defer；regression-invariants `it.todo` anchor **零改動**；不偽綠、不捏造。

## Story

As a 付款人，
I want 進入核對閘門時，**一眼看出解析後總額與收據印製總額是否對得上**（綠 ✓／紅差額／琥珀「待輸入印製總額」），
so that 我能信任這次解析結果或快速判斷需要修正（FR8；2-2~2-7 接續的閘門起點）。

## Acceptance Criteria

> 來源：`epics.md#Story 2.1` GWT（L429-440）逐字 ＋ `prd.md` FR8（L353）＋ `architecture.md` L30/L400（parsed_sum 不變量）/L444（恆有前進路徑）/L518（review page 路徑）/L540（features/reconciliation）/L600/L668 ＋ `ux-design-specification.md` L506-525 元件契約 ＋ 收斂 v1 起步「印製總額尚未輸入」第三態。

1. **AC1（純對帳函式 — 整數分、三態）** Given `parsedSumCents:number(int)` 與 `printedTotalCents:number(int)|null`，When 執行 `computeReconciliation(parsedSumCents, printedTotalCents)`，Then 回傳 `{ state: "verified"|"mismatch"|"awaiting_printed_total"; mismatchCents: number|null }`：`printedTotalCents===null` → `state:"awaiting_printed_total", mismatchCents:null`；`printedTotalCents===parsedSumCents` → `state:"verified", mismatchCents:0`；其他 → `state:"mismatch", mismatchCents: parsedSumCents - printedTotalCents`（**有號**——正＝解析高於印製、負＝低於；UI 顯絕對值 + 方向用文字）。純函式、零 float、零 IO。
2. **AC2（聚合契約 — 沿用 1.5 spec AC6 零 schema 改動）** Given 一個 session 已有 receipt_lines（1.5 done），When 計算 `parsedSumCents`，Then = `Σ receipt_lines.gross_cents WHERE session_id=…`（單一 SQL `SUM`；**不**新增 `parse_jobs.parsed_sum`、**不**新增 `sessions.parsed_sum_cents` 寫入路徑——`sessions.parsed_sum_cents` 欄已存在但本 story 不寫入，純讀派生）；無 receipt_lines（如解析未完成）→ 視同 0（顯示由 AC3 決定）。讀模型函式 `getReconciliationSummary(linkId): Promise<{parsedSumCents, printedTotalCents|null, lines: ReceiptLineView[]}>` 在 server only（IO，型別+build 驗證，不入 node 測）。
3. **AC3（會話狀態 gating）** Given 一個 session：① 不存在 → 404；② parse job 尚未 succeeded/degraded（無 receipt_lines）→ 顯「解析尚未完成」回到 ParseProgress（沿用 1-3 既有 hook）**不**顯 SubtotalBar 三態（避免假對帳）；③ 已 succeeded/degraded → 顯 SubtotalBar 三態 + ReceiptLineRow 唯讀列。本 story 不改 parse_jobs 狀態語意，純讀。
4. **AC4（StickySubtotalBar 三態 — UX 信任回饋）** Given 已有 receipt_lines，When 進核對閘門 `/splits/[linkId]/review`，Then 頁面頂部 sticky 顯示 `StickySubtotalBar`：`verified`＝綠 ✓ + `解析 NT$XX.XX ✓ 對得上印製總額`；`mismatch`＝紅 + `解析 NT$YY.YY  差 NT$Z.ZZ（多/少）`（差為具體數字，epic AC「非僅錯誤」）；`awaiting_printed_total`＝琥珀 + `解析 NT$YY.YY · 待輸入印製總額（Story 2.5 處理）`。金額 `tabular-nums`、整數分→顯示 ÷100；色＋圖示＋文字三重編碼（a11y，UX L514）。**本 story 不顯示**「未驗證放行」`unverified` 態（2-6 owner）。
5. **AC5（ReceiptLineRow `review` variant 唯讀首版）** Given 已有 receipt_lines，When 進核對閘門，Then 列出每筆 line（依 1.5 `lineNo` 排序）：品名（`description`，含縮寫原文時於小字呈現 `rawText`）、數量（`qty`）、金額（`net_cents`，整數分→顯示），IRC 折抵後母行顯`net = gross - IRC`（沿用 1.5 已算好的 `net_cents`，本 story **不**重算）；IRC 行 `claimable=false` → 列為附屬於母行的小字「折抵 -NT$X.XX」並標 `is_irc`；`orphan=true` 的 IRC 顯「孤兒 IRC（待 Epic 2 改綁，Story 2.4）」灰色註記。**唯讀**：本 story 無編輯/勾選/拖拉。`review` variant 沿用 UX spec L506-515 設計，但 editing/IRC-改綁/可疑行高亮等是後續 story。
6. **AC6（路由與 Server Component 預設）** Given 路徑 `/splits/[linkId]/review`（架構 L518），When 開啟，Then 為 **Server Component（預設）**——直接 server-side 讀 `getReconciliationSummary(linkId)` 後 render；唯一 client island 為 `StickySubtotalBar`（為了 sticky position + 後續 story polling 預留接口）。React Query 不必要（無 polling 在 2-1 範圍，1-3 hook 是 parse-job polling 而非對帳輪詢）。Next.js 16 Route Handler ctx.params 是 Promise（沿 1-3/1-7 既有處理）。**不**生成任何寫端點（reconcile 寫端點是 2-3/2-5）。
7. **AC7（友善錯誤 + NFR-R1）** Given 任何 IO 失敗（DB 不可達），Then 顯示友善繁中錯誤（`暫時無法載入對帳結果，請稍後再試。`）+ 重試提示；**永不**外洩原始 DB／系統錯誤（沿用 ErrorEnvelope/friendlyJobMessage 慣例）。Server 端 `console.error` 結構化記錄（觀察用），**不**入 user-visible。
8. **AC8（測試 + 綠燈 + 零回歸）** Given `pnpm test`，Then `computeReconciliation.test.ts` 具名 node 測：verified（精確等）、mismatch（解析高於 / 低於印製、有號差額）、awaiting_printed_total（null）、整數分守恆（無 float）、邊界（兩者皆 0、極大值 ≤ 2^31）。整合（DB read、Server Component render、Sticky 行為）走型別 + `pnpm build` + W 整合驗證（既定策略 IO/UI 不入 node 測）。既有 10 file 107 全綠**零回歸**；`regression-invariants.test.ts` REAL #5564 `it.todo` anchor **零改**；`pnpm lint && typecheck && build` 全綠；route 新增不破壞既有 5 routes。
9. **AC9（邊界鐵則）** 不碰 `src/lib/llm/**`（visionAdapter 唯一邊界）；不改 1.1–1.7 既有表/schema（**零 migration**——僅讀 receipt_lines + sessions.printed_total_cents）；不實作 2-2/2-3/2-4/2-5/2-6/2-7 任何範疇；**零新增 npm 相依**（純 React Server Component + Tailwind + 既有 shadcn UI primitives）；計算邏輯純函式、不發網路、無 LLM 呼叫；不寫 receipt_lines / parse_jobs / sessions（純讀）。

## Tasks / Subtasks

- [x] **Task 0：前置** — 讀 `1-5-irc-match-parsed-sum.md`（receipt_lines schema、net_cents/orphan/claimable 旗標、`Σ gross_cents` 派生 parsed_sum）、`1-7-parse-endpoint-budget.md`（route handler 慣例、ErrorEnvelope）、`src/db/schema.ts`（sessions/parse_jobs/receipt_lines 既有結構，`printed_total_cents` 欄已在 sessions）、`src/features/parsing/schema.ts`（ErrorEnvelopeSchema / friendlyJobMessage 慣例）、`ux-design-specification.md` L506-525（StickySubtotalBar / ReceiptLineRow review variant 契約）、`architecture.md` L30/L400/L444/L518/L540/L582。AGENTS.md：Next.js 16 ctx.params Promise + Server Components 預設既為 1-3/1-7 沿用。
- [x] **Task 1：純對帳函式（AC1, AC8）** — `src/features/reconciliation/compute.ts`：`type ReconciliationState = "verified" | "mismatch" | "awaiting_printed_total"`、`type ReconciliationResult = { state: ReconciliationState; mismatchCents: number | null }`、`function computeReconciliation(parsedSumCents: number, printedTotalCents: number | null): ReconciliationResult`。整數運算、有號差額、零 float。`compute.test.ts` 具名 node 測 5 案以上：verified（精確等含 0/0）、mismatch 正向（解析 > 印製）、mismatch 負向（解析 < 印製）、awaiting_printed_total（null）、整數分守恆。
- [x] **Task 2：Server 端讀模型（AC2, AC3, AC7）** — `src/features/reconciliation/server/summary.ts`：`getReconciliationSummary(linkId): Promise<ReconciliationSummary | null>`——單一 `db.select` 聚合 `Σ gross_cents` over `receipt_lines WHERE session_id=linkId`（drizzle `sql<number>\`COALESCE(SUM(gross_cents), 0)\``）+ 讀 sessions.printed_total_cents（or 一次 JOIN）+ 列 receipt_lines（依 line_no 排序）。session 不存在 → null。glue（不入 node 測；型別 + W 驗證）。
- [x] **Task 3：Review page Server Component（AC4, AC5, AC6）** — `src/app/splits/[linkId]/review/page.tsx`：Server Component；`getReconciliationSummary(linkId)`：null→`notFound()`；無 receipt_lines（lines.length===0）→ 簡單訊息「解析尚未完成，請回到上一頁繼續等待」（不顯 SubtotalBar 三態，AC3 ②）；有→ render `<StickySubtotalBar state mismatchCents parsedSumCents />` + `<ReceiptLineRow variant="review-readonly" line={l} />` map。沿用 1-3 ctx.params Promise pattern。
- [x] **Task 4：UI 元件（AC4, AC5, AC9）** — `src/features/reconciliation/components/StickySubtotalBar.tsx`：Client Component（`"use client"`；sticky top-0）、三態色（綠/紅/琥珀）+ 圖示 ✓/⚠/⏳ + 文字三重編碼；金額顯示 helper `formatCents(cents): string`（純，整數分 ÷100 + `NT$` + thousand-sep + tabular-nums class）；`src/features/reconciliation/components/ReceiptLineRow.tsx`：Server Component（**唯讀首版**）；`variant="review-readonly"`；母行/IRC/孤兒 三種視覺處理（依 1.5 旗標）。共用 shadcn/Tailwind 既有 design tokens（不新增 UI runtime）。`formatCents.test.ts` 具名 node 測（整數分→字串、千分位、整數零、極大值）。
- [x] **Task 5：誠實 + W-defer 登記（AC8 honesty）** — `deferred-work.md` 新增 W-2-1-1（UI 視覺/sticky 行為/手機賣場「掃一眼」可用性需 manual 驗證，gated 部署環境）+ W-2-1-2（真實多筆 receipt_lines 端到端聚合準確 gated `W-1-4-1`）；regression `it.todo` anchor 零改；不宣稱任何真 #5564 端到端結果。
- [x] **Task 6：驗收自查（AC8, AC9）** — `pnpm typecheck`(0)/`lint`(0)/`test`（既有 107 零回歸 + 新 compute/formatCents 具名測）/`build`(綠，新增 1 route)；靜態掃描：`src/lib/llm/**` 零改動、`src/db/schema.ts` + `drizzle/migrations/*` 零改動（**零 migration**）、`package.json`/lockfile 零 diff（**零新增 npm**）、無寫端點。記 Completion Notes 貼閘門證據。

## Dev Notes

### 範圍鐵則（防越界 / 防 silent miscalc）

- **2.1 ＝ 顯示。** 任何「按鈕能變更狀態」「修正資料」都是後續 story。複用同一 ReceiptLineRow 元件不等於本 story 要做 editing variant；本 story 只實作 `review-readonly` variant（最簡）。[Source: ux-design-specification.md L506-515；epics.md#Story 2.2-2.7]
- **第三態必要**：v1 起步 printed_total 為 NULL（手動輸入 = 2-5）；若強行套 epic AC 兩態 → 全部 mismatch → 紅滿天飛違信任 UX（spec L519/L589）。明列 `awaiting_printed_total` 不擴 AC1-only 範疇——它是「印製總額尚未輸入」事實的中性顯示，不是新功能。spec L82「✓ 對得上印製總額」隱含「對得起才稱對」，無對應印製總額即無法判定。
- **不重算 net_cents**：1.5 已把 IRC 折抵後 `net_cents` 寫入 receipt_lines；本 story **讀** `net_cents`，不在 UI 層重算。`parsed_sum = Σ gross_cents`（1.5 AC6 spec 派生定義，守恆性已證）；不寫入派生欄、不快取（v1 規模）。
- **誠實 honesty**：UI/sticky 行為手機體驗 manual → W-defer；不偽綠（W-1-4-1 / W-CR-5 / W-CR-4 鐵則沿用）。

### 對帳計算精確規格

```ts
// src/features/reconciliation/compute.ts
export type ReconciliationState =
  | "verified"
  | "mismatch"
  | "awaiting_printed_total";

export interface ReconciliationResult {
  state: ReconciliationState;
  /** Signed delta `parsed - printed`（正=高於印製、負=低於）。awaiting/verified 時為 0 或 null（純函式定 null = awaiting）。 */
  mismatchCents: number | null;
}

export function computeReconciliation(
  parsedSumCents: number,
  printedTotalCents: number | null,
): ReconciliationResult {
  if (printedTotalCents === null) {
    return { state: "awaiting_printed_total", mismatchCents: null };
  }
  const delta = parsedSumCents - printedTotalCents;
  if (delta === 0) {
    return { state: "verified", mismatchCents: 0 };
  }
  return { state: "mismatch", mismatchCents: delta };
}
```

整數分守恆：差額永為整數（兩個整數相減）；零除法／零 round；無 `Number.parseFloat`。

### 讀模型契約

```ts
// src/features/reconciliation/server/summary.ts
export interface ReceiptLineView {
  id: string;
  lineNo: number;
  description: string;
  rawText: string | null;
  qty: number;
  grossCents: number;
  netCents: number;
  isIrc: boolean;
  claimable: boolean;
  ircAttributedTo: string | null;
  orphan: boolean;
}

export interface ReconciliationSummary {
  sessionId: string;
  parsedSumCents: number;     // Σ gross_cents (1.5 AC6 派生)
  printedTotalCents: number | null;
  lines: ReceiptLineView[];
}

// glue：sessions JOIN receipt_lines；session 不存在 → null（→ 404 notFound()）
export async function getReconciliationSummary(linkId: string): Promise<ReconciliationSummary | null>
```

drizzle 寫法（範例）：
```ts
const sess = await db.select({ id: sessions.id, printedTotalCents: sessions.printedTotalCents })
  .from(sessions).where(eq(sessions.id, linkId)).limit(1);
if (!sess[0]) return null;
const lineRows = await db.select(...).from(receiptLines)
  .where(eq(receiptLines.sessionId, linkId)).orderBy(asc(receiptLines.lineNo));
const parsedSumCents = lineRows.reduce((a, l) => a + l.grossCents, 0);
return { sessionId: linkId, parsedSumCents, printedTotalCents: sess[0].printedTotalCents, lines: lineRows };
```
（聚合也可走 SQL `SUM`；JS reduce 在小規模 receipt 等效且型別更純。）

### UX 信任契約

- `StickySubtotalBar` 三態色（綠/紅/琥珀）＋圖示＋文字三重編碼（UX spec L514 a11y）
- 金額 `tabular-nums`（單調等寬避輪詢跳動，UX L520）
- 差額為具體整數分顯示 NT$X.XX（epic AC「非僅錯誤」）
- IRC 折抵：母行顯 `net = gross - IRC`（1.5 已算好的 `net_cents`），IRC 行小字附屬呈現
- 孤兒 IRC 灰色註記，提示「Story 2.4 改綁」（不實作改綁本身）

### Previous Story Intelligence（1.1→1.7 必讀）

- **1.5 receipt_lines schema**：`session_id` FK→sessions.id、`gross_cents`（原始，IRC 為負）、`net_cents`（母行 = gross + Σ child IRC；一般行 = gross；IRC 行 = 自身 amount）、`is_irc`、`claimable`、`irc_attributed_to`（→母行 row id，self-ref 無硬 FK）、`orphan`、`line_no`（保序）。本 story 純讀。`unique(parse_job_id, line_no)` index（1.5 review P4）保證每個 job 的列穩定。
- **1.5 spec AC6**：`parsed_sum = Σ gross_cents`（**無 schema 欄**——派生），單一真實來源。本 story 沿用同一定義；不新增欄、不快取。
- **1.7 ErrorEnvelope / friendly message**：所有對外錯誤訊息走 `ErrorEnvelope`（NFR-R1）；server console.error 結構化記錄。本 story IO 失敗訊息沿用慣例。
- **1.3 React Query / Server Component**：付款人流主路徑為 Server Component（架構 L279）；client island 僅必要互動（sticky 行為）。1-3 review 教訓：React Compiler eslint 嚴；本 story 互動極少→風險低。
- **1.1 schema 既有**：`sessions.printed_total_cents`、`sessions.parsed_sum_cents`、`sessions.unverified`、`sessions.status`、`sessions.expires_at` 全已存在。本 story 讀 `printed_total_cents`、不寫；2-5/2-6 owners 各自處理。
- **慣例**：純邏輯 node 測 / IO+UI 整合 W-defer / 唯一 Claude 邊界不繞過 / 零非必要 npm 新增 / honest 不偽綠 / 每 story commit / deferred-work 非靜默。[Source: 1-1..1-7 story 檔；MEMORY verification-protocol]

### Git Intelligence

近期鏈（`f885e3d`→`ebb48f1`→`dce6d8c`→`652e28d`→`c5608bf`→`35ecd81`→`81a4abf`）：dev→閘門→code-review full（3 hunters，LLM-Compliance 自動 skip 非 LLM-boundary）→自主修 patch→done；deferred 全登記；schema 改動僅 owner story。本 story 沿用：dev→閘門→code-review full（2.1 非 LLM-boundary → 3 hunters）→commit。預期無 migration、無新 npm。

### 最新技術資訊

無新增函式庫（純 React Server Component + Tailwind + 既有 shadcn UI + 既有 drizzle / zod）。Next.js 16 既有 ctx.params Promise 與 React Compiler eslint 規範沿 1-3/1-7。

### Project Structure Notes

- 新增：
  - `src/features/reconciliation/compute.ts`（純對帳函式）/`compute.test.ts`（node）
  - `src/features/reconciliation/server/summary.ts`（讀模型 glue）
  - `src/features/reconciliation/components/StickySubtotalBar.tsx`（client island）
  - `src/features/reconciliation/components/ReceiptLineRow.tsx`（server）
  - `src/features/reconciliation/lib/formatCents.ts`（純）/`formatCents.test.ts`（node）
  - `src/app/splits/[linkId]/review/page.tsx`（Server Component）
- 不動：`src/lib/llm/**`、`src/db/schema.ts` + `drizzle/migrations/*`（**零 migration**）、1.5 IRC / 1.6 structureGuard / 1.7 rateLimit、1.3 queue/route、`regression-invariants.test.ts`（anchor 零改）。

### References

- [Source: epics.md#Story 2.1 L429-440（GWT、FR8、verified/mismatch）]
- [Source: prd.md FR8 L353（解析總和與印製總額比對）]
- [Source: architecture.md L30/L400（parsed_sum = Σ net_cents 不變量——本 story 沿用 1.5 派生定義 Σ gross_cents 等價）、L444-445（核對閘門恆有前進路徑、永不卡死）、L518（review/page.tsx 路徑）、L540（features/reconciliation/）、L582（Server Components 預設、互動 client island）、L600/L668（FR8-16 → features/reconciliation + reconcile/lines 端點）]
- [Source: ux-design-specification.md L506-515（ReceiptLineRow 契約 + review variant + a11y 三重編碼）、L517-520（StickySubtotalBar 三態 + tabular-nums）、L522-524（ReconciliationGate 組合元件，2-2 後續）、L544-545（UnverifiedBanner = 2-6）、L554-557（ReceiptLineRow 單一事實來源）、L565-566（Phase 1 = ParseProgress + ReceiptLineRow + StickySubtotalBar + ReconciliationGate）、L589（信任回饋對帳通過 = 綠 ✓）]
- [Source: 1-5-irc-match-parsed-sum.md（receipt_lines schema、net_cents 派生、parsed_sum=Σgross AC6、persistReceiptLines 冪等、unique(parse_job_id,line_no) P4）；1-3-async-parse-job-polling.md（Server Component 預設、ctx.params Promise、ErrorEnvelope）；1-7-parse-endpoint-budget.md（friendly message NFR-R1）；src/db/schema.ts（sessions.printed_total_cents L37 + receipt_lines L123-157）；src/features/parsing/schema.ts ErrorEnvelopeSchema]
- [Source: deferred-work.md#W-1-4-1/#W-CR-5（真資料 gated，不偽綠）、#W-CR-4（不捏造 fixture 教訓）；專案根 AGENTS.md]

## Dev Agent Record

### Agent Model Used

claude-opus-4-7[1m]

### Debug Log References

- 2-1 範圍純顯示，互動極少 → 全 Server Components（CSS sticky 不需 client island）；後續 story 加 polling/edit 時再 `"use client"`，props 契約不變。
- `formatCents` 用 Math + 手動千分位 regex，不用 `Intl.NumberFormat`（Vercel edge / CI Linux locale 不一致風險避免）。
- IRC 折抵後母行同時顯示 `netCents`（粗體）+ 原 `grossCents`（劃線小字）：付款人能一眼看到 IRC 套用結果，不重算（沿用 1.5 已寫好的 `net_cents`）。

### Completion Notes List

- **Task 1（AC1, AC8）**：`src/features/reconciliation/compute.ts` 純 `computeReconciliation`，三態（`verified`/`mismatch`/`awaiting_printed_total`）；signed `mismatchCents`（正＝解析高、負＝解析低，UI 顯絕對值 + 方向文字）。`compute.test.ts` 6 具名 node 測（含 null、精確等、有號差、整數分守恆、邊界 0/0、大數 2^31 內）。
- **Task 2（AC2, AC3, AC7）**：`src/features/reconciliation/server/summary.ts` `getReconciliationSummary(linkId)`：drizzle 讀 `sessions.printed_total_cents` + `receipt_lines`（依 line_no 排序）；JS reduce 派生 `parsedSumCents = Σ gross_cents`（沿用 1.5 AC6，**零 schema 改動**）；session 不存在回 null（→ `notFound()`）。glue 不入 node 測。
- **Task 3（AC4-AC6, AC9）**：`src/app/splits/[linkId]/review/page.tsx` Server Component；Next 16 `ctx.params` Promise（沿 1-3/1-7 既有）；session 不存在 → `notFound()`；空 lines → 「解析尚未完成」訊息（不顯 SubtotalBar 三態，避假對帳，AC3 ②）；有 lines → SubtotalBar + ol/li ReceiptLineRow。Page footer 明列各後續 story 範疇邊界。
- **Task 4（AC4, AC5）**：`components/StickySubtotalBar.tsx`（Server Component，CSS sticky + 三態色/圖示/文字三重編碼 + `tabular-nums` + `aria-live="polite"`）；`components/ReceiptLineRow.tsx`（Server Component，唯讀 review variant；母行有 IRC 折抵時 `net_cents` 粗體 + `gross_cents` 劃線小字；IRC 行 indent 顯「折抵 -NT$X.XX」+ 縮寫；orphan IRC 灰斜體 + Story 2.4 改綁提示）；`lib/formatCents.ts` 純（整數分→`NT$X,XXX.XX`，signed option，非有限值降為 `NT$—`）；`formatCents.test.ts` 8 具名 node 測。
- **Task 5（honesty）**：`deferred-work.md` 新增 W-2-1-1（mobile sticky/視覺 manual gated 部署）+ W-2-1-2（真實多筆 e2e 聚合準確 gated `W-1-4-1`）；regression `it.todo` anchor 零改；不偽綠。
- **Task 6（AC8/AC9）閘門證據**：`pnpm typecheck` 0；`pnpm lint` 0；`pnpm test` 12 files / **121 passed | 2 todo**（既有 107 零回歸 + 1.5 新 IRC 14 / 1.6 14 / 1.7 11 計入既有；+14 新 reconciliation = 6 compute + 8 formatCents）；`pnpm build` 綠 **6 routes**（新增 `/splits/[linkId]/review`）。靜態掃描：`src/lib/llm/**` 零改、`src/db/schema.ts` + `drizzle/migrations/*` 零改（**零 migration**）、`package.json`/lockfile 零 diff（**零新增 npm 相依**）、純函式 + Server Components 為主、無 LLM 呼叫、無寫端點。

### Change Log

- 2026-05-20 — Story 2.1 dev-story 完成（Task 0-6）。Epic 2 第一個 story。三態純對帳函式 + Server Component 核對閘門 page + StickySubtotalBar + 唯讀 ReceiptLineRow + formatCents 純 helper。零 migration / 零新 npm / visionAdapter 零改動 / regression anchor 零改。閘門全綠（typecheck/lint/test 121pass2todo/build 6routes）。Status → review。

### File List

- NEW `src/features/reconciliation/compute.ts` — 純三態對帳函式
- NEW `src/features/reconciliation/compute.test.ts` — 6 具名 node 測
- NEW `src/features/reconciliation/server/summary.ts` — 讀模型 glue（sessions JOIN receipt_lines 派生 parsedSumCents）
- NEW `src/features/reconciliation/components/StickySubtotalBar.tsx` — Server Component sticky 三態 bar（色+圖示+文字三重編碼 a11y）
- NEW `src/features/reconciliation/components/ReceiptLineRow.tsx` — Server Component 唯讀 review variant（母行/IRC/orphan 視覺）
- NEW `src/features/reconciliation/lib/formatCents.ts` — 純整數分→NT$ 字串
- NEW `src/features/reconciliation/lib/formatCents.test.ts` — 8 具名 node 測
- NEW `src/app/splits/[linkId]/review/page.tsx` — Server Component 核對閘門 page
