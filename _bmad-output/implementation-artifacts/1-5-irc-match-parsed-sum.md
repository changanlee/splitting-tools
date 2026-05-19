# Story 1.5: IRC 折扣自動配對母品項與 parsed_sum 計算

Status: review

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## ⚠️ Dev 鐵則（最高優先）

1. **本 story 是 `receipt_lines` 的 owner**（W-1-4-3）。1.3/1.4 禁止改 schema 表；**1.5 可且必須**新增 `receipt_lines` Drizzle 表 + migration（DDL 見 Dev Notes，照寫；money 全整數分、無 float）。也正式化「1.4 的 `ParsedReceipt` → 1.5」讀取路徑。
2. **IRC 配對 + net_cents + parsed_sum 為純函式**（無 DOM/IO），抽 `src/features/parsing/irc.ts`，node 全測（多筆 IRC、孤兒 IRC、無母行、整數分、零/負邊界）。整合（讀 pg-boss output、寫 receipt_lines、接 parseWorker）依既定策略不入 node 測（型別 + W 整合驗證）。
3. **不越界**：結算/應付金額/含稅加總 FR50 ＝ **Story 5.1**；核對閘門/可疑行/IRC 改綁 UI ＝ **Epic 2**；非 #5564 結構硬拒 ＝ **Story 1.6**。本 story 只做：IRC→母行歸屬、net_cents、parsed_sum、receipt_lines 持久化。
4. **誠實**：真 #5564 端到端準確率仍 gated `W-1-4-1`（無 ANTHROPIC_API_KEY）/`W-CR-5`（多頁 n=0）。1.5 的演算法測試用**明確建構的小型測例**證明數學，**不得**捏造「真實 28 行 #5564」資料（W-CR-4 tautology / 違不謊報）。regression-invariants `it.todo` anchor 保留、不偽綠。

## Story

As a 付款人，
I want 收據上的 IRC 即時折扣自動折抵到對應母品項，並算出解析後的總額，
so that 後續分帳/結算的每行金額正確（FR6；FR50 前置資料基礎）。

## Acceptance Criteria

> 來源：`epics.md#Story 1.5` GWT 逐字 ＋ `architecture.md` L330-331/L396-398 IRC 契約 ＋ CIP 跨頁 fold-in ＋ 為防 LLM 模糊化補可驗證門檻。

