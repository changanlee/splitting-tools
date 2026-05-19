# Story 1.1: 專案骨架與 CI 基線

Status: in-progress

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a 開發者（n=1 單人），
I want 依架構 starter 指令建立可運行的 Next.js 16 骨架、Docker Compose、Drizzle 最小 schema 與 GitHub Actions CI 基線，
so that Epic 1–6 後續所有能力 story 有一致、可驗證、不需返工的實作基底（greenfield 起手）。

## Acceptance Criteria

1. **AC1（骨架）** Given 空 repo，When 執行架構指定 starter 指令，Then 專案以 Next.js 16 App Router + TypeScript 建立、`tsconfig.json` 設 `"strict": true`、Tailwind + ESLint + Turbopack + `src/` + `@/*` alias 就緒、`pnpm dev` 可啟動。
2. **AC2（shadcn/ui）** Given 骨架已建，When 初始化 shadcn/ui（Tailwind v4），Then 元件目錄為 `src/components/ui/`、`components.json` 存在、可成功 `add` 一個樣板元件（如 `button`）驗證管線通。
3. **AC3（Docker Compose）** Given repo 根，When `docker compose up`，Then `web`（Next standalone）/`db`（PostgreSQL）/`worker`（pg-boss 消費者進入點）三服務啟動且 `web` 可連 `db`。
4. **AC4（Drizzle 最小 schema）** Given Postgres 可連，When 執行 Drizzle migrate，Then 建立**且僅建立**最小 4 表 `sessions`、`parse_jobs`、`llm_costs`、`rate_counters`（snake_case、金額欄 `_cents` 整數、時間 `timestamptz`）；不前載 receipt_lines/claims/claim_changes（後續 story 依需 ALTER/ADD）。
5. **AC5（G2 初始化序）** Given Drizzle 與 pg-boss 同一 Postgres，When 服務啟動，Then 初始化順序為 **Drizzle migrate → 再 pg-boss start**；pg-boss 自建 schema/表**不**納入 `src/db/schema.ts` 或 Drizzle migration（避免遷移衝突）。
6. **AC6（CI 雙不變量 harness）** Given push 觸發 GitHub Actions，When CI 跑，Then 執行 `pnpm lint` + `pnpm typecheck` + 測試 harness，且 harness 含**佔位但會執行**的兩個斷言 `parsed_sum == 2208.50`（標記 `todo`/`skip` 並附 #5564 fixture 佔位）與 `settlement_sum == parsed_sum`；任一步驟失敗 → CI 紅燈阻擋（exit ≠ 0）。
7. **AC7（Sentry）** Given 環境變數 `SENTRY_DSN` 提供，When 應用啟動，Then Sentry 已接線（client+server）且未設 DSN 時不崩（優雅略過）。
8. **AC8（機密不入版控）** Given repo，Then `.env.example` 列出 `DATABASE_URL`、`ANTHROPIC_API_KEY`、`SENTRY_DSN`、`LINK_ID_BYTES=16`、`PARSE_BUDGET_*`；`.gitignore` 排除 `.env*`（保留 `.env.example`）。

## Tasks / Subtasks

- [x] **Task 1：scaffold（AC1）**
  - [x] 於 repo 根執行：`pnpm create next-app@latest splitting-tools --ts --tailwind --eslint --app --turbopack --src-dir --use-pnpm --import-alias "@/*"`（生成於 `splitting-tools/` 暫存子目錄後 rsync 上移至 repo 根、移除暫存與 nested `.git`，保留既有 `_bmad*`/`docs`/`.claude`；`--no-git` + repo 根自行 `git init`）
  - [x] 確認 `tsconfig.json` `"strict": true`（非協商，全域標準）— 已驗證
  - [x] 加 `package.json` scripts：`typecheck`(`tsc --noEmit`)、`test`(`vitest run`)、`worker`、`db:generate`、`db:migrate`
- [x] **Task 2：shadcn/ui（AC2）**
  - [x] `pnpm dlx shadcn@latest init --base radix --preset nova --template next`（Tailwind v4 自動偵測，`src/components/ui/`）— 預設 preset 會裝 `@base-ui/react`，**已對齊 ux-design-specification SSOT（明列 Radix 原語＝NFR-A1）改用 `--base radix`**，移除 orphan `@base-ui/react`
  - [x] `pnpm dlx shadcn@latest add button` 驗證管線通（registry 解析成功）；`components.json`（`style: radix-nova`）+ `src/components/ui/button.tsx`（`import { Slot } from "radix-ui"`）已建，typecheck 綠
