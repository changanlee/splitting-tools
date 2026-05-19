# Story 1.6: 非 #5564 結構收據明確拒絕（FR7 v1 硬鎖）

Status: ready-for-dev

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## ⚠️ Dev 鐵則（最高優先）

1. **1.6 ＝ 純結構分類器 + parseWorker 拒絕閘門 + 友善訊息常數。** 無新 schema/表（拒絕路徑**不寫任何列**）、無新 npm、不碰 `visionAdapter`（唯一 Claude 邊界不繞過）、不改 1.1–1.5 既有表。
2. **fail-closed（防靜默誤算，FR7 全意旨）**：偵測到任一**取消資格結構訊號**（獨立稅行／外幣／無可辨識母碼行／結構不一致）即**拒絕**；無法正向確認為 #5564 同結構時，預設**拒絕不接受**。FR7 是 v1 硬鎖，「不被靜默誤算」優先於「盡量接受」。**LLM dev 最易犯錯：預設 accept**——本 story 預設 reject。
3. **閘門位置**：parseWorker 成功路徑 `outcome.kind === "parsed"` → **先**結構驗證 → 不合格 → `markJobFailed`（結構拒絕專用友善訊息，NFR-R1 不洩原始錯誤）、**不**跑 1.5 attributeIrc/persist、**不**寫 receipt_lines；合格 → 維持既有 1.5 流程（attributeIrc → persistReceiptLines → markJobStatus）。結構拒絕是**正常控制流分支**（非 throw），不可被 catch 當未預期錯誤二次處理。
4. **誠實**：真 #5564 端到端仍 gated `W-1-4-1`（無 ANTHROPIC_API_KEY）／`W-CR-5`（多頁 n=0）。1.6 結構分類器測試用**明確標記 synthetic** 的建構 fixture 證明分類邏輯，**不得**捏造「真實 #5564 OCR」資料、**不得**偽綠（regression-invariants `it.todo` anchor 不動）。
5. **不越界**：結算/應付 FR50＝Story 5.1；核對閘門/可疑行/手動總額/強制放行＝Epic 2；IRC 配對＝Story 1.5（已 done）；解析端點預算/rate＝Story 1.7。本 story 只做：結構合格性判定 + 不合格的明確終態拒絕 + 友善訊息。

## Story

As a 付款人，
I want 系統在收據結構不被 v1 支援時明確告訴我「v1 僅支援 #5564 同結構」，
so that 我不會被靜默誤算出一筆錯誤的分帳（FR7，v1 硬鎖）。

## Acceptance Criteria

> 來源：`epics.md#Story 1.6` GWT 逐字 ＋ `prd.md` FR7（v1 硬鎖：只接受 #5564 同結構，異結構即明確拒絕）＋ `architecture.md` L28/L92/L667（FR7 #5564 硬鎖於 `parsing/server`）＋ CIP fold-in（結構檢查需處理多頁）＋ 為防 LLM 模糊化補可驗證門檻與 fail-closed 預設。

1. **AC1（純結構分類器 — fail-closed）** Given 一個 `ParsedReceipt`（1.4 產出，`lines[]`：`description/rawText?/qty/amountCents`），When 執行 `classifyReceiptStructure(parsed)`，Then 回傳 `{ ok: true } | { ok: false; reason: StructureRejectReason }`（純函式、無 IO、整數分、無 float）。判定為**fail-closed**：偵測到任一取消資格訊號 → `ok:false`＋分類 reason；**無法正向確認** #5564 同結構（如空收據、無任一可辨識母碼行）→ 亦 `ok:false`（預設拒絕，不靜默接受）。
2. **AC2（取消資格結構訊號 — 高精度負向訊號）** Given 解析逐行，When 分類，Then 至少偵測下列並各有對應 `StructureRejectReason`：
   - `independent_tax_line`：存在獨立稅額行（description/rawText 命中稅關鍵字樣式如 `TAX`/`稅`/`VAT`/`GST`/`消費税`/`營業稅` 且為獨立金額行）——#5564（台灣 Costco）為**含稅未列獨立稅行**，獨立稅行即非同結構。
   - `foreign_currency`：rawText/description 含明確外幣標記（如 `USD`/`US$`/`JPY`/`¥`/`€`/`HK$` 等非 NT$/TWD 之幣別樣式）。
   - `no_recognizable_product_code`：無任一 #5564 樣式母碼行（母碼樣式延用 Story 1.5 `PARENT_CODE_RE` 等價：行首/空白後 `\d{3,}`）——無從確認結構即拒絕。
   - `structural_inconsistency`：其他結構性矛盾（如全部行皆負、無正額品項行、行數為 0）。
   分類**優先序明確且具決定性**（同時命中多訊號時回穩定優先 reason，測試固定斷言）。