1. **AC1（IRC 歸屬母行 — 純演算法）** Given 一個 `ParsedReceipt`（1.4 產出，`lines[]`：`description/rawText?/qty/amountCents` 整數分；IRC＝負額行），When 執行 IRC 配對，Then 每筆 IRC（負額行）依其 `rawText`/`description` 內引用的母品項代碼配對到對應**母行**（例：`IRC #8511322` 或 `#8519804 IRC` → 代碼 `8511322`/`8519804` 的母行）；母行 `net_cents = gross_cents + Σ(歸屬其下之 IRC amountCents，皆負)`；IRC 行**不**獨立成可認領行（`claimable=false`、不進 parsed_sum 獨立項，僅折入母行 net）。純函式，整數分運算、零 float。
2. **AC2（每行 net 與歸屬欄位）** Given 配對後，Then 每行記 `net_cents`（母行＝gross+ΣIRC；一般行＝gross；IRC 行＝其 amount，但 `claimable=false` 且 `irc_attributed_to` 指向母行 line id）與 `irc_attributed_to`（母行/一般行＝null；IRC 行＝母行 id）。
3. **AC3（孤兒 IRC / 無母行邊界 — 不卡死、不靜默吞）** Given 一筆 IRC 找不到對應母行（代碼無匹配），Then 該 IRC 標 `irc_attributed_to=null` + `orphan=true`（仍計入 parsed_sum 作為獨立負項，**不**丟棄、**不**錯帳；交由 Epic 2 核對閘門「可疑行/IRC 改綁」處理——本 story 只需正確標記與不破壞 parsed_sum 守恆）。多筆 IRC 對同一母行可累加。
4. **AC4（parsed_sum 守恆 — 整數分）** Given 全部行決定 net 後，Then `parsed_sum = Σ(母行/一般行 net_cents) + Σ(孤兒 IRC amountCents)`，等價於 `Σ 所有原始 line.amountCents`（IRC 折抵後總額守恆——折抵只是把 IRC 併入母行，總和不變）；整數分；跨頁（1.2b 多頁）順序不影響結果（配對依代碼非位置）。純函式有守恆不變量測試。
5. **AC5（receipt_lines 持久化 — 本 story owner，含 DDL）** Given IRC 配對結果，Then 新增 `receipt_lines` Drizzle 表（DDL 見 Dev Notes，`pnpm db:generate` 產 migration，G2：Drizzle migrate 早於 pg-boss start 既有序不變）；每行一列：`session_id`/`parse_job_id` 關聯、`line_no`（保序）、`description`、`raw_text`、`qty`、`gross_cents`、`net_cents`、`is_irc`、`claimable`、`irc_attributed_to`（self-FK nullable）、`orphan`。**僅本 story 改 `src/db/schema.ts`**（合法，1.5 是 owner）。
6. **AC6（1.4→1.5 hand-off 正式化 — 收掉 W-1-4-3）** Given 1.4 parseWorker 解析成功（`ParsedReceipt` 為 pg-boss job output），Then 1.5 在 parseWorker 成功路徑後（同 worker、解析成功才跑）執行 IRC 配對 → 寫 `receipt_lines` → 在 `parse_jobs` 記 `parsed_sum`（用既有可用方式，**不為此再加非必要欄**；若 parse_jobs 無合適欄，parsed_sum 由 receipt_lines 聚合即可，spec 明述選擇）。`deferred-work#W-1-4-3` → RESOLVED。失敗/降級 job 不寫 receipt_lines（維持 1.4 終態語意）。
7. **AC7（regression carry-forward — 誠實）** Given `parsed_sum==2208.50`（#5564＝220850 分）雙不變量 harness（1-1 placeholder），Then 1.5 提供**演算法層**證明：純函式測試用建構測例（含母行+多筆 IRC）斷言 net/parsed_sum 與守恆；`regression-invariants.test.ts` 之 REAL #5564 `it.todo` 保留為 anchor（真資料端到端 gated `W-1-4-1`/`W-CR-5`，**不偽綠、不捏造**）。可另加一筆「#5564 結構契約」合成 fixture（明標 synthetic、非 OCR 真資料）測 IRC 演算法對該結構得 220850。
8. **AC8（測試 + 綠燈 + 邊界不回歸）** Given `pnpm test`，Then `irc.ts` 純函式具名 node 測（單一 IRC、多筆同母、孤兒、無母行、整數分守恆、跨頁順序無關、零/全 IRC 邊界）全綠；整合層（pg-boss output 讀取、receipt_lines 寫入、parseWorker 接線）不入 node（型別 + `pnpm build` + W 整合驗證）；既有測試（schema/cost/retry/pages/geometry/regression，全綠）**零回歸**；`pnpm lint && typecheck && build` 全綠；新增 migration 不破壞 G2。
9. **AC9（邊界鐵則）** Given 改動，Then 不碰 `visionAdapter`（唯一 Claude 邊界不變、不繞過）；不改 1.1-1.4 既有表結構（僅**新增** receipt_lines）；不實作結算 FR50/核對 UI/結構硬拒；**零新增 npm 相依**（純 TS + drizzle，沿用）；不發網路、不入 route handler（IRC 在 worker 成功路徑）。

## Tasks / Subtasks