- [x] **Task 3：目錄結構（AC1）** 已建 `src/app/`、`src/features/`、`src/lib/{db,llm,money}`、`src/db/`、`src/workers/`、`src/components/ui/`（空目錄 `.gitkeep` 佔位）；額外建 `src/lib/llm/visionAdapter.ts` 空殼（typed、throw NotImplemented、TODO 指向 architecture L433-459 + Story 1.4/1.7，cement 單一 LLM 邊界，無 LLM 邏輯＝scope guard）；typecheck 綠
- [x] **Task 4：Drizzle 最小 schema（AC4）**
  - [x] 安裝 `drizzle-orm@0.45.2` + `pg@8.21.0` + `drizzle-kit@0.31.10` + `@types/pg@8.20.0`（`pnpm view` 複核最新穩定）
  - [x] `drizzle.config.ts`（schema=`src/db/schema.ts`，out=`drizzle/migrations`，dialect postgresql）
  - [x] `src/db/schema.ts` 定義 4 表（sessions/parse_jobs/llm_costs/rate_counters）；`src/lib/db/client.ts`（pg Pool + drizzle，單 Postgres 邊界）
  - [x] `pnpm db:generate` 產 `0000_futuristic_bloodscream.sql` — 驗證 SQL 與 DDL 規格逐欄一致（timestamptz/整數分/numeric(10,6)/bigserial/`idx_*`/FK），僅 4 表、無 pg-boss 表（G2）
- [x] **Task 5：Docker Compose + pg-boss 進入點（AC3, AC5）**
  - [x] `Dockerfile`（web，Next standalone：`next.config.ts` 加 `output:'standalone'`，multi-stage）、`Dockerfile.worker`（tsx 跑 worker）、`.dockerignore`
  - [x] `docker-compose.yml`：`db`(postgres:16，pg_isready healthcheck)、`web`(depends_on db service_healthy)、`worker`(depends_on db service_healthy)；`docker compose config` 驗證通、3 services
  - [x] `src/workers/index.ts`：等 DB（retry）→ Drizzle migrate → `new PgBoss(connectionString).start()`；G2 註解明標 pg-boss 表自建不入 Drizzle；安裝 `pg-boss@12.18.2`(v3+，內建 jittered 退避＝NFR-L1 基礎) + `tsx@4.22.2`
  - [x] **實證**：對拋棄式 postgres:16 跑 `pnpm worker`，log 依序 `database reachable → drizzle migrate complete → pg-boss started`；DB 查證 public=4 Drizzle 表、`pgboss` 獨立 schema 8 表、migration SQL 0 個 pgboss 字串（G2 無衝突）
- [x] **Task 6：CI 雙不變量 harness（AC6）**
  - [x] 測試框架 = `vitest@4.1.6`（node env，輕量 n=1）；`vitest.config.ts`（`@`→`src` alias 對齊 tsconfig）
  - [x] `src/features/parsing/__fixtures__/`：`receipt-5564.placeholder.ts`（anchor 220850 分＝NT$2208.50）+ `README.md`（明記真實收據+3-5 變體於 Story 1.4/1.5、settle 於 5.1 填，勿改不變量 test id）
  - [x] `src/features/parsing/__tests__/regression-invariants.test.ts`：兩不變量對 placeholder anchor **執行且綠**（`parsed_sum==2208.50` 整數分編碼、`settlement_sum==parsed_sum` 恆等）+ 兩 `it.todo` carry-forward 標記指名 Story 1.4/1.5（真 fixture）與 5.1（FR50 settle）
  - [x] `.github/workflows/ci.yml`：checkout → pnpm/setup-node → `install --frozen-lockfile` → `lint` → `typecheck` → `test`，fail-fast；**實證** 本機鏈 lint/typecheck/test 皆 exit 0，故意失敗測試使 `vitest` exit 1（CI 紅燈阻擋成立）
