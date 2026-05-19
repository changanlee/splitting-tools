# Story 1.3: 非阻塞解析提交與進度輪詢（多頁上傳契約）

Status: ready-for-dev

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## ⚠️ Dev 前置硬門檻（dev-story 不得在此之前開始）

本 story 是**第一個 server 端 story**：需 Next Route Handler + Postgres + pg-boss runtime。**dev-story 必須等 `deferred-work.md#W-1-1-1`（docker compose 三服務 db/web/worker 重驗）RESOLVED、Story 1.1 進入 review/done 之後才開始**。在 1.1 runtime 未驗證前實作 1.3 ＝ 蓋在未證地基（CIP 依賴鏈禁止）。create-story（本檔）可先行；dev-story 不可。

## Story

As a 付款人，
I want 把（一或多頁）已遮收據送出後**立即**拿到一個工作識別、並看到「排隊／解析中／完成／失敗／降級」的真實進度，
so that 解析不阻塞我的操作、賣場弱網下也看得到進展，而不是對著黑箱轉圈（FR3、NFR-P1、NFR-L4；多頁 CIP fold-in）。

## Acceptance Criteria

> 來源：`epics.md#Story 1.3`（GWT 逐字）＋ CIP fold-in（多頁上傳）＋ 為防 LLM 模糊化補可驗證門檻＋專案 `docs/llm-compliance-checklist.md`（1.3 為 LLM-boundary：item 3 on-spec）。

