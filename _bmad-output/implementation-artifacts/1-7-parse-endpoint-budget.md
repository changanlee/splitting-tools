# Story 1.7: 解析端點濫用/預算防護（FR46 / NFR-S7 / NFR-L5）

Status: review

## ⚠️ Dev 鐵則（最高優先）

1. **以 PAGE COUNT 計**（CIP fold-in），非每 parse 1。`rate_counters` 已存在於 1.1 scaffold（key/window_start/count）——**零 migration**。
2. **單一 Postgres，零 Redis**（架構 L244-247，stage-0 playbook）。`rate_counters` 同表/同 connection 與 LLM cost（NFR-L3）共用。
3. **位置**：純決策邏輯 `src/lib/rateLimit.ts`（純函式可 node 測：給定 (current count, window_start, now, pages, limit) → allow/deny + new_count/window_start）；DB upsert/讀取膠合 `src/lib/rateLimit.server.ts`（IO 不入 node 測，型別 + W 整合驗證）；套用 at `POST /api/splits/[linkId]/parse-jobs` **最前**（任何 validate/createJob 之前）。
4. **不碰**：visionAdapter（唯一 Claude 邊界）、既有 4 表/migration（rate_counters 已在 0000）、receipt_lines（1.5）、structureGuard（1.6）、1.4 cost recording。**零新增 npm 相依**。
5. **誠實**：429 訊息友善（NFR-R1，無 raw 系統細節）；fail-CLOSED on DB blip 即「DB 出錯則放行不阻擋」**OR** 「DB 出錯則阻擋」需 spec 拍板——v1 採 **fail-OPEN**（DB 短暫故障時不阻擋付款人是正體驗，grief 防線次要；對應 NFR-R2/NFR-P1 不卡死取捨），記入 deferred-work 為已知取捨。**不偽綠**：實彈渗透/競態 race 測試需部署環境，本 story 只證決策邏輯純函式 + 端點整合型別/build。
6. **不越界**：本 story 只做頁數預算 + 429。OUT：token-bucket 級 NFR-L5「LLM 呼叫邊界 token 預算」由 visionAdapter 既有 cost 計數隱含（1.4 已 ship `llm_costs` 持久化）；finer-grained per-minute/burst rate limiting → 規模化階段（>1k DAU，stage 表）；CAPTCHA / WAF → 雲端基礎設施階段。

## Story

As a 系統，
I want 對開放解析端點施加 per-session 與 per-IP 的每日頁數預算上限，
so that 免註冊開放連結不被機器人/惡意者濫用、不被一個 grief 帳號吃光 LLM 預算（FR46、NFR-S7、NFR-L5）。

## Acceptance Criteria

> 來源：`epics.md#Story 1.7`（GWT 逐字）＋ `prd.md` FR46/NFR-S7/NFR-L5/L3 ＋ `architecture.md` L244-247（rate_counters 同 Postgres、免 Redis）＋ L607/L680（`lib/rateLimit` 套於 parse 端點）＋ CIP fold-in（pages 計）。