- [x] **Task 7：Sentry（AC7）** `@sentry/nextjs@10.53.1`（peer 支援 next ^16）：`sentry.server.config.ts` + `sentry.edge.config.ts` + `src/instrumentation.ts`（register + onRequestError）+ `src/instrumentation-client.ts`（onRouterTransitionStart）+ `next.config.ts` `withSentryConfig`（silent、無 auth 不上傳 sourcemap 不崩）；每處 init 以 `SENTRY_DSN` 顯式 guard → **實證** `pnpm build` 無 DSN 成功（優雅略過、產出 `.next/standalone/server.js`）、typecheck/lint 綠
- [x] **Task 8：env 與機密（AC8）** `.env.example`（DATABASE_URL/ANTHROPIC_API_KEY/SENTRY_DSN/LINK_ID_BYTES=16/PARSE_BUDGET_MAX_USD_PER_DAY+MAX_CALLS_PER_SESSION+WINDOW_SECONDS，後二為 Story 1.7 placeholder）；`.gitignore` 加 `!.env.example` 例外 → **實證** `git check-ignore`：`.env`/`.env.local` IGNORED、`.env.example` NOT-ignored，5 鍵齊備
- [~] **Task 9：驗收自查（部分完成，compose-up 執行驗證延後）**
  - [x] `pnpm lint && pnpm typecheck && pnpm test` 本機全綠（多次實證）
  - [x] worker 進入點 + G2 初始化序對真 Postgres 實證綠（Task 5）；`pnpm build` standalone 實證綠（Task 7）；`docker compose config` 結構驗證通、3 services
  - [ ] `docker compose up` 三服務 runtime 起 — **延後**：in-container `pnpm install --frozen-lockfile` 被環境 `minimumReleaseAge` 供應鏈政策擋下（`@unrs/resolver-binding-*@1.12.0`，ESLint 工具鏈 `eslint-config-next`→`eslint-import-resolver-typescript` 之 dev-only transitive，2026-05-18 下午發布、落在約 24h cutoff 內）。**非骨架缺陷**；使用者決議「等政策窗口後重驗」。重驗指令：`WEB_PORT=3010 DB_PORT=55470 docker compose up -d --build`（窗口過後 lockfile 內該批 binding 即通過，Dockerfile 無需改動）
  - [ ] push 後 CI 綠 — **不適用本機**：repo 已 `git init` 但無 GitHub remote 且依「commit/push 僅在使用者要求時」未 push；CI workflow 已建、其完整序列（install→lint→typecheck→test）已本機等價實證綠、且故意失敗測試證實 exit≠0 紅燈。實際 GitHub Actions 綠燈需使用者加 remote + push 後生效

## Dev Notes

### 鎖定技術版本（本 session 2026-05 web 驗證，dev 啟動時以 `pnpm view <pkg> version` 複核）

- **Next.js 16.2.x**（App Router、Turbopack 預設、create-next-app 含 AGENTS.md）
- **Drizzle ORM 0.45** + drizzle-kit；**pg**（node-postgres）
- **pg-boss v3+**（Postgres-backed job queue，**內建 jittered 指數退避重試＝後續 NFR-L1 用**，本 story 僅起 worker 進入點不實作解析）
- **Zod v4**（本 story 不需，但 `src/lib` 後續契約源；可先裝）
- **@tanstack/react-query 5.100.x**（本 story 可先裝 provider 佔位，非必要）
- **shadcn/ui**（Tailwind v4 `@theme`，copy-in 至 `src/components/ui/`）
- **@sentry/nextjs**、**pnpm**（全域套件管理器）

### 架構強制 guardrails（不可偏離）

- 金額**一律整數「分」**、欄位 `_cents` 結尾、永不 float（金錢工具非協商；本 story 只建表，但 schema 即須遵循）。1 元 = 100 分。
- DB 表名 snake_case 複數、欄位 snake_case、外鍵 `<表單數>_id`、時間 `created_at/updated_at/expires_at` 用 `timestamptz`。
- 單一 monolith、單一 Postgres（同時承載 app 表 + pg-boss 佇列 + cost/rate 計數）；**不引入 Redis / microservices / websocket**（DAU<10k，stage-0 playbook）。
- 結構：`src/app`（路由+Route Handlers）、`src/features/<能力>`、`src/lib`（db/llm/money/id/apiEnvelope/rateLimit）、`src/db/schema.ts`、`src/workers`、`src/components/ui`（shadcn）。
- 🚫 **G2（架構 Important gap）**：pg-boss 執行時自建其 schema/表，**嚴禁**寫進 `src/db/schema.ts` 或 Drizzle migration；初始化序固定 **Drizzle migrate → pg-boss start**。程式碼註解須明標。
- CI 是部署門檻：本 story 建立的 `parsed_sum==2208.50` 與 `settlement_sum==parsed_sum` harness 是 Epic 1（Story 1.4/1.5）與 Epic 5（Story 5.1）的回歸契約，**佔位但管線必須真的會執行**，後續 story 只填 fixture/邏輯不重建管線。