- [x] **Task 0：前置** — 確認 1-4 done（`ParsedReceipt`/parseWorker/pg-boss output 在）；讀 `1-4-vision-llm-parse.md`（ReceiptLine 形狀、pg-boss job output hand-off、W-1-4-3）、`architecture.md` L330-331/L345/L396-398、`src/db/schema.ts`（既有 4 表 + drizzle 慣例）、`src/workers/parseWorker.ts`（成功路徑接點）。AGENTS.md：本 story 無新 Next/SDK API，記 Debug Log 即可。
- [x] **Task 1：IRC 純演算法（AC1-AC4, AC7, AC8）** — `src/features/parsing/irc.ts`：`attributeIrc(parsed: ParsedReceipt): AttributedReceipt`（純）——辨識 IRC 行（amountCents<0 且 rawText/description 含母碼樣式）、抽母碼、配對母行、算 net_cents、標 is_irc/claimable/irc_attributed_to/orphan；`computeParsedSum(attributed): number`（Σ，整數分，守恆）。型別 `AttributedLine`/`AttributedReceipt`（`z.infer` 對齊或明確 interface）。`irc.test.ts` 具名 node 測：單 IRC 折抵、多筆 IRC 同母累加、孤兒 IRC(orphan,計入,不丟)、無母行、全 IRC、零 IRC（恆等）、整數分無 float、守恆不變量（Σnet+孤兒 == Σ原始 amount）、跨頁順序打亂結果相同、合成「#5564 結構契約」→ 220850。
- [x] **Task 2：receipt_lines schema + migration（AC5, AC8, AC9）** — `src/db/schema.ts` 新增 `receiptLines` pgTable（DDL 見 Dev Notes，整數分欄、self-FK irc_attributed_to nullable、line_no 保序、session/parse_job 關聯 + index）；`pnpm db:generate` 產 `drizzle/migrations/000X_*.sql`，逐欄比對 DDL 規格；確認**僅新增表**、不改既有 4 表；G2 序（migrate→pg-boss start）既有 `src/workers/index.ts` 不動即成立。
- [x] **Task 3：持久化 + parseWorker 接線（AC6, AC9）** — `src/features/parsing/server/`：`persistAttributedReceipt(jobId, sessionId, attributed)`（寫 receipt_lines 多列，整數分；冪等：同 job 重入先清再寫或 upsert，避免重複——比照終態守衛精神）；`src/workers/parseWorker.ts` 成功路徑：visionAdapter `parsed` → `attributeIrc` → `persistAttributedReceipt` → parsed_sum（receipt_lines 聚合或既有欄，spec 述選擇）→ markJobStatus succeeded/degraded（既有，不破壞 NFR-R2/終態守衛）。失敗/降級不寫 receipt_lines。`deferred-work#W-1-4-3` RESOLVED。
- [x] **Task 4：regression carry-forward（AC7）** — 不偽綠：`regression-invariants.test.ts` REAL #5564 `it.todo` 保留 anchor（更新註記指向本 story 已實作演算法、真資料仍 gated W-1-4-1/W-CR-5）；演算法證明在 `irc.test.ts`（合成 #5564 結構 fixture，明標非 OCR 真資料）。
- [x] **Task 5：驗收自查（AC8, AC9）** — `pnpm typecheck`(0)/`lint`(0)/`test`（既有零回歸 + 新 irc 具名測）/`build`(綠)；`pnpm db:generate` 後 migration diff 僅新增 receipt_lines；靜態掃描：無 visionAdapter 改動/繞過、既有 4 表未改、無新 npm 相依、IRC 不在 route handler；W-1-4-3 標 RESOLVED。

## Dev Notes

### 範圍鐵則（防越界 / 防繞過 / 防捏造）

- **1.5 ＝ IRC 折抵 + net_cents + parsed_sum + receipt_lines 持久化。** OUT：結算應付/含稅加總 FR50＝Story 5.1（架構 L40/L330：FR50 依賴 1.5 的 IRC 淨價輸出格式，故 1.5 只需「定義並產出 net 資料模型」，不算誰付多少）；核對閘門/可疑行/IRC 手動改綁 UI＝Epic 2（架構 L31）；非 #5564 結構硬拒＝Story 1.6。[Source: epics.md#Story 1.5-1.6；architecture.md L31,L40,L330-331,L396-398]
- **唯一 Claude 邊界不變**：本 story 不碰 `visionAdapter`、不呼叫 LLM（IRC 是純規則配對，非 LLM）。[Source: 1-1 visionAdapter 檔頭；docs/llm-compliance-checklist.md]
- **誠實**：真 #5564 端到端＝W-1-4-1（無 key）；多頁 n=0＝W-CR-5。1.5 算法測用建構測例（含明標 synthetic 的 #5564 結構契約），**不**把合成資料宣稱為真 OCR；`it.todo` anchor 不偽綠（W-CR-4 教訓）。

### IRC 配對契約（演算法精確規格）

