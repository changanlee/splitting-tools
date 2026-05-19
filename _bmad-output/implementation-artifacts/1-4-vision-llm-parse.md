# Story 1.4: 單次視覺 LLM 解析與縮寫品名還原（LLM-Ops 包裹）

Status: review

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## ⚠️ Dev 鐵則（最高優先）

1. **唯一 Claude 邊界**：所有 Claude 視覺呼叫**只**經 `src/lib/llm/visionAdapter`，**禁**任何其他檔案直呼 Anthropic SDK（架構 L459/L554；1.1 stub 檔頭明令）。本 story 才實作 `visionAdapter` 本體 + `parseWorker` 消費者。
2. **dev-story 寫實際 Claude 呼叫時，MUST 先用 `claude-api` skill**（最新 Anthropic SDK、prompt caching、模型 ID、tool/結構化輸出最佳實務）。模型：primary `claude-sonnet-4-6`、fallback `claude-haiku-4-5-20251001`（架構 L207）。
3. **無 `ANTHROPIC_API_KEY` 時**：純邏輯（成本計算、退避策略、降級選擇、Zod 解析 mocked 回應、prompt 組裝、cost 持久化 SQL）走 node 單測；**真 Claude 呼叫的 runtime 驗證登記 deferred `W-1-4-1`（P1）**（比照 W-1-3-1，不可謊報已驗）。
4. **不越界**：IRC→母品項歸屬 + net_cents + 最終 parsed_sum 計算＝**Story 1.5**；非 #5564 結構硬拒＝**Story 1.6**；per-session/IP 預算 enforcement＝**Story 1.7**（本 story 沿用 1.3 的 `checkParseBudget` seam，不實作）；本 story = 影像→逐行品項（品名/數量/金額）+ 縮寫還原 + LLM-Ops 包裹（retry/log/cost/degrade）。

## Story

As a 付款人，
I want 系統把天書般的縮寫收據（一或多頁）解析成可辨識的逐行品項（品名、數量、金額），
so that 我不必逐行手打帳（FR4、FR5；NFR-L1–L5、NFR-R1）。

## Acceptance Criteria

> 來源：`epics.md#Story 1.4` GWT 逐字 ＋ `docs/llm-compliance-checklist.md`（1.4＝items 1/2/4/5 ✅on-spec）＋ CIP 多圖決策 ＋ 為防 LLM 模糊化補可驗證門檻。