### Drizzle DDL（本 story 建立的最小 4 表——明列以滿足 IR Minor remediation）

> 僅這 4 表。`receipt_lines`/`claims`/`claim_changes` 等由後續 story 依需 ALTER/ADD，**本 story 不得前載**。

- **`sessions`**：`id` text PK（分帳 session；連結 ID 由 Story 3.1 填生成邏輯，本 story 僅欄位）、`status` text not null default `'draft'`（draft/reconciled/shared/claiming/finalized）、`parsed_sum_cents` integer null、`printed_total_cents` integer null、`unverified` boolean not null default false、`created_at` timestamptz not null default now()、`updated_at` timestamptz not null default now()、`expires_at` timestamptz null（Story 6.1 用）
- **`parse_jobs`**：`id` text PK（app 端 job 識別，**非** pg-boss 內部 job——兩者分離）、`session_id` text not null refs sessions(id)、`status` text not null default `'queued'`（queued/processing/succeeded/failed/degraded）、`error` text null（友善訊息，不存原始 LLM 錯）、`created_at`/`updated_at` timestamptz not null default now()
- **`llm_costs`**：`id` bigserial PK、`session_id` text null refs sessions(id)、`request_id` text not null、`model` text not null、`prompt_tokens` integer not null default 0、`completion_tokens` integer not null default 0、`latency_ms` integer not null default 0、`cost_usd` numeric(10,6) not null default 0、`success` boolean not null、`created_at` timestamptz not null default now()（Story 1.4 NFR-L2/L3 per-session-day 聚合查此）
- **`rate_counters`**：`key` text PK（如 `session:<id>` / `ip:<sha256>`）、`window_start` timestamptz not null、`count` integer not null default 0（Story 1.7 FR46/NFR-S7/L5 預算判定）

索引：`parse_jobs(session_id)`、`llm_costs(session_id, created_at)`、命名 `idx_<表>_<欄>`。

### Project Structure Notes

- scaffold 產物需與既有 repo 共存：`_bmad/`、`_bmad-output/`、`docs/`、`.claude/` **不可被覆蓋/刪除**。dev 自行決定整合方式（建議：`create-next-app` 產於暫存或子目錄後，將應用檔合併至 repo 根，保留上述既有目錄）。
- 無前序 story（本為 Epic 1 Story 1.1，首個）；無既有程式碼需讀取（greenfield）。
- 本 story **不**實作任何 FR 能力（拍照/解析/認領皆後續），僅建可驗證基底；勿越界實作 Story 1.2+ 內容（scope creep 防止）。

### 非協商（Side Project 工程標準，從本 story 寫碼起生效）

LLM 邊界相關（retry/log/cost/降級/速率/job）本 story **不實作**但**基礎已備**：Postgres `llm_costs`/`rate_counters` 表、pg-boss worker 進入點、env `ANTHROPIC_API_KEY`。Story 1.3/1.4/1.7 才填邏輯，屆時不得繞過 `src/lib/llm/visionAdapter`（本 story 可建空殼檔 + TODO 註解指向架構規格）。

### References