1. **AC1（純決策邏輯）** `src/lib/rateLimit.ts`：`decideRateLimit(current: {count, windowStart} | null, now: Date, pages: number, limit: number, windowMs: number): { allow: boolean; newCount: number; newWindowStart: Date; retryAfterMs?: number }`——純函式無 IO。`current==null` 或 `now - windowStart >= windowMs` → 重置窗（newWindowStart=now，newCount=pages）；否則 newCount = count + pages。若 **重置或繼承後** newCount > limit → `allow:false` + `retryAfterMs = windowMs - (now - newWindowStart)`；否則 `allow:true`。整數安全、決定性、無 randomness、無 float。
2. **AC2（per-session ＋ per-IP 雙鑰）** 端點檢查兩條獨立計數鍵：`session:<linkId>`、`ip:<sha256(ip)>`（架構 L259 隱私哈希；不存原始 IP）。**任一**逾限 → 拒絕（429）；通過 → **兩鑰皆累加**該次 page 數。預設上限（spec 拍板，可調）：per-session-day = **40 頁/24h**（≈ 8 個 5 頁 parse／40 單頁；個人正常用 << 上限）、per-IP-day = **200 頁/24h**（容忍 NAT/公司網路 ~多 session 累加）；windowMs = 86_400_000。預設常數匯出便於測試與調校。
3. **AC3（端點接線 — 1.3 submit 路由）** `POST /api/splits/[linkId]/parse-jobs` handler 入口：取得 IP（`req.headers.get('x-forwarded-for')` 首跳 trim；v1 假設單層代理；無 XFF fallback 至 `cf-connecting-ip`/連線 remote）→ `sha256` → 構鑰；用 `pageCount`（既有 `validateParseSubmit` 已校驗 1..MAX_PARSE_PAGES）；在 `validateParseSubmit` 通過後、`createSession`/`createQueuedJob` 之前 atomically `checkAndIncrement`（DB upsert）；逾限 → 回 `429`＋`ErrorEnvelope`（friendly 繁中：「請求次數過多，請稍後再試。」），含 `Retry-After`（秒）header；通過 → 續既有流程。
4. **AC4（DB upsert／atomic 計數）** `src/lib/rateLimit.server.ts` 之 `checkAndIncrementRate(key, pages, limit, windowMs)`：以單一 SQL `INSERT ... ON CONFLICT (key) DO UPDATE` upsert，於 UPDATE 之 SET 內以 `CASE WHEN window_start < NOW() - INTERVAL` 決定 reset vs 累加；`RETURNING count, window_start` 後與 limit 比；逾限**回傳 deny**且**已將計數累加**（fail-conservative：邊界 burst 仍計入，下一窗會更快 reset；簡化原子性，stage-0 grief 防線足夠）。Drizzle ORM SQL builder 或 `sql\`\``raw template；不新增 client/相依。
5. **AC5（429 友善輸出 + Retry-After）** 逾限回應：`status 429`、`headers: { 'Retry-After': '<秒>' }`、body `{ error: { code: 'rate_limited', message: '請求次數過多，請稍後再試。' } }`（沿用 `ErrorEnvelopeSchema`）。**不**洩漏 limit/current count/原 IP 細節（NFR-R1/隱私）。
6. **AC6（fail-OPEN on DB blip — 已知 v1 取捨）** `checkAndIncrementRate` 拋錯 → catch 並 `console.error` + **放行**（NFR-R2 不卡死正常付款人優先；grief 防線次要；登 deferred-work W-1-7-1 為「v1 取捨：DB 故障時 rate-limit fail-open，是否反轉為 fail-closed 留待 stage>=1 評估」）。預期極罕見（單 Postgres、上一句 query 才成功）。
7. **AC7（既有測試零回歸 + 新具名測 + 端點型別綠）** `pnpm test`：`rateLimit.test.ts` node 具名測——重置窗（current==null / 過期）/ 繼承窗 / 邊界（剛好 == limit / +1 over）/ pages 多種值 / 多次累加單調 / 重置後計數正確 / retryAfterMs 計算正確；舊 9 file 82+ 全綠零回歸；`pnpm lint && typecheck && build` 全綠；新增 route handler 邏輯透過 build 驗證（單一 Postgres，DB 真實 race / 高併發競態 → W-defer，部署後驗證）。
8. **AC8（邊界鐵則）** 不碰 `src/lib/llm/**`（visionAdapter 唯一 Claude 邊界）；不改 `src/db/schema.ts`（rate_counters 已在 1.1 0000 migration，零 migration）；不改 1.5 IRC / 1.6 structureGuard / receipt_lines；不擴 `friendlyJobMessage` / `parseJobs` 表；**零新增 npm 相依**；rate-limit 邏輯純函式、不發網路、不呼 LLM。

## Tasks / Subtasks