3. **AC3（多頁 — CIP fold-in）** Given 多頁長收據（1.2b/1.5 已跨頁串接為單一 `ParsedReceipt`，無頁邊界 metadata），When 分類，Then 分類器對**整份串接收據**掃描（任一頁出現獨立稅行/外幣/結構矛盾皆觸發拒絕；不因多頁而漏判）。頁級細粒度診斷需更豐富 parse 契約 → 明列為 W-defer（不擴 1.4 契約、不越界）。
4. **AC4（parseWorker 拒絕閘門 — 終態、不靜默、不寫列）** Given parseWorker `outcome.kind === "parsed"`，When `classifyReceiptStructure` 回 `ok:false`，Then 在跑 1.5 `attributeIrc`/`persistReceiptLines` **之前**即以結構拒絕專用友善訊息呼叫 `markJobFailed`（job 終態 `failed`），**不**寫 `receipt_lines`、**不**產生分帳；`ok:true` 才續既有 1.5 成功流程（attributeIrc → persistReceiptLines → markJobStatus succeeded/degraded，1.5 P3 `persisted` flag 與終態守衛不破壞）。結構拒絕為正常分支（非 throw），不可落入未預期錯誤 catch 二次標記。
5. **AC5（友善訊息 — NFR-R1）** Given 結構拒絕，Then 寫入 `parse_jobs.error` 的訊息為單一明確友善繁中文案（語意：「v1 僅支援 #5564 同結構收據，暫不支援此張」），**不**洩漏內部 `reason` 分類或任何原始/系統細節給 user；`reason` 僅供 server 端結構化 log/診斷（console 結構化、不外洩）。文案為具名匯出常數（單一真實來源，便於測試與一致性）。
6. **AC6（與 1.4 降級鏈關係）** Given visionAdapter 回 `parsed` 且 `degraded:true`（haiku/fallback），When 分類，Then 結構驗證**照常套用**（degraded 不豁免結構檢查）；結構合格且 degraded → 續 1.5 並維持 degraded 終態語意；結構不合格 → 結構拒絕優先於 degraded（仍 `failed` + 結構訊息）。1.6 不改 visionAdapter、不改 degraded 既有語意。
7. **AC7（測試 + 綠燈 + 零回歸 — 誠實）** Given `pnpm test`，Then `classifyReceiptStructure` 具名 node 測：每種 `StructureRejectReason`（獨立稅行/外幣/無母碼/結構矛盾）正例、合格 #5564 結構（**明標 synthetic、非 OCR 真資料**——延用 1.5 #5564 結構契約形狀）負例（`ok:true`）、多頁串接（稅行在後段頁仍判出）、優先序決定性、空收據→reject、整數分無 float；parseWorker 接線（拒絕路徑不寫列、友善訊息、不越 1.5）走型別 + W 整合驗證（既定策略，IO 不入 node）。既有測試（schema/cost/retry/pages/geometry/irc/regression，全綠）**零回歸**；`regression-invariants.test.ts` REAL #5564 `it.todo` anchor **不動、不偽綠**；`pnpm lint && typecheck && build` 全綠。
8. **AC8（邊界鐵則）** Given 改動，Then 不碰 `src/lib/llm/**`（visionAdapter 唯一 Claude 邊界、不繞過、不重實作解析）；不改 1.1–1.5 既有表/schema（**零 migration**——拒絕不寫列）；不實作 FR50 結算／Epic 2 核對 UI／Story 1.7 預算；**零新增 npm 相依**（純 TS + 既有 zod）；結構分類在 worker 成功路徑（非 route handler）、不發網路、純函式。