- IRC 行辨識：`amountCents < 0` 且 `rawText`（優先）或 `description` 含母品項代碼引用樣式（觀察 #5564：`IRC #<code>` 或 `#<code> IRC`，code 為數字串）。抽出 `<code>`。
- 母行辨識：非負額行，其 `rawText`/`description` 含同一 `<code>`（#5564：母行如 `8511322 1x 44.90`）。配對：IRC.code == 母行 code。
- `net_cents`：母行 = `gross_cents + Σ(歸屬其 IRC.amountCents，皆負)`；一般行（無 IRC）= gross；IRC 行 net = 自身 amount 但 `claimable=false`、折入母行（不重複計入 parsed_sum）。
- `parsed_sum = Σ(claimable 行 net_cents) + Σ(orphan IRC amountCents)`。**守恆**：== `Σ 所有原始 line.amountCents`（IRC 折抵不改變總和；測試必含此不變量）。
- 邊界：多筆 IRC → 同母行累加；孤兒 IRC（無母）→ `orphan=true,irc_attributed_to=null`，仍計入 parsed_sum（不丟、不錯帳，留 Epic 2 改綁）；母行重複 code → 配對首見（保序）並記錄（Epic 2 可疑行範疇，本 story 不需 UI）；全為 IRC / 無 IRC / 空 lines → 安全（parsed_sum=Σ）。整數分，零 `Number` float（全 `number` 整數運算，無除法；無捨入需求——若未來百分比攤分屬 5.1）。
- #5564 契約：28 行含 3 IRC，IRC 折抵後 `parsed_sum == 220850`（NT$2208.50）。合成 fixture 明標「結構契約、非 OCR 真資料」。[Source: architecture.md L396-398；brainstorming 2026-05-17 #5564 ¥2208.50；receipt-5564.placeholder.ts]

### receipt_lines DDL（本 story owner，照寫；整數分；對齊既有 schema.ts 慣例）

```ts
// src/db/schema.ts 追加（既有 4 表不改；money 整數分、_cents 後綴）
export const receiptLines = pgTable("receipt_lines", {
  id: text("id").primaryKey(),                       // randomUUID (server)
  sessionId: text("session_id").notNull().references(() => sessions.id),
  parseJobId: text("parse_job_id").notNull().references(() => parseJobs.id),
  lineNo: integer("line_no").notNull(),              // 收據由上到下保序（跨頁串接後序）
  description: text("description").notNull(),
  rawText: text("raw_text"),
  qty: integer("qty").notNull(),
  grossCents: integer("gross_cents").notNull(),      // 原始行金額（整數分；IRC 為負）
  netCents: integer("net_cents").notNull(),          // 母行=gross+ΣIRC；一般=gross；IRC=自身
  isIrc: boolean("is_irc").notNull().default(false),
  claimable: boolean("claimable").notNull().default(true), // IRC=false
  ircAttributedTo: text("irc_attributed_to"),        // IRC 行→母行 id；否則 null（self-參照，
                                                     //   不加硬 FK 以免插入順序循環，邏輯層保證）
  orphan: boolean("orphan").notNull().default(false),// 孤兒 IRC（無母行）
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index("idx_receipt_lines_job").on(t.parseJobId),
  index("idx_receipt_lines_session").on(t.sessionId),
]);
```
`pnpm db:generate` 產 migration；逐欄比對；只新增表。[Source: src/db/schema.ts 既有慣例（text id/timestamptz/整數分/index）；architecture.md L345 receipt_lines 規劃表；L389 每行 net_cents+irc_attributed_to]

### Previous Story Intelligence（1.1→1.4 必讀）

