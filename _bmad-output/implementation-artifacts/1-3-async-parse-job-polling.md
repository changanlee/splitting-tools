# Story 1.3: 非阻塞解析提交與進度輪詢（多頁上傳契約）

Status: done

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

- [x] **Task 0：前置確認（硬門檻）** — W-1-1-1 RESOLVED + Story 1.1 done 已確認；讀 Next 16 Route Handlers 文件（`route.ts` `GET/POST(Request)`、**`ctx.params` 為 Promise**、預設不快取、Web `Request`/`formData()`），與訓練差異記 Debug Log；params 採顯式 `{ params: Promise<{...}> }`（typegen-independent）。
- [x] **Task 1：Zod 契約源（AC4）** — `src/features/parsing/schema.ts`：`CreateSessionResponse`/`ParseSubmitResponse`/`ParseStatusResponse`/`ErrorEnvelope` + 純 `validateParseSubmit`/`friendlyJobMessage`/`isTerminalStatus`/`MAX_PARSE_PAGES`；`schema.test.ts` 11 具名 node 測（RED→GREEN）。
- [x] **Task 2：DB 寫入（沿用既有 schema）（AC1, AC5）** — `server/jobs.ts`：`createSession`（randomUUID＝placeholder linkId，3.1 才定不可猜）/`createQueuedJob`/`markJobFailed`/`getJobStatus`（scoped by linkId, O(1)）；**未改 schema 表**；不 log 影像。
- [x] **Task 3：pg-boss producer + budget seam（AC1, AC6）** — `server/queue.ts` lazy singleton producer（start+createQueue once，`enqueueParse`；payload sessionId+jobId+pageCount+base64 images+mime）；**無消費者/無 boss.work**（1.4）；`server/budget.ts` `checkParseBudget` 預設 pass + node 測（1.7 seam）。設計決策：影像走 pg-boss payload（單 Postgres、無改表、跨容器），物件儲存為 Phase-later（W-1-3-2）。
- [x] **Task 4：Route Handlers（AC1,AC2,AC4,AC5,AC9）** — `POST /api/splits`（建 session→201 `{linkId}`）、`POST /api/splits/[linkId]/parse-jobs`（formData→`validateParseSubmit`→budget seam→createQueuedJob→enqueue→202 `{jobId}`；enqueue 失敗→markJobFailed+502 友善）、`GET .../[jobId]`（getJobStatus+friendlyJobMessage；free-text status 經 Zod safeParse 防衛→未知降 failed；404/502 友善封套）。架構明定 2-step（建 session 與上傳分離，解 chicken-egg）。
- [x] **Task 5：輪詢 + ParseProgress（AC3, AC9）** — TanStack `@tanstack/react-query@5.100.10`（pin <24h 之前版避供應鏈擋）+ `app/providers.tsx`（QueryClientProvider，layout 掛載）；`hooks/useParseJobPolling`（2.5s、終態停、`refetchIntervalInBackground:false` 閒置退避、Zod 驗回應）；`components/ParseProgress`（五狀態 text+icon+語意色三重編碼、fetch 失敗友善+重試）。
- [x] **Task 6：CaptureFlow 串接（AC10）** — `ready` 加「上傳並解析」→ `uploadAndParse`（POST /api/splits→linkId→multipart pages→jobId→`parsing` 顯示 ParseProgress）；新增 `uploading`/`parsing`/`uploadError`(保留已遮 blob 不必重拍) phase；既有單頁/多頁/editing/error 流程未破壞；只送已遮 blob（NFR-S3）。
- [x] **Task 7：LLM Compliance（AC7）** — 本檔 `## LLM Compliance` 表已逐項交代；code：item3 on-spec（producer/<1s/worker）、items1/2/4/5 無 LLM 呼叫（queue.ts 僅 guard 註解指向 1.4）、item6 N/A（輪詢非 chat）、item7 budget seam（1.7）。
- [x] **Task 8：驗收自查（AC8, AC10）** — `pnpm typecheck`(0)/`pnpm lint`(0 err,0 warn)/`pnpm test`(5 files,56 pass+2 todo,0 回歸)/`pnpm build`(綠;3 routes `ƒ Dynamic`) 全綠；靜態掃描：影像零 log、無 visionAdapter/消費者、`src/db/schema.ts` 未動、僅 +zod/+tanstack（供應鏈已查）。**修復**：`src/lib/db/client.ts` 改 lazy（next build「collect page data」import 路由→原 top-level throw 破 build；lazy 保留 fail-loud 契約，僅延到首次使用）。整合 runtime smoke（upload→enqueue→poll，p95<1s）→ `deferred-work#W-1-3-1`（P1，docker 整合，比照 W-1-2-1 不入 node）。

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