1. **AC1（parseWorker 消費者 + 單一邊界）** Given Story 1.3 已將 job 入 pg-boss `parse` queue（payload `{sessionId,jobId,pageCount,images[]base64,mimeTypes}`），When worker 程序啟動，Then 透過 `boss.work("parse", …)` 註冊**消費者**，呼叫**唯一** `src/lib/llm/visionAdapter.parseReceiptImages(...)`；**無任何**其他 Claude/Anthropic 呼叫點（靜態掃描可證）。consumer 掛在既有 `src/workers/index.ts`（G2 init order 不變：waitDB→migrate→pg-boss start→**register parseWorker**）。
2. **AC2（CIP 多圖：單次 Claude 呼叫帶 N 影像）** Given 一個 job 有 N（1..`MAX_PARSE_PAGES`=5）張已遮影像，When 解析，Then `visionAdapter` 對 Claude 視覺做**單次** messages 呼叫、一則 user message 內含 N 個 image block（依序，頁序＝收據上→下）+ 指令 prompt（primary `claude-sonnet-4-6`）。〔CIP 鎖定：採單次多圖（非逐頁+合併）；roadmap 推薦，PO 可異議〕prompt 用 **prompt caching**（system/指令塊 cache_control，依 `claude-api` skill）。
3. **AC3（Zod 驗證的逐行契約）** Given Claude 回應，Then 經 **Zod `ReceiptLineSchema`**（置 `src/features/parsing/schema.ts`，命名以 `Schema` 結尾、`z.infer` 同名型別）驗證為逐行品項陣列：每行 `{ description:string(還原後可辨識名), rawText?:string, qty:number, amountCents:integer }`（金額整數分、非 float — 全域 money guardrail）；驗證失敗＝結構錯，進降級鏈（不得把未驗證資料寫庫）。**縮寫品名還原**為可辨識名稱（prompt 指示；rawText 保留原縮寫供 1.5/核對追溯）。
4. **AC4（NFR-L1 重試 ≥3 退避+jitter）** Given Claude 5xx/429/網路失敗，Then 指數退避+jitter 重試 **≥3**（pg-boss 內建 jittered backoff 為 job 級；visionAdapter 內亦對單次呼叫做應用層重試）。transient 不可外洩單次失敗。
5. **AC5（NFR-R1 降級鏈）** Given 重試耗盡或結構持續無效，Then 依序降級：`claude-sonnet-4-6` → `claude-haiku-4-5-20251001` → 上次良好/快取 → 靜態 fallback → 友善訊息；**原始 LLM/stack 錯誤永不外洩**（寫 `parse_jobs.error` 僅友善文案；degraded 終態經 1.3 ParseProgress 呈現）。核對閘門恆有前進路徑（FR13/16，本 story 只需確保 job 達終態 succeeded/degraded/failed，永不卡 queued）。
6. **AC6（NFR-L2/L5 結構化 log + NFR-L3 cost 持久化）** Given **每次** Claude 呼叫（含每次重試/降級嘗試），Then 寫一筆結構化紀錄入 `llm_costs`（既有表，1.1）：`model, prompt_tokens, completion_tokens, latency_ms, cost_usd(numeric 10,6), session_id, request_id, success`；`request_id` 每次呼叫唯一；成本以 token×單價純函式計算（node 可測）；**cost 持久化、可 per-session-day 聚合**（不可只記憶體）。
7. **AC7（NFR-L4 worker 程序執行）** Given >1s 的 LLM 解析，Then **只在 worker 程序**執行（非 request thread）；web 端 1.3 已 <1s 回 jobId；本 story 不在任何 Route Handler 內呼叫 Claude。
8. **AC8（job 生命週期寫回）** Given 解析結果，Then 成功→`parse_jobs.status='succeeded'`（解析逐行結果持久化供 1.5 IRC/核對；存放沿用既有表或 job 結果欄位策略——**不新增 schema 表**，見 Dev Notes 決策）；降級→`'degraded'`；全敗→`'failed'`（友善 error）；processing 中可選 `'processing'`。1.3 ParseProgress 既有輪詢無需改即反映。
9. **AC9（#5564 回歸；接 1.1 carry-forward）** Given 回歸測資，Then 以**真 #5564 fixture**（取代 `src/features/parsing/__fixtures__/receipt-5564.placeholder.ts` 之 placeholder）回填 `regression-invariants.test.ts` 之 `it.todo("…REAL #5564…Story 1.4/1.5")`；解析為 **28 行（含 3 筆 IRC 行，IRC 此處僅辨識為負額行，歸屬＝1.5）**；`parsed_sum`（行 gross 加總，未折抵）斷言維持雙不變量 harness 綠（最終 net parsed_sum==2208.50 之 IRC 折抵屬 1.5）。**真 Claude 解析準確率**＝實機驗證（無 key→`W-1-4-1`）；多頁 n=0（`W-CR-5`）。
10. **AC10（LLM Compliance 全 on-spec）** Given 1.4 為 LLM 核心 story，Then 本檔 `## LLM Compliance` 表：items **1,2,4,5 ✅ on-spec 於此**（retry/cost/degrade/log）；item **3 ⏸ inherited（Story 1.3 已 on-spec async/queue；本 story 加 verify wiring task 不重實作）**；item **6 N/A**（async+輪詢非 chat 串流）；item **7 ⏸ Story 1.7**（沿用 1.3 budget seam，不在此 enforce）。任一 P0 未交代不得 ready。
11. **AC11（測試 + 綠燈 + 邊界不回歸）** Given `pnpm test`，Then 純邏輯（cost 計算、退避/jitter 策略、降級選擇器、`ReceiptLineSchema` 解析含非法輸入、prompt 組裝、#5564 fixture 不變量）node 全測；Claude SDK/pg-boss consumer/DB 整合不入 node（型別+`W-1-4-1` 整合驗證）；既有測試（geometry/pages/schema/budget/regression，全綠）**零回歸**；`pnpm lint && typecheck && build` 全綠。**不改 `src/db/schema.ts` 表**；**不繞過** visionAdapter；不碰 1.2/1.2b client 流程；新增相依僅 `@anthropic-ai/sdk`（dev 時 `claude-api` skill 指定版本 + 供應鏈 minimumReleaseAge 檢查；無 key 不阻擋 build/test）。