- [Source: _bmad-output/planning-artifacts/epics.md#Epic-1 / Story 1.1]（AC 來源、內嵌 carry-forward）
- [Source: _bmad-output/planning-artifacts/architecture.md#Starter-Template-Evaluation]（starter 指令、旗標說明）
- [Source: _bmad-output/planning-artifacts/architecture.md#Core-Architectural-Decisions]（Drizzle/pg-boss/Zod/TanStack/Sentry/整數分/單 Postgres）
- [Source: _bmad-output/planning-artifacts/architecture.md#Project-Structure-&-Boundaries]（目錄結構、parse_jobs/llm_costs/rate_counters 表、workers）
- [Source: _bmad-output/planning-artifacts/architecture.md#Architecture-Validation-Results]（Gap G1=Story 5.2、Gap G2=本 story）
- [Source: _bmad-output/planning-artifacts/ux-design-specification.md#Design-System-Foundation]（shadcn/ui 初始化＝UX-DR1）
- [Source: _bmad-output/planning-artifacts/implementation-readiness-report-2026-05-19.md#Epic-Quality-Review]（Minor：本 story 須明列 Drizzle DDL——已於上方滿足）
- [Source: ~/.claude/CLAUDE.md Side Project 工程標準]（TS strict、pnpm、單 VPS+Compose+單 Postgres、無 Redis、機密不入版控）

## Dev Agent Record

### Agent Model Used

claude-opus-4-7[1m]（dev-story，2026-05-19）

### Debug Log References

- Task 1：`pnpm dev` 啟動時 port 3000 被他程占用，Next 自動改用 3001；首次 curl 撞上 `Compiling /` 編譯期回 000，編譯完成後 retry 回 200 — 已確認骨架伺服器本身正常（AC1）。
- Task 2：shadcn `--defaults` 預設 preset 裝 `@base-ui/react`；對齊 ux-design-specification SSOT（明列 Radix 原語＝NFR-A1）以 `--base radix --preset nova` 重 init 並移除 orphan `@base-ui/react`。互動 prompt 以 `yes |` 餵入。
- Task 5：pg-boss v12 為 named export（`import { PgBoss }`，非 default）；error event handler 顯式標 `(err: unknown)` 解 TS7006。
- Task 6：vitest 預設不讀 tsconfig `@/*` paths → `vitest.config.ts` 加 `resolve.alias` `@`→`src`。
- **Task 9（阻斷，已升級使用者決策）**：`docker compose up` 之 in-container `pnpm install --frozen-lockfile` 失敗——環境 `minimumReleaseAge` 供應鏈政策拒絕 `@unrs/resolver-binding-*@1.12.0`（`pnpm why` 證實僅經 `eslint-config-next@16.2.6`→`eslint-import-resolver-typescript@3.10.1` 的 dev-only transitive），2026-05-18 下午發布、落於約 24h cutoff 內。本機 install（lockfile 同政策下生成）與 `pnpm build` 皆綠，僅容器 frozen 重驗較嚴。使用者決議：等政策窗口過後原指令重驗，不改 Dockerfile。重試紀錄：2026-05-19T10:43 `docker compose build worker` 仍同錯（窗口未開，預估 binding 發布+24h ≈ 2026-05-19T~16:00 後通過）。

### Completion Notes List

- Ultimate context engine analysis completed - comprehensive developer guide created（create-story，2026-05-19）
- ✅ Task 1（AC1）：Next.js 16.2.6 App Router + TS `strict:true` + Tailwind v4 + ESLint + Turbopack + `src/` + `@/*` alias 骨架建立；於暫存子目錄生成後 rsync 上移合併至 repo 根，移除暫存與 nested `.git`，既有 `_bmad*`/`docs`/`.claude` 完整保留；repo 根 `git init`（未 commit/push）；`package.json` 加 `typecheck`/`test`/`worker`/`db:generate`/`db:migrate`；`pnpm typecheck` + `pnpm lint` 綠、`pnpm dev` 實測 HTTP 200。
- ✅ Task 2（AC2）：shadcn/ui init（Radix base + nova，對齊 UX SSOT）；`components.json`（style radix-nova）、`src/components/ui/button.tsx`（`radix-ui` Slot）、`src/lib/utils.ts`；`add button` 管線通；typecheck 綠。
- ✅ Task 3（AC1）：`src/{app,features,lib/{db,llm,money},db,workers,components/ui}` 骨架 + `.gitkeep`；`src/lib/llm/visionAdapter.ts` 空殼（throw NotImplemented、TODO→Story 1.4/1.7、cement 單一 LLM 邊界，無 LLM 邏輯）。
- ✅ Task 4（AC4）：drizzle-orm 0.45.2 / pg 8.21 / drizzle-kit 0.31.10；`src/db/schema.ts`（僅 sessions/parse_jobs/llm_costs/rate_counters）、`src/lib/db/client.ts`、`drizzle.config.ts`；`pnpm db:generate` 產 `0000_*.sql`，逐欄比對 DDL 規格一致（timestamptz/整數分/numeric(10,6)/bigserial/idx_*/FK），無 pg-boss 表（G2）。
- ✅ Task 5（AC3/AC5）：`Dockerfile`(web standalone)/`Dockerfile.worker`/`.dockerignore`/`docker-compose.yml`(db/web/worker, healthcheck)；`src/workers/index.ts` 等 DB→Drizzle migrate→pg-boss start；pg-boss@12.18.2（v3+，內建 jittered 退避＝NFR-L1 基礎）。**實證**：對拋棄式 postgres 跑 worker，log 依序、public=4 表、`pgboss` 獨立 schema 8 表、migration SQL 0 pgboss（G2 無衝突）。
- ✅ Task 6（AC6）：vitest 4.1.6；#5564 placeholder 與 README；雙不變量對 placeholder 執行且綠 + 兩 `it.todo` carry-forward（Story 1.4/1.5、5.1）；`.github/workflows/ci.yml`；**實證** 本機鏈全綠、故意失敗 → vitest exit 1（CI 紅燈成立）。
- ✅ Task 7（AC7）：@sentry/nextjs 10.53.1（server/edge/instrumentation/instrumentation-client + withSentryConfig）；`SENTRY_DSN` 顯式 guard；**實證** `pnpm build` 無 DSN 成功（優雅略過、產出 `.next/standalone/server.js`）。
- ✅ Task 8（AC8）：`.env.example`（5 鍵齊備）+ `.gitignore` `!.env.example`；**實證** `git check-ignore`：`.env`/`.env.local` IGNORED、`.env.example` 追蹤。
- ⏸️ Task 9（部分）：本機 `pnpm lint && typecheck && test` 全綠、worker+G2/`pnpm build`/`docker compose config` 皆實證；**唯 `docker compose up` runtime 因環境供應鏈政策延後**（見 Debug Log；使用者決議等窗口重驗，Dockerfile 無需改）。push-CI 不適用本機（無 remote、未 push）。
- **狀態：留 `in-progress`（非 review）**——8/9 task 全綠，Task 9 僅缺 compose-up runtime 一項外部阻斷待重驗；不謊報完成（verification-before-completion）。

### File List

> 最終清單（repo 全新 git init、尚未 commit；皆 untracked）。scaffold 大量檔案以目錄表示。A=新增 M=改。

設定/根檔：
- `package.json`（M：scripts + drizzle/pg/pg-boss/tsx/vitest/@sentry deps）
- `tsconfig.json`（A scaffold，strict:true）
- `next.config.ts`（M：`output:'standalone'` + `withSentryConfig`）
- `next-env.d.ts` / `eslint.config.mjs` / `postcss.config.mjs` / `pnpm-workspace.yaml` / `pnpm-lock.yaml`（A scaffold）
- `AGENTS.md` / `CLAUDE.md`（A scaffold；CLAUDE.md=`@AGENTS.md`，無 session-start，global 仍適用）
- `README.md` / `public/`（A scaffold）
- `components.json`（A shadcn，style radix-nova）
- `.gitignore`（M：加 `!.env.example`）／`.dockerignore`（A）／`.env.example`（A，5 鍵）
- `drizzle.config.ts`（A）／`vitest.config.ts`（A）
- `docker-compose.yml` / `Dockerfile` / `Dockerfile.worker`（A）
- `sentry.server.config.ts` / `sentry.edge.config.ts`（A）
- `.github/workflows/ci.yml`（A）

src/：
- `src/app/`（A scaffold：layout.tsx/page.tsx/globals.css[shadcn 改]/favicon.ico）
- `src/components/ui/button.tsx`（A shadcn，radix-ui）／`src/lib/utils.ts`（A shadcn）
- `src/lib/db/client.ts`（A）／`src/lib/llm/visionAdapter.ts`（A 空殼）
- `src/db/schema.ts`（A，4 表）
- `src/workers/index.ts`（A，G2 boot）
- `src/instrumentation.ts` / `src/instrumentation-client.ts`（A）
- `src/features/parsing/__fixtures__/README.md` + `receipt-5564.placeholder.ts`（A）
- `src/features/parsing/__tests__/regression-invariants.test.ts`（A）
- `src/features/.gitkeep` / `src/lib/money/.gitkeep`（A 佔位）

生成物：
- `drizzle/migrations/0000_futuristic_bloodscream.sql` + `meta/_journal.json` + `meta/0000_snapshot.json`（A，`pnpm db:generate`）