claude-opus-4-7[1m]（dev-story，2026-05-20）

### Debug Log References

- Next 16 Route Handlers vs 訓練資料：`route.ts` 內 `export async function GET/POST(request: Request, ctx)`；**`ctx.params` 為 `Promise`**（`await ctx.params`）；預設**不快取**（POST 永不、GET 需顯式 opt-in，本 story 全動態）；用 Web `Request`/`request.formData()` 解 multipart；`Response.json()`。採顯式 `{ params: Promise<{...}> }` 而非 generated global `RouteContext`（typecheck 不依賴 typegen）。
- 建置回歸（修復）：`next build` 之「collecting page data」會 import 每個 route module，`@/lib/db/client` 原 top-level `if(!DATABASE_URL) throw` 在無 env 的 build 觸發 → build 失敗。修：client 改 lazy（Proxy，首次存取才連線+檢查），fail-loud 契約不變（仍 throw，只是延到 request/worker 使用時，那時 env 在）。僅 `jobs.ts` import `db`，export 面（db/pool/schema）不變。
- 供應鏈：`@tanstack/react-query@5.100.11` 發布 2026-05-18T19:47Z（<24h，會被 minimumReleaseAge 擋）→ pin `5.100.10`（2026-05-11，安全）；`zod@4.4.3`（2026-05-04，安全）。host `pnpm install --frozen-lockfile` exit 0。

### Completion Notes List

- ✅ Tasks 0–8 全綠（見 Tasks 勾選）。Story 1.3 非阻塞解析提交＋輪詢＋多頁上傳契約落地。
- 設計決策（documented，非 silent）：①影像走 pg-boss job payload base64（單 Postgres、無改 schema 表、跨容器 web→worker；MAX_PARSE_PAGES=5 上界；物件儲存＝Phase-later W-1-3-2）。②架構明定 2-step API（`POST /api/splits` 建 session ＋ `POST .../[linkId]/parse-jobs` 上傳），解 linkId chicken-egg；不可猜連結＝ Story 3.1（本 story 用 randomUUID placeholder，未 pre-empt）。③`client.ts` lazy 化（build 回歸修，契約不變，跨 story 修已記 Debug Log + commit）。
- 📋 驗證協定回溯：**AC↔測試映射** — AC4（Zod/validate/friendly/terminal）→ `schema.test.ts` 11 + `budget.test.ts` 1 具名 node 測；AC1/AC2/AC3/AC5/AC9（Route Handler/pg-boss/DB/輪詢/UI 整合）＝整合層，依 AC8 不入 node（型別+build 驗證 + W-1-3-1 docker smoke）；AC10 → 靜態掃描 + 閘門全綠 + schema 未動。**LLM Compliance** — item3 ✅on-spec、1/2/4/5 ⏸1.4、6 N/A、7 ⏸1.7(seam)。**Deferred** — W-1-3-1（runtime 整合 smoke，P1）、W-1-3-2（影像移物件儲存，Phase-later）。

### Change Log

- 2026-05-20：Story 1.3 實作完成。新增 parsing schema/server(jobs,queue,budget)/hooks/ParseProgress + 3 Route Handlers + providers；CaptureFlow 串接上傳→輪詢；+zod@4.4.3 +@tanstack/react-query@5.100.10（供應鏈已查）。修 `client.ts` lazy（build 回歸）。閘門全綠（typecheck/lint/test 56+2/build），Status review。

### File List

> A=新增 M=改。本 story 改動。

- `src/features/parsing/schema.ts`（A：Zod 契約 + 純 validator/mapper）
- `src/features/parsing/schema.test.ts`（A：11 node 測）
- `src/features/parsing/server/budget.ts`（A：1.7 budget seam）
- `src/features/parsing/server/budget.test.ts`（A：1 node 測）
- `src/features/parsing/server/queue.ts`（A：pg-boss producer singleton，含 ParseJobPayload）
- `src/features/parsing/server/jobs.ts`（A：session/job/status Drizzle，沿用既有 schema）
- `src/app/api/splits/route.ts`（A：POST 建 session）
- `src/app/api/splits/[linkId]/parse-jobs/route.ts`（A：POST 多頁上傳+enqueue）
- `src/app/api/splits/[linkId]/parse-jobs/[jobId]/route.ts`（A：GET 狀態）
- `src/features/parsing/hooks/useParseJobPolling.ts`（A：TanStack 輪詢，終態停+閒置退避）
- `src/features/parsing/components/ParseProgress.tsx`（A：五狀態三重編碼 UI）
- `src/app/providers.tsx`（A：QueryClientProvider）
- `src/app/layout.tsx`（M：掛載 Providers）
- `src/features/parsing/components/CaptureFlow.tsx`（M：ready→上傳→parsing；新增 uploading/parsing/uploadError phase）
- `src/lib/db/client.ts`（M：lazy 化修 next build 回歸；export 面/契約不變）
- `package.json`（M：+zod@4.4.3 +@tanstack/react-query@5.100.10）
- `_bmad-output/implementation-artifacts/{1-3-...md,sprint-status.yaml,deferred-work.md}`（M）