- [x] **Task 0：前置** — 讀 epics 1.7、prd FR46/NFR-S7/NFR-L5、arch L244-247/L259（IP 哈希隱私）/L562/L607/L680、`src/db/schema.ts`（rate_counters 既有：key/window_start/count）、`src/app/api/splits/[linkId]/parse-jobs/route.ts`（1.3 owner，要插的接點）、`src/features/parsing/schema.ts`（`validateParseSubmit`/`MAX_PARSE_PAGES`/`ErrorEnvelopeSchema`）。
- [x] **Task 1：純決策邏輯（AC1, AC7）** — `src/lib/rateLimit.ts`：`decideRateLimit` 純函式；匯出預設常數 `PER_SESSION_DAILY_PAGES=40`、`PER_IP_DAILY_PAGES=200`、`RATE_WINDOW_MS=86_400_000`；`rateLimit.test.ts` 具名 node 測。
- [x] **Task 2：DB upsert 膠合（AC4）** — `src/lib/rateLimit.server.ts`：`checkAndIncrementRate(key, pages, limit, windowMs)` 用 drizzle sql template 做單一 UPSERT + CASE WHEN reset；`sha256IpKey(ip)` helper。glue，不入 node 測（型別 + W 驗證）。
- [x] **Task 3：端點接線（AC2, AC3, AC5, AC6）** — `POST /api/splits/[linkId]/parse-jobs`：在 `validateParseSubmit` 通過後、`createQueuedJob` 之前：併行 `Promise.all([checkSession, checkIp])`；任一 deny → 429 + Retry-After；通過 → 續流程。DB blip catch → log + 放行（AC6）。429 走 ErrorEnvelope。`X-Forwarded-For` 解析 helper（首跳 trim）。
- [x] **Task 4：誠實 + W-defer 登記（AC6, AC7）** — `deferred-work.md` 新增 W-1-7-1（fail-open v1 取捨）+ W-1-7-2（部署後實彈高併發 race / per-minute burst tuning gated 真實 traffic）；regression anchor 不動；不偽綠。
- [x] **Task 5：驗收自查（AC7, AC8）** — `pnpm typecheck`(0)/`lint`(0)/`test`（既有零回歸 + 新 rateLimit 純函式具名測）/`build`(綠)；靜態掃描：`src/lib/llm/**` 零改動、`src/db/schema.ts` 零改動（無 migration）、零新增 npm、rate-limit 純邏輯。記 Completion Notes 貼閘門證據。

## Dev Notes

### Defaults（spec 拍板，可調）

- `PER_SESSION_DAILY_PAGES = 40`：個人正常用一天通常 1-2 parses × 1-3 頁 << 40；防同 link 被 grief 重灌；MAX_PARSE_PAGES=5 → 8 次 parse 即觸頂（充足）。
- `PER_IP_DAILY_PAGES = 200`：容忍 NAT/公司網路多 session 累加；5 session × 40 頁 = 200；同一 IP 機器人 grief 超此即擋。
- `RATE_WINDOW_MS = 86_400_000`：24h 滾動窗（windowStart 起算）。簡單可預測。
- 全為**可調匯出常數**；W-1-7-2 部署後依真實 traffic tune。

### rate_counters Schema（既有，不改）

```ts
// src/db/schema.ts L107（1.1 既有，零 migration）
export const rateCounters = pgTable("rate_counters", {
  key: text("key").primaryKey(),
  windowStart: timestamp("window_start", { withTimezone: true }).notNull(),
  count: integer("count").notNull().default(0),
});
```

### IP 哈希（隱私 NFR-S3）

`sha256IpKey(ip)`：`crypto.createHash('sha256').update(ip).digest('hex').slice(0, 32)` → `"ip:<hex>"`。**不存原始 IP**。XFF 解析：`xff.split(',')[0].trim()`；fallback `cf-connecting-ip` 或 `x-real-ip`；皆無時 key="ip:unknown"（單一 bucket，安全降級）。

### Previous Story Intelligence

- **1.3 owner submit route**：`POST /api/splits/[linkId]/parse-jobs`，已有 `validateParseSubmit`/`sessionExists`/`createQueuedJob`/pg-boss enqueue 流程。1.7 在 `validateParseSubmit` 通過後 + DB ops 之前插 rate check。
- **1.4 cost 計數**：`llm_costs` 同 Postgres（架構 L246-247 同表共用）；1.7 是**前置**頁數預算（pre-LLM），1.4 是**後置**成本紀錄（per-call usd）。職責不重疊。
- **NFR-R2 終態守衛 / friendly message 慣例**：1.4/1.5/1.6 沿用——429 路徑亦走 ErrorEnvelope，不洩 raw。lazy db client（1.3）正常使用。
- **慣例**：純邏輯 node 測；IO/race W-defer；Conventional Commits；每 story commit；deferred 非 silent；零新增 npm（drizzle/zod/crypto 全內建）。