## Tasks / Subtasks

- [ ] **Task 0：前置** — 確認 1-5 done（`ParsedReceipt`/parseWorker 成功路徑/1.5 P3 persisted-flag 在）；讀 `1-5-irc-match-parsed-sum.md`（parseWorker 成功路徑接點、IRC `PARENT_CODE_RE` 母碼樣式、NFR-R2 終態守衛、Review Outcome）、`epics.md#Story 1.6`、`prd.md` FR7、`architecture.md` L28/L92/L436-444/L667、`src/features/parsing/schema.ts`（`ParsedReceipt`/`ReceiptLine` 契約、`friendlyJobMessage`/`isTerminalStatus`、`ErrorEnvelope` 友善訊息慣例）、`src/workers/parseWorker.ts`（1.5 後成功路徑現況）、`src/features/parsing/server/jobs.ts`（`markJobFailed` 終態守衛）。AGENTS.md：本 story 無新 Next/SDK API，記 Debug Log 即可。
- [ ] **Task 1：純結構分類器（AC1-AC3, AC7）** — `src/features/parsing/structureGuard.ts`（純，無 IO）：`classifyReceiptStructure(parsed: ParsedReceipt): StructureClassification`（`type StructureRejectReason = "independent_tax_line" | "foreign_currency" | "no_recognizable_product_code" | "structural_inconsistency"`；`type StructureClassification = { ok: true } | { ok: false; reason: StructureRejectReason }`）。偵測：稅關鍵字樣式（多語）+ 獨立金額行 → tax；外幣樣式 → currency；無 `\d{3,}` 母碼行（延用 1.5 母碼語意，避免兩套規則漂移——可抽共用或註記對齊）→ no_product_code；行數 0／無正額品項／全負 → structural_inconsistency。**fail-closed**：未正向確認即 reject。優先序：tax > currency > no_product_code > structural_inconsistency（決定性，測試固定斷言）。`structureGuard.test.ts` 具名 node 測涵蓋 AC7 全列舉 + 明標 synthetic #5564 合格負例。
- [ ] **Task 2：友善訊息常數（AC5）** — 於 `src/features/parsing/schema.ts`（既有友善訊息/常數所在，單一真實來源；不新增表）新增具名匯出 `STRUCTURE_REJECT_MESSAGE`（繁中文案：語意「v1 僅支援 #5564 同結構收據，暫不支援此張」）；與 `friendlyJobMessage` 慣例一致（NFR-R1：純友善、零系統細節）。
- [ ] **Task 3：parseWorker 拒絕閘門接線（AC4, AC6, AC8）** — `src/workers/parseWorker.ts` 成功路徑 `outcome.kind === "parsed"`：先 `classifyReceiptStructure(outcome.receipt)`；`ok:false` → `await markJobFailed(data.jobId, STRUCTURE_REJECT_MESSAGE)`（best-effort `.catch`，比照既有失敗分支）、結構化 log `reason`（僅 server，不外洩）、**跳過** attributeIrc/persist、`output = outcome.receipt`（診斷用，既有 W-1-4-3 行為不變）；`ok:true` → 維持 1.5 既有 try 區塊（persisted-flag、終態守衛不動）。結構拒絕為正常分支（非 throw），置於既有 try 內但走 `markJobFailed` 正常路徑，不可觸發未預期 catch 二次 markJobFailed。
- [ ] **Task 4：regression carry-forward + 誠實（AC7）** — 不偽綠：`regression-invariants.test.ts` REAL #5564 `it.todo` anchor **完全不動**；1.6 不宣稱任何真 #5564 端到端結果（仍 gated W-1-4-1/W-CR-5）；結構分類器證明在 `structureGuard.test.ts`（synthetic fixture 明標非 OCR）。
- [ ] **Task 5：驗收自查（AC7, AC8）** — `pnpm typecheck`(0)/`lint`(0)/`test`（既有零回歸 + 新 structureGuard 具名測 + parseWorker 型別綠）/`build`(綠)；靜態掃描：`src/lib/llm/**` 零改動、既有表/schema 無結構改動（無 migration）、無新 npm 相依、結構分類不在 route handler、拒絕路徑零寫列。記 Completion Notes 貼閘門證據。