## Tasks / Subtasks

- [x] **Task 0**：claude-api skill 已 invoke（SDK 用法/prompt caching/vision 多圖/`output_config.format` 結構化輸出/usage cost/typed error 分類/模型 ID 確認）；供應鏈：`@anthropic-ai/sdk@0.97.x` <24h 被擋 → pin **0.96.0**（2026-05-13，安全），host frozen-lockfile exit 0。
- [x] **Task 1**（AC3,AC11）：`schema.ts` 加 `ReceiptLineSchema`（description/rawText?/qty 正整數/amountCents 整數分，負額=IRC 行）+`ParsedReceiptSchema`+`PARSED_RECEIPT_JSON_SCHEMA`（手寫，避免 SDK↔zod 版本耦合）+ `z.infer`；schema.test.ts +具名測（合法/負額/float 拒/空/缺欄）。
- [x] **Task 2**（AC4,AC6,AC11）：`models.ts`（PRIMARY sonnet-4-6 / FALLBACK haiku-4-5-20251001）、`cost.ts`（`computeCostUsd` 純，含 cache write 1.25×/read 0.1×、unknown→0、numeric10,6 rounding）、`retry.ts`（`isRetryableStatus` 429/5xx/529、`backoffWithJitterMs` full-jitter rng 注入、`buildAttemptPlan` sonnet×3→haiku×3）+ cost.test/retry.test 具名 node 測。
- [x] **Task 3**（AC1-6）：`visionAdapter.ts` 取代 NotImplemented stub——單一 Anthropic import 點；單次多圖 messages.create（system 指令塊 `cache_control:ephemeral`、`output_config.format`=JSON schema）→ JSON.parse → `ParsedReceiptSchema` 驗證；plan 迭代 sonnet×3→haiku×3，retryable(429/5xx)→jitter backoff、4xx/結構錯→降級；**每次嘗試**寫 `llm_costs`（model/tokens/latency/cost/requestId/success）；refusal/max_tokens→降級；原始錯誤零外洩（friendly）；**無 key→友善降級不 crash**（→W-1-4-1）；cache/last-good tier 未實作（→W-1-4-2，非 silent）。
- [x] **Task 4**（AC1,AC7,AC8）：`parseWorker.ts` `boss.work("parse",…)`→`visionAdapter`→`markJobStatus`/`markJobFailed`（succeeded/degraded/failed，friendly only；ParsedReceipt 回傳＝pg-boss job output＝1.4→1.5 hand-off，無新表→W-1-4-3）；handler resolve 不 throw（visionAdapter 已 own retry，避免 pg-boss 雙重 retry）；`index.ts` G2 序 waitDB→migrate→boss.start→**registerParseWorker** 不變；**W-CR-1** 關閉：post-start pg-boss error→log+`process.exit(1)`（orchestrator 重啟，非靜默假健康）。
- [x] **Task 5**（AC9,AC11）：誠實處理——無真 #5564 ground truth + 無 ANTHROPIC_API_KEY，**不捏造** 28 行 fixture（會成 W-CR-4 tautology / 違「不謊報」）；regression `it.todo` 保留為 anchor，僅更新註記指向 `W-1-4-1`（真 runtime）/`W-CR-5`（多頁 n=0）；placeholder 雙不變量 harness 不動、續綠。
- [x] **Task 6**（AC10）：LLM Compliance 表（本檔）逐項對齊 code：1/2/4/5 ✅on-spec（visionAdapter retry/cost/log/degrade，檔:行）；3 ⏸inherited（parseWorker 用 1.3 `PARSE_QUEUE`/`ParseJobPayload` 契約＝async wiring 仍成立，未重實作）；6 N/A；7 ⏸1.7（visionAdapter 不 enforce budget，1.3 `checkParseBudget` seam 未動）。
- [x] **Task 7**（AC11）：`pnpm typecheck`(0)/`lint`(0)/`test`(7 files,71 pass+2 todo,0 回歸)/`build`(綠) 全綠；靜態掃描：唯一 Anthropic import＝`visionAdapter.ts`、零 raw-error/image-byte log、`src/db/schema.ts` 未改、G2 序未動、僅 +`@anthropic-ai/sdk@0.96.0`（供應鏈已查）；無 key build/test 不阻（adapter 友善降級不 crash）。真 Claude runtime → `W-1-4-1`。