### Git Intelligence

近期鏈（`6ea741a`→`dce6d8c`→`652e28d`）：1.6 dev→閘門→code-review（CRITICAL fail-open 已修）→done。本 story 沿用：dev→閘門→code-review **full（1.7 非 LLM-boundary——純規則 + DB upsert——故 3 hunters，LLM-Compliance 自動跳過）**→commit。

### Project Structure Notes

- 新增：`src/lib/rateLimit.ts`（純）/`rateLimit.test.ts`/`src/lib/rateLimit.server.ts`（glue）。
- 更新：`src/app/api/splits/[linkId]/parse-jobs/route.ts`（1.3 submit 端點，插 rate check）。
- 不動：`src/lib/llm/**`、`src/db/schema.ts`、`drizzle/migrations/*`、1.5/1.6 features、`regression-invariants.test.ts`。

### References

- [Source: epics.md#Story 1.7 L409-422（GWT、FR46/NFR-S7/NFR-L5、CIP pages 計）]
- [Source: prd.md FR46 L411、NFR-S7 L433、NFR-L5 L456]
- [Source: architecture.md L45（FR46 anchor）、L244-247（Postgres 計數同表免 Redis）、L259（IP 哈希）、L562（rateLimit 位置）、L607/L680（套於 parse 端點）]
- [Source: src/db/schema.ts L107（rate_counters 既有）；src/features/parsing/schema.ts（validateParseSubmit/MAX_PARSE_PAGES/ErrorEnvelope）；src/app/api/splits/[linkId]/parse-jobs/route.ts（1.3 owner）]
- [Source: 1-3/1-4/1-5/1-6 stories（pattern：pure node-test + IO glue + W-defer + per-story commit）]

## Dev Agent Record

### Agent Model Used

claude-opus-4-7[1m]

### Debug Log References

- 1.3 既有 `src/features/parsing/server/budget.ts` 預留 seam（default-pass `(sessionId): sync`）正是 1.7 的 hand-off 點：簽名升級為 `(args): Promise<...>` + `ipKey`/`pages`/`retryAfterSeconds`，路由 lockstep 更新。
- DB upsert 採單一 `INSERT ... ON CONFLICT (key) DO UPDATE` + `CASE WHEN window_start < NOW() - INTERVAL` 一次往返完成「重置 vs 累加」，避免 read-modify-write 競態；burst 邊界容許微量超計（fail-conservative，v1 grief-shield 可接受、W-1-7-2 部署後 tune）。
- 1.3 既有 `budget.test.ts` 為 default-pass placeholder——更新為「DB outage → fail-OPEN ok:true（v1 W-1-7-1 取捨）」測試（無 DATABASE_URL 下 db proxy 拋錯，catch 走 fail-open），實際行為而非 mock。

### Completion Notes List

- **Task 1（AC1/AC7）**：`src/lib/rateLimit.ts` 純 `decideRateLimit(current, now, pages, limit, windowMs): RateDecision`，零 IO/零 float/整數安全；匯出可調常數 `PER_SESSION_DAILY_PAGES=40`、`PER_IP_DAILY_PAGES=200`、`RATE_WINDOW_MS=86_400_000`。`rateLimit.test.ts` 11 具名 node 測：null 重置、過期重置（含正好 == windowMs 邊界）、繼承累加、邊界 == limit allow / +1 deny、deny 後計數仍前進（fail-conservative）、retryAfterMs 非負且 ≤ windowMs、pages 非正/NaN 防禦性 no-op（永不變成 free pass）、defaults 合理性。
- **Task 2（AC4）**：`src/lib/rateLimit.server.ts` 之 `checkAndIncrementRate` 用 `drizzle-orm/sql` 模板做 atomic UPSERT + CASE-WHEN reset，`RETURNING count, window_start, elapsed_ms`；驗算 limit 後回 `{allow, retryAfterMs}`。`sha256IpKey(ip)` 32-hex 截斷（NFR-S3 隱私，**不存原始 IP**）；`extractClientIp(headers)` XFF 首跳 → cf-connecting-ip → x-real-ip → "unknown" 安全降級。
- **Task 3（AC2/AC3/AC5/AC6）**：`src/features/parsing/server/budget.ts` 升級為 1.7 真實實作（簽名變更）——`checkParseBudget({sessionId, ipKey, pages})` 並行 `Promise.all` 雙鑰 check，任一 deny → 429 友善訊息（NFR-R1，不洩 limit/IP/原 raw）+ `retryAfterSeconds`（取兩鑰較大者，避免客戶端立即觸到另一頂）；try/catch 包覆**fail-OPEN**（W-1-7-1，記 console.error 不靜默）。路由 `POST /api/splits/[linkId]/parse-jobs` lockstep 改 async + `extractClientIp(request.headers)` → `sha256IpKey` → `checkParseBudget`，deny 走 429 + `Retry-After: <秒>` header（沿用 ErrorEnvelope）。位置：`validateParseSubmit` + 檔案 size guard 通過後、`sessionExists`/`createQueuedJob` 之前（最前可能位置）。
- **Task 4（AC6/AC7 誠實）**：`deferred-work.md` 新增 W-1-7-1（fail-OPEN v1 取捨非靜默）+ W-1-7-2（部署後依真實 traffic tune defaults + per-minute burst / 高併發 race）；regression `it.todo` anchor 零改、不偽綠；無真實渗透/實彈 race 結果宣稱（W-1-7-2 gated）。
- **Task 5（AC7/AC8）閘門證據**：`pnpm typecheck` 0；`pnpm lint` 0；`pnpm test` 10 files / **107 passed | 2 todo**（既有 96 零回歸 + 1.7 新 11 純函式 + 1 fail-OPEN 行為 = 12，扣掉舊 budget seam 預設 pass 1 = 淨 +11）；`pnpm build` 綠 5 routes。靜態掃描：`src/lib/llm/**` 零改動（visionAdapter 不繞過）、`src/db/schema.ts` + `drizzle/migrations/*` 零改動（**無 migration**，`rate_counters` 已在 1.1 0000）、`package.json`/`pnpm-lock.yaml` 零 diff（**零新增 npm 相依**，僅用既有 drizzle/zod/node:crypto）、rate-limit 純邏輯位於 `src/lib/`，端點接線位於 1.3 既有 route。

### Change Log

- 2026-05-20 — Story 1.7 dev-story 完成（Task 0-5）。新增純 rate-limit 決策邏輯（PER_SESSION_DAILY_PAGES=40、PER_IP_DAILY_PAGES=200、24h 窗）+ 原子 DB upsert glue + IP 哈希（NFR-S3 隱私）+ 1.3 seam 升級為真 enforcement + 429 + Retry-After。fail-OPEN v1 取捨明列 W-1-7-1（非靜默）。零 migration / 零新 npm / visionAdapter 零改動 / regression anchor 不動。閘門全綠（typecheck/lint/test 107pass2todo/build）。Status → review。

### File List

- NEW `src/lib/rateLimit.ts` — 純決策邏輯 + 可調常數（PER_SESSION_DAILY_PAGES/PER_IP_DAILY_PAGES/RATE_WINDOW_MS）
- NEW `src/lib/rateLimit.test.ts` — 11 具名 node 測（重置/累加/邊界/防禦性/defaults）
- NEW `src/lib/rateLimit.server.ts` — atomic UPSERT glue + sha256IpKey + extractClientIp
- MODIFIED `src/features/parsing/server/budget.ts` — seam 升級為真 1.7 實作（async 雙鑰 + fail-OPEN W-1-7-1）
- MODIFIED `src/features/parsing/server/budget.test.ts` — 從 default-pass placeholder 改為「DB outage → fail-OPEN」行為斷言
- MODIFIED `src/app/api/splits/[linkId]/parse-jobs/route.ts` — lockstep 接 new seam + IP 抽取/哈希 + 429 + Retry-After header