1. **AC1（多頁上傳端點 — 契約）** Given 付款人在 Story 1.2/1.2b ready 狀態持有**有序去重 `Blob[]`**（單頁長度 1），When 前端 POST 至解析端點（Next Route Handler，`multipart/form-data`，**有序** N 個已遮 JPEG part + 頁數），Then 伺服器建立一筆 `sessions` + 一筆 `parse_jobs`（`status='queued'`），將解析工作**入 pg-boss queue**（producer；payload 含 sessionId + 有序影像參照 + pageCount），並**於 p95 < 1s 回 `{ jobId }`**（NFR-P1，不阻塞 request thread；解析本身 0 在此 handler 內執行）。
2. **AC2（job 狀態輪詢端點）** Given 持有 `jobId`，When 前端 GET job 狀態端點，Then 回 `parse_jobs.status ∈ {queued|processing|succeeded|failed|degraded}` + 友善訊息欄位（`error` 僅友善文案、**永不**含原始 LLM/stack 錯誤，NFR-R1）；端點為唯讀、O(1) 查詢（`idx_parse_jobs_session_id` 已存在）。
3. **AC3（前端輪詢 + ParseProgress，非黑箱）** Given 已送出取得 jobId，When 前端輪詢狀態端點，Then 以 **TanStack Query**（架構指定）間隔 2–3s + **閒置退避**（NFR-P4）輪詢；`ParseProgress` 元件以「文字＋圖示＋語意色」三重編碼呈現五狀態（非僅轉圈）；`succeeded`/`failed`/`degraded` 為終態即停止輪詢、不空轉。
4. **AC4（Zod 單一契約源 — 前後端型別安全）** Given 任何 parse 提交/狀態 API，Then 請求/回應 schema 以 **Zod** 定義於 `src/features/parsing/schema.ts`、前後端共用並推導 TS 型別（架構：不扛 tRPC 也要型別安全）；非法輸入（非影像 part、0 part、超頁數）回結構化錯誤封套（4xx，友善訊息）。
5. **AC5（NFR-S3 不回歸 — 伺服器只收已遮）** Given 上傳，Then 伺服器**只接收/只暫存**已遮影像；未遮原圖不存在於任何請求（Story 1.2/1.2b 已保證 client 端只送已遮 blob）；伺服器端影像暫存路徑不長期保留（30 天銷毀屬 Story 6.1；本 story 至少不得無界堆積——寫入即關聯 session、可被後續清除）。伺服器**不得**將影像或其位元組寫入 log。
6. **AC6（pg-boss 邊界：producer-only；不越界 1.4/1.7）** Given 本 story，Then **只**做 job 入列（producer）+ job 列生命週期 + 狀態端點 + 前端輪詢。**不**實作視覺 LLM 呼叫、**不**碰 `src/lib/llm/visionAdapter.ts`、**不**寫 parseWorker 消費者（皆 Story 1.4）；**不**做 per-session/IP 預算 enforcement（Story 1.7，但**須留 seam**：job 入列前一個可擴充的 gate 函式佔位，預設 pass，1.7 接 `rate_counters`）。G2 init order 不變（Drizzle migrate → pg-boss start，Story 1.1 既定）。
7. **AC7（LLM Compliance — 依專案 checklist）** Given 1.3 為 LLM-boundary story，Then 本 story 規格含 `## LLM Compliance` 分節，逐項標記 7 不可協商項（見下）：item **3（>1s async/queue）✅ on-spec 於此**；items **1,2,4,5 ⏸ inherited→Story 1.4**（僅驗證 wiring 不重實作）；item **6 N/A（async+polling 架構，非 chat 串流）**；item **7 ⏸ Story 1.7**（本 story 留 budget seam）。任一 P0 未交代不得 ready-for-dev。
8. **AC8（測試 + 綠燈，沿用既定策略）** Given `pnpm test`，Then：Zod schema 驗證 + job 狀態映射 + budget-seam（預設 pass）等**純邏輯**抽純函式 node 單測全綠（沿用 `vitest` node env、co-located）；Route Handler/pg-boss/DB 整合層不入 node 單元測（避免重相依；以型別 + 手動/整合驗證）；既有測試（geometry/pages/regression，44 pass + 2 todo）**零回歸**；`pnpm lint && pnpm typecheck && pnpm build` 全綠。
9. **AC9（行動優先 + 友善失敗，沿用 1.2 風格）** Given 弱網/上傳失敗/job 失敗，Then 友善訊息（不外洩原始錯誤）+ 可重試；ParseProgress 行動單欄、≥48px 動作、Tab/Enter、三重編碼；不追 WCAG AA。
10. **AC10（既有不回歸 + 邊界鐵則）** Given 改動，Then 不更動 Story 1.1/1.2/1.2b 邊界檔之既有行為（schema 既有 4 表、worker G2、visionAdapter 空殼、compress/mask/geometry/pages、MaskEditor、CI harness）；CaptureFlow 僅在 `ready` 後**新增**「上傳」串接（不破壞既有多頁/單頁流程）；新增 npm 相依僅限架構指定者（Zod、TanStack Query），且每個先過 `minimumReleaseAge` 供應鏈檢查（Story 1.1 曾因 <24h transitive 卡 Docker build）。

## Tasks / Subtasks