## Dev Notes

### 範圍鐵則（防越界 1.5/1.6/1.7、防繞過邊界）

- **1.4 = 影像→Zod 驗證逐行品項 + 縮寫還原 + LLM-Ops 包裹（retry/log/cost/degrade）+ parseWorker 消費者。** 明確 OUT：IRC→母行歸屬/net_cents/最終 net parsed_sum＝**1.5**；非 #5564 結構硬拒＝**1.6**；預算 enforcement＝**1.7**（沿用 1.3 seam）；上傳/job/輪詢＝**1.3 done**（勿改其契約）。[Source: epics.md#Story 1.4–1.7；architecture.md L315]
- **唯一 Claude 邊界，禁繞過**：只 `visionAdapter`；parseWorker 經它，無其他 `@anthropic-ai/*` import。[Source: architecture.md L459/L554-556；1-1 visionAdapter.ts 檔頭；docs/llm-compliance-checklist.md]
- **不新增 schema 表**（1.1 4 表）。解析逐行結果持久化策略：優先用既有 `parse_jobs`（如結果以 job 結果欄位/既有可用欄位或 pg-boss job state 表達）——dev 評估最小可行且不改 `src/db/schema.ts`；`receipt_lines` 表是後續（1.5 才需 IRC 結構），本 story 結果交付給 1.5 的形式於 dev 決策並記錄（不 pre-empt 1.5 的 schema）。若確需持久化逐行而無欄位 → 升級為 user/architect 決策（**勿擅自加表**；記 deferred + surface）。

### CIP 鎖定決策（採用，PO 可異議）