## Dev Notes

### 範圍鐵則（防越界 / 防繞過 / 防靜默 / 防捏造）

- **1.6 ＝ 結構合格性判定 + 不合格的明確終態拒絕 + 友善訊息。** OUT：FR50 結算＝Story 5.1；核對閘門/可疑行/手動總額/強制放行＝Epic 2（架構 L31/L436-444：核對閘門恆有前進路徑——但那是 Epic 2；1.6 的「拒絕」是 FR7 結構硬鎖，與 Epic 2「核對逃生口」不同層，不可混做）；IRC 配對＝Story 1.5（done）；解析端點預算/rate＝Story 1.7。[Source: epics.md#Story 1.6-1.7；prd.md FR7；architecture.md L28,L31,L92,L667]
- **唯一 Claude 邊界不變**：不碰 `visionAdapter`、不呼叫 LLM、不重實作解析（結構判定是純規則分析 1.4 已產出的 `ParsedReceipt`）。[Source: architecture.md L436-444「任何新 LLM 呼叫點不得繞過此 adapter」；docs/llm-compliance-checklist.md——1.6 非 LLM-boundary]
- **fail-closed 是 FR7 的靈魂**：prd.md L127「異結構即明確拒絕」、epics AC「不產生分帳、不靜默誤算」。預設 accept＝最危險的 LLM dev 失誤＝靜默誤算一筆錯帳。寧可保守拒絕（false reject 可由 user 重拍/未來放寬），不可 false accept（靜默錯帳不可逆信任傷害）。
- **誠實**：真 #5564 端到端＝W-1-4-1（無 key）；多頁 n=0＝W-CR-5；不捏造 OCR fixture（W-CR-4 教訓）；`it.todo` anchor 不偽綠。1.6 測試只證「分類邏輯」，不證「OCR 準確率」。

### #5564 同結構契約（分類精確規格 — 純啟發式於 1.4 已產出欄位）

- `ParsedReceipt = { lines: ReceiptLine[] }`，`ReceiptLine = { description:string; rawText?:string; qty:int>0; amountCents:int }`。**無** currency/tax/printedTotal 欄位 → 結構判定為 `description`/`rawText`/`amountCents` 啟發式（這是契約現實，不可假設有額外欄位；若需更多訊號 → W-defer，不擅擴 1.4 契約）。[Source: src/features/parsing/schema.ts L149-191]
- #5564（台灣 Costco）結構特徵（正向）：含稅、**無獨立稅行**；母品項行帶 `\d{3,}` 母碼（延用 1.5 `PARENT_CODE_RE`）；NT 整數分；IRC 為負額行（1.5 已處理）。
- 取消資格（負向，高精度）：①獨立稅行（稅關鍵字 + 獨立金額行）②外幣標記 ③無任一母碼行 ④結構矛盾（0 行/無正額品項/全負）。命中任一 → reject。
- 母碼樣式**對齊 1.5**（`src/features/parsing/irc.ts` `PARENT_CODE_RE = /(?:^|\s)(\d{3,})\b/`）：避免兩套規則漂移。實作可 import 共用常數或在 dev notes/註解明記「與 1.5 對齊」並加測試守恆。優先**抽共用**（單一真實來源）若不擴散耦合。
- 多頁：`ParsedReceipt` 已跨頁串接（1.2b/1.5），無頁邊界 → 分類器掃整份；CIP fold-in「逐頁結構 + 跨頁連續性」在 v1 以「整份掃描必涵蓋任一頁訊號」滿足；頁級診斷＝W-defer。

### Previous Story Intelligence（1.1→1.5 必讀）

- **1.5 學習**：parseWorker 成功路徑現況（review P3 後）＝`outcome.kind==="parsed"` → `output=outcome.receipt` →（try）`persisted` flag：`attributeIrc` → `persistReceiptLines` → `markJobStatus`；catch：persist 未成功才 `markJobFailed`。**1.6 在此 try 內、attributeIrc 之前插入結構閘門**（reject → `markJobFailed` 正常分支 + return/skip；不破壞 persisted-flag 與終態守衛）。IRC orphan→Epic 2 安全網與 parsed_sum=Σgross 守恆是 1.5 範疇，1.6 不重做。`receipt_lines` 由 1.5 owner，1.6 **零 schema 改動**。
- **markJobFailed**（jobs.ts）：`notInArray(status, TERMINAL)` 終態守衛——已 succeeded/degraded/failed 不被覆蓋；結構拒絕走此既有函式（不新增 job 函式）。`friendlyJobMessage`/`ErrorEnvelope`：訊息恆友善（NFR-R1）。lazy db proxy（1.3）：本 story 純函式無 DB，parseWorker 既有。
- **慣例**：純邏輯 node 測、IO/整合不入 node（→W 或型別+build）；Conventional Commits；每 story commit；claim 前跑 lint/typecheck/test/build 貼證據；deferred 非 silent；新增 npm 前供應鏈檢查（本 story 預期**零**新增）；honesty（不偽綠/不捏造）。[Source: 1-1..1-5 story 檔；MEMORY verification-protocol；deferred-work.md]

### Git Intelligence

近期鏈（`114f947`→`6e54c22`→`366cd9c`→`f885e3d`→`ebb48f1`）：dev→閘門→code-review full（有 spec、3-4 hunters）→自主修 patch→done；deferred 全登記（W-CR-1..8）；schema 改動僅 owner story。本 story 沿用：dev-story→閘門→code-review **full（1.6 非 LLM-boundary——純規則、無 Claude——故 3 hunters，LLM-Compliance 自動跳過，要 Acceptance Auditor）**→commit。預期無 migration、無新 npm。

### 最新技術資訊

無新增函式庫（純 TS + 既有 zod）。無新 Next/Anthropic API。結構分類為純字串/數值啟發式，零外部相依。

### Project Structure Notes

- 新增：`src/features/parsing/structureGuard.ts`（純結構分類器）/`structureGuard.test.ts`（node 具名測）。
- 更新：`src/features/parsing/schema.ts`（**+`STRUCTURE_REJECT_MESSAGE` 具名常數**，無表/schema 結構改動）、`src/workers/parseWorker.ts`（成功路徑插結構閘門，1.5 try/persisted-flag/終態守衛不破壞）。
- 不動：`src/lib/llm/**`（visionAdapter 唯一邊界）、`src/db/schema.ts` + `drizzle/migrations/*`（**零 migration**）、1.5 `irc.ts`/`persistReceiptLines.ts`（除非抽共用母碼常數——若抽，僅新增匯出、不改演算法）、1.3 queue/route 契約、`regression-invariants.test.ts`（anchor 不動）。

### References

- [Source: epics.md#Story 1.6 L395-407（GWT、FR7、CIP 多頁 fold-in）]
- [Source: prd.md L127（v1 硬鎖：異結構即明確拒絕）、L319/L350（FR7 #5564 同結構硬鎖、可執行斷言）]
- [Source: architecture.md L28（IRC→非 #5564 結構硬拒）、L92（v1 硬約束 FR7）、L436-444（visionAdapter 唯一邊界不繞過 + 錯誤封套友善不外洩）、L537/L667（FR7 #5564 硬鎖於 parsing/server）]
- [Source: 1-5-irc-match-parsed-sum.md（parseWorker 成功路徑現況、P3 persisted-flag、PARENT_CODE_RE 母碼樣式、NFR-R2 終態守衛、honesty 鐵則）；src/features/parsing/schema.ts；src/workers/parseWorker.ts；src/features/parsing/server/jobs.ts；src/features/parsing/irc.ts]
- [Source: deferred-work.md#W-1-4-1/#W-CR-5（真資料 gated，不偽綠）、#W-CR-4（不捏造 fixture 教訓）；專案根 AGENTS.md；docs/llm-compliance-checklist.md（1.6 非 LLM-boundary）]

## Dev Agent Record

### Agent Model Used

（dev-story 時填入）

### Debug Log References

### Completion Notes List

### Change Log

### File List