- [ ] **Task 0：前置確認（硬門檻）** — 確認 `deferred-work.md#W-1-1-1` RESOLVED 且 Story 1.1 ≥ review；否則 HALT（dev-story 不得開始）。讀 Next 16 文件（AGENTS.md）：Route Handlers（`app/.../route.ts` 之 `POST`/`GET`、`Request`/`NextResponse`、`runtime`、`multipart/form-data` 解析）、`params` 為 Promise — 與訓練資料差異記 Debug Log。
- [ ] **Task 1：Zod 契約源（AC4）** — `src/features/parsing/schema.ts`：`ParseSubmitResponse`（`{ jobId: string }`）、`ParseStatusResponse`（`{ status: 'queued'|'processing'|'succeeded'|'failed'|'degraded'; message?: string }`）、錯誤封套 schema；推導 TS 型別前後端共用。純函式可 node 測。
- [ ] **Task 2：DB 寫入（沿用既有 schema，勿改表）（AC1, AC5）** — 用既有 `src/db/schema.ts` 之 `sessions`/`parse_jobs`（**不**新增/改表）；`src/features/parsing/server/` 建立 session + parse_job 列（`status='queued'`）；影像暫存策略（關聯 sessionId、可被 6.1 清除；本 story 不無界堆積、不入 log）。
- [ ] **Task 3：pg-boss producer + budget seam（AC1, AC6）** — `src/features/parsing/server/`：job 入列（payload sessionId + 有序影像參照 + pageCount）；**不**寫消費者（1.4）。Budget gate seam：`checkParseBudget(sessionId): {ok:boolean}` 佔位純函式預設 `{ok:true}`（1.7 接 `rate_counters`）；入列前呼叫。
- [ ] **Task 4：Route Handlers（AC1, AC2, AC4, AC5, AC9）** — 解析提交 `POST`（multipart，有序 N 已遮 part + pageCount；Zod 驗證；budget seam；建 session+job+enqueue；p95<1s 回 `{jobId}`）；job 狀態 `GET`（Zod 回應；唯讀 O(1)；友善 `message`，原始錯誤不外洩）。統一錯誤封套。**伺服器不 log 影像位元組**。
- [ ] **Task 5：前端輪詢 + ParseProgress（AC3, AC9）** — 安裝 TanStack Query（先 `pnpm view @tanstack/react-query version` + minimumReleaseAge 檢查）；`src/features/parsing/hooks/useParseJobPolling`（2–3s + 閒置退避；終態停輪詢）；`ParseProgress` 元件（五狀態三重編碼、行動單欄、友善失敗+重試）。
- [ ] **Task 6：CaptureFlow 串接（AC10）** — `ready` 階段「下一步：上傳」改為實際 POST `phase.blobs`（有序 multipart）→ 取 jobId → 顯示 `ParseProgress`。**不**破壞既有單頁/多頁/error 流程；未遮影像永不入請求（已由 1.2/1.2b 保證，AC5）。
- [ ] **Task 7：LLM Compliance 分節落實（AC7）** — 於本檔 `## LLM Compliance` 逐項交代並在 code 對應處留 inherited 標記/seam；item 3 AC1/Task3 on-spec 證據；items 1/2/4/5 指向 Story 1.4；item 7 指向 Story 1.7 + 本 story seam。
- [ ] **Task 8：驗收自查（AC8, AC10）** — `pnpm lint`(0) && `pnpm typecheck`(0) && `pnpm test`（既有 44+2 零回歸 + 新純邏輯具名測試）&& `pnpm build`（綠）；靜態掃描：未遮原圖零持久化/log；無繞過 visionAdapter；G2 order 未動；`package.json` 僅新增 Zod/TanStack（供應鏈已查）。整合 smoke（docker 環境，W 登記若無法自動化）。

## Dev Notes

### 範圍鐵則（防 scope creep / 防越界 1.4·1.7）