- **1.4 上游契約**：`ParsedReceipt = { lines: ReceiptLine[] }`，`ReceiptLine = { description:string; rawText?:string; qty:number(int>0); amountCents:number(int，IRC 為負) }`（`src/features/parsing/schema.ts`）。1.4 parseWorker 成功時 `return outcome.receipt` ＝ pg-boss job output（W-1-4-3：1.5 在 **同 worker 成功路徑** 接，不必再讀 pg-boss output 表——直接在 parseWorker handler 內 parsed→attributeIrc→persist 最單純，避免跨程序讀 output 的複雜；spec 採此）。markJobStatus 既有終態守衛（status NOT IN terminal）— 不破壞。
- **lazy db client**（1.3）：`@/lib/db/client` `db` 為 lazy proxy；worker 有 DATABASE_URL 正常。drizzle 慣例：`pgTable`、`@/db/schema`、migration 由 `drizzle-kit generate`。
- **慣例**：純邏輯 node 測、IO/整合不入 node（→W 或型別+build）；Conventional Commits；每 story commit；claim 前跑 lint/typecheck/test/build 貼證據；deferred 非 silent；新增 npm 前供應鏈檢查（本 story 預期零新增）。整數分 money guardrail（schema.ts 檔頭、`_cents` 後綴、無 float）。[Source: 1-1..1-4 story 檔；MEMORY verification-protocol]

### Git Intelligence

近期鏈（…→`6e54c22`）：dev→閘門→code-review full（有 spec）→自主修 patch→done；deferred 全登記；schema 改動僅 owner story（1.1 建 4 表；1.5 建 receipt_lines）。本 story 沿用：dev→閘門→code-review full（1.5 非 LLM-boundary——IRC 純規則、無 Claude——故 3 hunters，LLM-Compliance 自動跳過）→commit。

### 最新技術資訊

無新增函式庫（純 TS + 既有 drizzle/zod）。`drizzle-kit generate` 既裝（1.1）。無新 Next/Anthropic API。

### Project Structure Notes

- 新增：`src/features/parsing/irc.ts`（純 IRC 演算法）/`irc.test.ts`（node）、`src/features/parsing/server/persistReceiptLines.ts`（receipt_lines 寫入膠合）。
- 更新：`src/db/schema.ts`（**+receiptLines 表**，既有 4 表不改）、`drizzle/migrations/*`（新 migration）、`src/workers/parseWorker.ts`（成功路徑接 IRC+persist）、`regression-invariants.test.ts`（it.todo 註記，anchor 保留）。
- 不動：`src/lib/llm/**`（visionAdapter 唯一邊界）、1.3 queue/route 契約、1.2/1.2b client 流程。

### References