- **單次 Claude vision 呼叫帶 N 影像**（非逐頁+合併）：原生多圖、單筆 cost 紀錄、跨頁對帳較單純。頁序＝收據上→下（1.5 跨頁加總依賴）。上限 `MAX_PARSE_PAGES=5`（1.3 schema.ts 常數，沿用）。[Source: docs/PRD-multi-page-receipt-roadmap.md §5 決策2；epics.md#Story 1.4 CIP fold-in]

### LLM Compliance（`docs/llm-compliance-checklist.md` — 1.4 為核心 LLM story）

| # | 項目 | 1.4 處置 | 證據/指向 |
|---|---|---|---|
| 1 | retry≥3 jittered backoff | ✅ **on-spec**：pg-boss job 級 jittered + visionAdapter 應用層退避(Task2/3) | AC4, Task 2-3 |
| 2 | 持久化 cost/budget | ✅ **on-spec**：每次呼叫寫 `llm_costs`，per-session-day 可聚合(Task2/3) | AC6 |
| 3 | >1s async/queue | ⏸ **inherited（Story 1.3 已 on-spec）**：本 story 加「verify 1.3 wiring 仍成立」task，不重實作 | Task 6；1.3 |
| 4 | graceful degradation 鏈 | ✅ **on-spec**：sonnet→haiku→cache→static→friendly(Task3) | AC5 |
| 5 | 結構化 per-call LLM log | ✅ **on-spec**：每次嘗試 model/tokens/latency/cost/ids/success 入 `llm_costs`(Task3) | AC6 |
| 6 | SSE 串流 chat UX | **N/A by architecture**：async job + 1.3 輪詢，非 chat token 串流 | architecture L260-264 |
| 7 | per-user rate limit | ⏸ **Story 1.7**：沿用 1.3 `checkParseBudget` seam，1.4 不 enforce | 1.3 budget.ts；1.7 |

**Gate**：items 1-5 P0 — 1/2/4/5 ✅on-spec 於此、3 ⏸legit-inherited(1.3)；6 N/A、7 ⏸1.7。全交代，符合 ready。

### 架構約束（DEV 必遵）

- 模型：primary **`claude-sonnet-4-6`**、fallback **`claude-haiku-4-5-20251001`**。[Source: architecture.md L207]
- LLM-Ops 非協商：退避+jitter≥3(L1)、結構化全欄 log(L2)、cost 持久化 Postgres per-session-day(L3)、worker 程序(L4)、預算(L5→1.7)。降級鏈 R1。[Source: architecture.md L55-60,L260-273]
- Zod：`schema.ts` 內 `…Schema` 命名 + `z.infer` 同名；LLM JSON 結構錯**早攔**（全域非協商）。[Source: architecture.md L229,L360]
- `llm_costs` 既有欄（1.1 schema.ts）：id/sessionId/requestId/model/promptTokens/completionTokens/latencyMs/costUsd(numeric10,6)/success/createdAt + idx(session_id,created_at) → per-session-day 聚合就緒。**勿改表**。
- `prompt caching`、最新 SDK、vision multi-image、tool/JSON 結構化輸出：dev 時 **`claude-api` skill 為準**（覆蓋訓練資料）。

### Previous Story Intelligence（1.1→1.3，必讀）

- **1.3 done 上游契約（勿改）**：pg-boss queue 名 `"parse"`（`src/features/parsing/server/queue.ts` `PARSE_QUEUE`）；payload `ParseJobPayload {sessionId,jobId,pageCount,images:string[]base64,mimeTypes:string[]}`；`parse_jobs` 狀態 enum `queued|processing|succeeded|failed|degraded`（free-text，consumer 寫合法值）；`getJobStatus` friendly-only、`markJobFailed` 友善；1.3 ParseProgress 輪詢已就緒（succeeded/degraded/failed 終態 + 逾時上限）。consumer 寫回這些既有欄位即被 UI 反映，**不需動 1.3**。
- **1.3 producer-only**：`queue.ts` 僅 `boss.send`；本 story 才加 `boss.work` consumer（檔頭 guard 註解預告）。`W-CR-1`（pg-boss liveness）trigger＝「1.3 加 consumer」其實是 1.4（1.3 是 producer）；本 story consumer 落地時補 liveness/致命退出，關閉 W-CR-1。
- **lazy db client**（1.3）：`@/lib/db/client` 之 `db` 為 lazy proxy（首次使用才連線、非 thenable）；worker 程序有 `DATABASE_URL`，正常。
- **慣例**：Conventional Commits、每 story commit、claim 前跑 lint/typecheck/test/build 貼證據、非 silent deferred、純邏輯 node 測 / IO·SDK 整合不入 node（→ W-item）。供應鏈：新增 npm 前 `pnpm view` + minimumReleaseAge（1.1/1.3 前車），必要時 pin 安全版。[Source: 1-1/1-2/1-2b/1-3 story 檔；MEMORY 各 lesson]

### Git Intelligence

近期鏈（…→`7ac1082`）：per-story 多 commit、code-review full（有 spec）→ 自主修 patch → done；deferred 全登記。本 story：dev→閘門→code-review full（1.4 LLM-boundary，4 hunters 含 LLM Compliance）→ commit。

### 最新技術資訊

- **`@anthropic-ai/sdk`**：dev 時 `claude-api` skill 取最新穩定版 + prompt caching（system/指令塊 `cache_control`）、vision（多 image block 單訊息）、結構化輸出（tool 或 JSON schema）、token usage 取得（cost 計算用）。版本須過 minimumReleaseAge（無則 pin 較舊安全版，比照 1.3）。
- 模型 ID 寫常數（`src/lib/llm/models.ts` 或 visionAdapter 內常數）：`claude-sonnet-4-6` / `claude-haiku-4-5-20251001`，便於降級鏈與測試。
- 無 `ANTHROPIC_API_KEY`：adapter 須對「缺 key」走**友善降級**（static fallback + job `degraded/failed`），**不得**crash worker 進程或 build/test；真呼叫驗證＝`W-1-4-1`。

### Project Structure Notes

- 新增：`src/lib/llm/{cost.ts,cost.test.ts,retry.ts,retry.test.ts,models.ts}`、`src/workers/parseWorker.ts`、`src/features/parsing/schema.ts`（加 `ReceiptLineSchema`/`ParsedReceiptSchema` + 測）、真 `__fixtures__/receipt-5564*`（取代 placeholder）。
- 更新：`src/lib/llm/visionAdapter.ts`（NotImplemented stub → 實體，簽章在此定義）、`src/workers/index.ts`（pg-boss start 後 register parseWorker；G2 順序不變）、`src/features/parsing/__tests__/regression-invariants.test.ts`（填 REAL #5564 `it.todo`，保留 id）、`package.json`（+`@anthropic-ai/sdk` 供應鏈已查）。
- 不動：`src/db/schema.ts`（表）、1.3 queue/jobs/route/schema 既有契約、1.2/1.2b client 流程、CI harness 結構。

### References

- [Source: epics.md#Story 1.4 L351-375（GWT、FR4/5、NFR-L1-5/R1、#5564 28 行 3 IRC、CIP 多圖）]
- [Source: prd.md FR4/FR5、NFR-L1–L5、NFR-R1]
- [Source: architecture.md L55-60,L98-99,L207,L229,L260-273,L315,L360,L459,L554-556（LLM-Ops 非協商、模型、Zod、降級、單一邊界）]
- [Source: docs/llm-compliance-checklist.md（1.4＝items1/2/4/5 ✅on-spec；ledger）]
- [Source: docs/PRD-multi-page-receipt-roadmap.md §5（單次多圖鎖定決策）]
- [Source: src/lib/llm/visionAdapter.ts（1.1 stub 檔頭：簽章/LLM-Ops 留給 1.4）、src/db/schema.ts（llm_costs 欄）、src/features/parsing/server/{queue,jobs}.ts（1.3 契約）、src/features/parsing/__fixtures__/receipt-5564.placeholder.ts、__tests__/regression-invariants.test.ts（REAL #5564 it.todo）]
- [Source: deferred-work.md#W-CR-1（pg-boss liveness，trigger=1.4 consumer）、#W-CR-5（多頁 n=0）、#W-1-3-1（1.3 整合 smoke）]
- [Source: `claude-api` skill（dev 時 SDK/caching/vision 最佳實務，覆蓋訓練資料）；專案 AGENTS.md（Next 16 文件）]

## Dev Agent Record

### Agent Model Used

claude-opus-4-7[1m]（dev-story，2026-05-20）

### Debug Log References

- `claude-api` skill：單次多圖＝一則 user message 內 N 個 base64 image block + text；prompt caching＝system 陣列塊加 `cache_control:{type:"ephemeral"}`（注意 Sonnet 4.6 最小可快取前綴 2048 tok，短指令可能不快取，無害）；結構化輸出＝`output_config:{format:{type:"json_schema",schema}}`（prefill 在 4.6 是 400，棄用）；usage 含 `cache_creation/read_input_tokens`（SDK 型別為 `number|null` → recordCost 參數改 `number|null` + `?? undefined` 餵 computeCostUsd）；typed error `Anthropic.APIError.status` 分類；模型 ID 不加日期後綴（haiku 用文件全 ID `claude-haiku-4-5-20251001`，sonnet alias `claude-sonnet-4-6`）。
- 供應鏈：`@anthropic-ai/sdk@0.97.1` 發布 2026-05-19T15:42Z（<24h，會被 minimumReleaseAge 擋）→ pin **0.96.0**（2026-05-13，~6.7 天，安全）。
- 無 `ANTHROPIC_API_KEY`：`new Anthropic()` 缺 key 會 throw → 已在 adapter 先檢查 env，缺則直接友善降級回傳，不建構 client、不 crash worker（真呼叫驗證＝W-1-4-1）。

### Completion Notes List

- ✅ Tasks 0–7 全綠。Story 1.4 唯一 Claude 視覺邊界 + parseWorker 消費者 + LLM-Ops（retry/log/cost/degrade）落地。
- 設計決策（documented，非 silent）：①CIP 單次多圖（已採）；②結構化輸出用手寫 JSON schema + 自家 Zod 雙重驗證（避免 SDK↔zod 版本耦合，AC3 防禦縱深）；③1.4→1.5 解析結果 hand-off＝pg-boss job output（handler 回傳 ParsedReceipt），**不新增 app schema 表**（receipt_lines 正式化＝Story 1.5）→ `deferred-work#W-1-4-3`；④cache/last-good 降級層未實作（無 prior-good store）→ `W-1-4-2`；⑤真 Claude runtime + 真 #5564 準確率 → `W-1-4-1`（無 key/無 ground truth，不謊報）。
- W-CR-1（pg-boss liveness）**RESOLVED**：consumer 落地，post-start error → log + 非零退出。
- 📋 驗證協定回溯：**AC↔測試映射** — AC3/AC4/AC6 純邏輯（ReceiptLineSchema/cost/retry）→ schema.test/cost.test/retry.test 具名 node 測；AC1/AC2/AC5/AC7/AC8（Claude SDK/pg-boss consumer/DB 整合）＝整合層，依 AC11 不入 node（型別+build+靜態掃描 + W-1-4-1 runtime）；AC9 誠實 deferred（不捏造）；AC10/AC11 靜態掃描+閘門全綠。**LLM Compliance** — 1/2/4/5 ✅on-spec、3 ⏸1.3、6 N/A、7 ⏸1.7。**Deferred** — W-1-4-1（真 runtime，P1）、W-1-4-2（cache tier，Phase-later）、W-1-4-3（1.5 receipt_lines 持久化正式化，P1）。

### Change Log

- 2026-05-20：Story 1.4 實作。新增 `lib/llm/{models,cost(+test),retry(+test)}`、`workers/parseWorker`；改寫 `lib/llm/visionAdapter`（NotImplemented→實體，唯一邊界）、`features/parsing/schema`(+ReceiptLine/ParsedReceipt/JSON schema+test)、`features/parsing/server/jobs`(+markJobStatus)、`workers/index`(register consumer + W-CR-1 liveness)、regression `it.todo` 註記。+`@anthropic-ai/sdk@0.96.0`（供應鏈已查）。閘門全綠（typecheck/lint/test 71+2/build）。W-CR-1 RESOLVED。Status review。

### File List

> A=新增 M=改。

- `src/lib/llm/visionAdapter.ts`（M：NotImplemented stub → 實體單一 Claude 邊界 + LLM-Ops）
- `src/lib/llm/models.ts`（A：模型 ID + 降級序）
- `src/lib/llm/cost.ts`（A：純 cost 計算）/ `src/lib/llm/cost.test.ts`（A：node 測）
- `src/lib/llm/retry.ts`（A：純 retry/jitter/plan）/ `src/lib/llm/retry.test.ts`（A：node 測）
- `src/workers/parseWorker.ts`（A：pg-boss `parse` 消費者）
- `src/workers/index.ts`（M：register parseWorker + W-CR-1 liveness；G2 序不變）
- `src/features/parsing/schema.ts`（M：+ReceiptLine/ParsedReceipt/PARSED_RECEIPT_JSON_SCHEMA）/ `schema.test.ts`（M：+具名測）
- `src/features/parsing/server/jobs.ts`（M：+markJobStatus）
- `src/features/parsing/__tests__/regression-invariants.test.ts`（M：REAL #5564 it.todo 註記，anchor 保留）
- `package.json`（M：+@anthropic-ai/sdk@0.96.0）
- `_bmad-output/implementation-artifacts/{1-4-...md,sprint-status.yaml,deferred-work.md}`（M）