- **1.3 ＝ 非阻塞管道與可見性，不含 LLM。** 只做：多頁上傳端點、session+job 列、pg-boss **producer**、狀態端點、前端輪詢/進度。**禁**：呼叫 Claude、寫 `visionAdapter`、寫 parseWorker 消費者（→ Story 1.4）；做預算 enforcement（→ Story 1.7，本 story 只留 `checkParseBudget` seam 預設 pass）；改 `src/db/schema.ts` 表結構（既有 `parse_jobs` 已含本 story 所需欄位/狀態枚舉/index，1.1 已前瞻）。[Source: epics.md#Story 1.3；architecture.md#API-&-Communication-Patterns L255-273；docs/llm-compliance-checklist.md]
- **G2 不可違反**：pg-boss 自管 schema，初始化序 Drizzle migrate → pg-boss start（Story 1.1 `src/workers/index.ts` 既定）。producer 入列不得改動此序。[Source: src/workers/index.ts 檔頭 G2；architecture.md Gap G2]

### 上游契約（Story 1.2b done → 本 story 輸入）

- 1.2b `CaptureFlow` `ready` 狀態持 **有序、去重 `Blob[]`**（單頁長度 1，與 1.2 語意相容）。本 story 上傳 = 依序把該 `Blob[]` 組 multipart（保序！頁序＝收據由上到下，後續 1.4/1.5 跨頁加總依賴此序）。[Source: 1-2b-multi-page-capture.md AC4/輸出契約；epics.md#Story 1.2b]
- 未遮影像在 client 端永不產生可外送物（1.2/1.2b NFR-S3 已保證）；伺服器端據此**只**會收到已遮 JPEG —— AC5 是「不回歸 + 伺服器側不洩漏」，非重做遮蔽。

### 架構約束（DEV 必遵）

- **API**：Next.js Route Handlers REST JSON；前後端共用 **Zod schema → 推導 TS**（契約安全）。[Source: architecture.md L257-259]
- **非同步**：上傳 → pg-boss job → <1s 回 job_id（NFR-P1）；解析在 worker（NFR-L4）——本 story 只 producer 端。[Source: architecture.md L260-262]
- **輪詢**：**TanStack Query**，2–3s + 閒置退避（NFR-P4）；終態停輪詢。[Source: architecture.md L263-264]
- **錯誤/降級**：統一錯誤封套；原始錯誤永不外洩（NFR-R1）。降級鏈本體屬 1.4；本 story 狀態端點需能呈現 `degraded` 終態。[Source: architecture.md L266-270]
- **單一 Postgres**：app 表 + pg-boss queue 同庫同連線（`src/lib/db/client.ts`）。[Source: architecture.md L222-226；src/lib/db/client.ts]
- **目錄**：`src/features/parsing/{schema.ts,server/,hooks/,components/}` + Route Handler 於 `src/app/.../route.ts`。[Source: architecture.md#Project-Structure L520-539]

### LLM Compliance（依 `docs/llm-compliance-checklist.md`，1.3 為 LLM-boundary）

| # | 項目 | 本 story 處置 | 證據/指向 |
|---|---|---|---|
| 1 | retry≥3 jittered backoff | ⏸ inherited → **Story 1.4**（pg-boss jittered，NFR-L1）；本 story 僅 producer 入列，留 job 列 | 1.4；不在此實作 |
| 2 | 持久化 cost/budget | ⏸ inherited → **1.4**（`llm_costs`，1.1 schema 已備） | 1.4 |
| 3 | >1s async/queue | ✅ **on-spec 於此**：上傳即入 pg-boss、<1s 回 jobId、解析在 worker（AC1/Task3） | AC1, Task 3-4 |
| 4 | graceful degradation 鏈 | ⏸ inherited → **1.4**（NFR-R1）；本 story 狀態端點需呈現 `degraded` 終態（不外洩原始錯誤） | AC2；1.4 |
| 5 | 結構化 per-call LLM log | ⏸ inherited → **1.4**（NFR-L2/L3）；本 story **不**呼叫 LLM 故無 call log；但**不得** log 影像位元組（AC5） | 1.4；AC5 |
| 6 | SSE 串流 chat UX | **N/A by architecture**：async job + 輪詢模型（非 chat），ParseProgress 輪詢非 token 串流 | architecture L260-264 |
| 7 | per-user rate limit at boundary | ⏸ → **Story 1.7**（`rate_counters`）；本 story 留 `checkParseBudget` seam（預設 pass，入列前呼叫） | AC6, Task 3；1.7 |

**Gate**：items 1-5 P0；本 story item 3 ✅ on-spec，1/2/4/5 為合法 ⏸ inherited（指向 1.4，附 wiring 驗證 task，不重實作），6 N/A、7 ⏸ 1.7 — 全部已交代，符合 ready-for-dev 門檻。

### Previous Story Intelligence（1.1 / 1.2 / 1.2b）

- **1.1 scaffold（必用，勿重造）**：`src/db/schema.ts` 已有 `sessions`/`parse_jobs`（status 枚舉 + `error` 友善欄 + `idx_parse_jobs_session_id`）/`llm_costs`/`rate_counters`；`src/lib/db/client.ts`（單 pool+drizzle，缺 env throw）；`src/workers/index.ts`（G2 boot：waitForDB→migrate→pg-boss start，shutdown 守衛已硬化）。`visionAdapter.ts` 為 NotImplemented 空殼——**勿碰**。
- **1.2/1.2b**：零新增相依方針（本 story 例外＝架構指定 Zod/TanStack，須過供應鏈檢查）；client 端已保證只送已遮 blob；CaptureFlow `ready{blobs:Blob[]}` 是上傳輸入；測試策略＝純邏輯 node 測、DOM/IO 膠合不入 node 測；Conventional Commits + 每 story commit + verification-before-completion + deferred-work 登記。
- **供應鏈**：新增任何 npm 前 `pnpm view <pkg> version` + 評估日齡（1.1 因 transitive <24h 卡 Docker build）。Zod、`@tanstack/react-query` 皆成熟，預期安全，仍須記錄檢查。

### Git Intelligence

近期 commit 鏈（`8b588f1`→`592abaa`）：Conventional Commits、每 story/邏輯單元一 commit、claim 前必跑 lint/typecheck/test/build 貼證據、NFR 以靜態掃描佐證、deferred/by-design 一律登記。本 story 沿用；dev 完成 → 閘門 → code-review（full，有 spec）→ commit。

### Project Structure Notes

- 新增（**Route 路徑為架構明定，勿自創**）：
  - `src/app/api/splits/[linkId]/parse-jobs/route.ts` — **POST** 多頁上傳 → 入 job → `{jobId}`（architecture.md L524, L352-353）
  - `src/app/api/splits/[linkId]/parse-jobs/[jobId]/route.ts` — **GET** job 狀態（輪詢）（architecture.md L525）
  - `src/features/parsing/schema.ts`（Zod 契約）、`src/features/parsing/server/*`（session/job/enqueue/budget-seam）、`src/features/parsing/hooks/useParseJobPolling.ts`、`src/features/parsing/components/ParseProgress.tsx`
  - **session/linkId 邊界（重要，勿越界 Story 3.1）**：架構「連結即憑證」＝ `sessions.id` 同時是 `[linkId]`。**不可猜連結 ID 產生＝ Story 3.1**（`schema.ts` 註解、sprint-status CARRY-FORWARD 明載）。本 story 須有「建 session」動作（payer 首次上傳即誕生 session；對應 architecture L521「POST 建 session」可併入 parse-jobs POST 之前置，或獨立——dev 擇一，但 **1.3 只用伺服器產生的 session id，不得提前實作 3.1 的不可猜方案**；型別/路由參數命名沿用架構 `[linkId]` 以免 3.1 retrofit）。Next 16 動態路由 `params` 為 `Promise`（AGENTS.md/1.2 已記）。
  - `[Source: architecture.md#Project-Structure L509-532, L352-353; schema.ts「Link id generation lands in Story 3.1」; sprint-status CARRY-FORWARD]`
- 更新：`src/features/parsing/components/CaptureFlow.tsx`（`ready` 後串接上傳；不破壞既有流程）；`package.json`（+Zod +@tanstack/react-query，供應鏈已查）。
- 不動：`src/db/schema.ts`、`src/workers/index.ts`、`visionAdapter.ts`、`compress/mask/geometry/pages.ts`、`MaskEditor.tsx`、CI harness。

### References

- [Source: epics.md#Story 1.3 + 〔CIP fold-in〕L333-349]
- [Source: prd.md FR3、NFR-P1、NFR-L4、NFR-P4、NFR-R1]
- [Source: architecture.md#API-&-Communication-Patterns L255-273 / #Project-Structure L520-539 / #單一Postgres L222-226 / Gap G2]
- [Source: docs/llm-compliance-checklist.md（1.3 LLM-boundary：item3 on-spec、1/2/4/5⏸1.4、7⏸1.7）]
- [Source: 1-2b-multi-page-capture.md（輸出契約 Blob[]）、1-2-capture-compress-mask.md、1-1-project-scaffold-ci.md（schema/worker/client）]
- [Source: deferred-work.md#W-1-1-1（dev-story 前置硬門檻）]
- [Source: 專案根 AGENTS.md（寫碼前讀 Next 16 Route Handlers 文件）]

## Dev Agent Record

### Agent Model Used

（dev-story 時填入）

### Debug Log References

### Completion Notes List

### Change Log

### File List