## Review Findings（code review 2026-05-20，**full 模式**，commit 4266b90，4 hunters）

> Blind / Edge Case / Acceptance Auditor / **LLM Compliance**（1-3 LLM-boundary）。
> LLM Compliance = **CLEAN**（zero findings：producer-only、item3 on-spec、
> 1/2/4/5⏸1.4 無提前 LLM/無繞過、7 budget seam called pre-enqueue）。
> Acceptance Auditor = 無 AC/scope 違規（2 LOW 已路由 W-1-3-1）。9 patch 已自主修復、閘門綠。

- [x] [Patch][High] pg-boss 單例：`boss.start()` 失敗會永久毒化快取 promise → 失敗時 reset `bossPromise=null` 可重試；`createQueue` 非 silent（log）。
- [x] [Patch][High] enqueue 失敗後 `markJobFailed().catch(()=>{})` 全靜默 → 改 log（非 silent）；並加輪詢硬上限作 backstop。
- [x] [Patch][High] 上傳無大小上限 → 讀入前以 `file.size` 擋 0-byte（400）與 >8MB/檔（413），有界記憶體。
- [x] [Patch][Med] `pageCount` 解析一次成驗證後整數，驗證與 payload 同源（無 coercion drift）。
- [x] [Patch][Med] submit 前 `sessionExists(linkId)` → 不存在回 404（非 FK→502、不產生孤兒 job）。
- [x] [Patch][Med] CaptureFlow `uploadAndParse` 重入守衛（非 ready/uploadError 即 return）；uploadError 保留 `linkId`，retry 重用同 session（不再產生孤兒 session）。
- [x] [Patch][Med] 輪詢硬上限 `MAX_POLL_MS=180s`（effect-timer + key 派生，render 純；React Compiler 合規）→ 逾時友善終態+重試（NFR-R2 永不卡死；亦解「1.4 消費者未存在時永遠 queued」UX）。
- [x] [Patch][Low] lazy db Proxy 非 thenable（`then`→undefined，不誤觸 init / 不被當 promise）。
- [x] [Patch][Low] status route 對未知 free-text status 先 log（telemetry）再 fail-closed。
- [By-design/defer] 廣義 authz/ownership（開放寫入端點）＝**鎖定排序使然**：不可猜連結＝Story 3.1（本 story randomUUID placeholder，未 pre-empt），device-token authz＝Epic 4；非 1.3 缺陷（Acceptance Auditor 確認無 scope 違規）。已加 sessionExists 404 縮小面。
- [Defer] 影像 base64 入 pg-boss payload 明文/保留 → 30 天銷毀＝Story 6.1、規模化移物件儲存＝`W-1-3-2`（已登記）。AC1 p95<1s 實機量測＝`W-1-3-1`（已登記）。
- [Dismiss×~7] lazy init 競態（init 同步、JS 單緒，無 await→無 check-then-act，誤報）；worker 不存在＝by-design（1.4；輪詢上限已處理 UX）；getJobStatus 走 PK 非該 index（PK O(1) 更優，AC 文字不精確）；markJobFailed updatedAt vs createQueuedJob（schema 有 defaultNow，update 正確 bump，無 bug）；Promise.all 批次/Providers retry 調校（可接受預設）；idempotency-key（過度工程，client 守衛+session 重用已足）。
- 驗證：typecheck/lint(0/0)/test(5 files 56 pass+2 todo,0 回歸)/build(3 ƒ Dynamic) 全綠；AC5 影像零 log；React Compiler 規則合規（render 純、effect 無同步 setState）。Status review→done。

### Change Log（appended）

- 2026-05-20：code review（full，4 hunters；LLM-Compliance clean）→ 9 patch 自主修復（pg-boss 韌性 / 不靜默 / 大小上限 / pageCount 同源 / session 404 / 重入守衛+session 重用 / 輪詢硬上限 / proxy 非 thenable / status telemetry）。閘門綠，Status review→done。