- [Source: epics.md#Story 1.5 L376-394（GWT、FR6、FR50 前置、CIP 跨頁）]
- [Source: prd.md FR6；architecture.md L40,L330-331,L345,L389,L396-398（IRC 先折抵、net_cents、receipt_lines 規劃表、FR50 依賴 1.5 輸出格式）]
- [Source: 1-4-vision-llm-parse.md（ParsedReceipt/ReceiptLine 形狀、parseWorker 成功路徑、W-1-4-3 hand-off）；src/features/parsing/schema.ts；src/db/schema.ts；src/workers/parseWorker.ts]
- [Source: deferred-work.md#W-1-4-3（本 story 收掉）、#W-1-4-1/#W-CR-5（真資料 gated，不偽綠）、#W-CR-4（不捏造 fixture 教訓）]
- [Source: 專案根 AGENTS.md；docs/llm-compliance-checklist.md（1.5 非 LLM-boundary）]

## Dev Agent Record

### Agent Model Used

claude-opus-4-7[1m]

### Debug Log References

- `drizzle-kit generate` 在缺 DATABASE_URL 時 config 載入會丟錯；以 `DATABASE_URL='postgres://localhost:5432/gen'` 離線跑（generate 不連線），產出 `0001_gifted_night_thrasher.sql`，逐欄比對僅新增 receipt_lines。
- `notInArray` 既有 TERMINAL 由 `readonly` tuple → `const TERMINAL: string[]`（型別相容，1-5 觸及但不破壞 1-4 終態守衛）。
- `irc.test.ts` 跨頁 fixture 代碼 `55`/`#55` 不被 `\d{3,}` regex 匹配 → 改 `555`/`#555`（測例校正，非演算法改動）。

### Completion Notes List

- **Task 1（AC1-AC4/AC7/AC8）**：`src/features/parsing/irc.ts` 純函式 `attributeIrc` + `computeParsedSum`，零 IO、零 float、整數分。IRC＝`amountCents<0`；母碼 `#\s*(\d{3,})` / 行首碼 `(?:^|\s)(\d{3,})\b`；配對依代碼非位置（跨頁順序無關）。孤兒 IRC 標 `orphan=true`、`ircAttributedTo=null`、仍計入 parsed_sum（不丟、不錯帳，留 Epic 2 改綁）。`irc.test.ts` 具名 node 測涵蓋單/多 IRC、孤兒、無母、全 IRC、空、零 IRC 恆等、整數分、守恆不變量、跨頁順序無關，並含**明標 SYNTHETIC**的 #5564 結構契約（25 母 @9234 + 3 IRC = 220850，明述非 OCR 真資料）。
- **Task 2（AC5/AC9）**：`src/db/schema.ts` 新增 `receiptLines` pgTable（整數分欄、`irc_attributed_to` 純欄無硬 FK 以免 self-cycle 插入死結、2 index）；既有 4 表零改動。`drizzle/migrations/0001_gifted_night_thrasher.sql` 純 additive CREATE TABLE + 自身 FK/index，無 ALTER/DROP 既有表，G2（migrate→pg-boss start）`src/workers/index.ts` 不動即成立。
- **Task 3（AC6/AC9）**：`src/features/parsing/server/persistReceiptLines.ts` 冪等（依 parseJobId 先 delete 再 insert，pg-boss redelivery 不重複）；`ircAttributedTo`（母行 lineNo）→ 母行 row id 映射。`src/workers/parseWorker.ts` 成功路徑 `outcome.kind==="parsed"` → `attributeIrc` → `persistReceiptLines` → `markJobStatus` 全包在同一 try/catch：DB blip 不 rethrow（避免 pg-boss 重跑整段 Claude 解析）、best-effort `markJobFailed`、留終態（NFR-R2 付款人不死鎖）。失敗/降級分支不寫 receipt_lines。parsed_sum 不另存欄＝`Σ gross_cents`（spec AC6 明選聚合派生，無 schema 膨脹）。`W-1-4-3` RESOLVED。
- **Task 4（AC7）**：`regression-invariants.test.ts` REAL #5564 `it.todo` anchor 保留、不偽綠；註記更新指向本 story 已實作演算法（`irc.test.ts`），真資料端到端仍誠實 gated `W-1-4-1`（無 ANTHROPIC_API_KEY）/`W-CR-5`（多頁 n=0）。
- **Task 5（AC8/AC9）閘門證據**：`pnpm typecheck` 0 error；`pnpm lint` 0；`pnpm test` 8 files / 82 passed | 2 todo（既有零回歸 + 新 irc 具名測全綠）；`pnpm build` 綠（5 route，含既有 parse-jobs）。靜態掃描：`src/lib/llm/**` 零改動（唯一 Claude 邊界不繞過）、既有 4 表未改、零新增 npm 相依、IRC 在 worker 成功路徑非 route handler。

### Change Log

- 2026-05-20 — Story 1.5 dev-story 完成（Task 0-5）。新增純 IRC 演算法 + receipt_lines schema/migration + parseWorker 成功路徑接線；W-1-4-3 RESOLVED。閘門全綠（typecheck/lint/test 82pass2todo/build）。Status → review。

### File List

- NEW `src/features/parsing/irc.ts` — 純 IRC 配對 + parsed_sum 演算法
- NEW `src/features/parsing/irc.test.ts` — node 具名測（含明標 synthetic #5564 結構契約）
- NEW `src/features/parsing/server/persistReceiptLines.ts` — receipt_lines 冪等寫入膠合
- NEW `drizzle/migrations/0001_gifted_night_thrasher.sql` — additive CREATE TABLE receipt_lines
- NEW `drizzle/migrations/meta/0001_snapshot.json` + `meta/_journal.json` 更新（drizzle-kit generate 產出）
- MODIFIED `src/db/schema.ts` — +receiptLines pgTable（既有 4 表零改）
- MODIFIED `src/workers/parseWorker.ts` — 成功路徑接 attributeIrc + persistReceiptLines（同 try/catch，NFR-R2 保留）
- MODIFIED `src/features/parsing/__tests__/regression-invariants.test.ts` — it.todo anchor 註記更新（不偽綠）
