---
stepsCompleted: ['step-01-init', 'step-02-context', 'step-03-starter', 'step-04-decisions', 'step-05-patterns', 'step-06-structure', 'step-07-validation', 'step-08-complete']
lastStep: 8
status: 'complete'
completedAt: '2026-05-18'
inputDocuments:
  - '_bmad-output/planning-artifacts/prd.md'
  - '_bmad-output/planning-artifacts/implementation-readiness-report-2026-05-18.md'
  - '_bmad-output/planning-artifacts/product-brief-splitting-tools.md'
  - '_bmad-output/planning-artifacts/product-brief-splitting-tools-distillate.md'
  - '_bmad-output/brainstorming/brainstorming-session-2026-05-17-1812.md'
workflowType: 'architecture'
project_name: 'splitting_tools'
user_name: '長安'
date: '2026-05-18'
---

# Architecture Decision Document — splitting_tools（Costco 分帳小工具）

_This document builds collaboratively through step-by-step discovery. Sections are appended as we work through each architectural decision together._

## Project Context Analysis

### Requirements Overview

**Functional Requirements（50 條 / 9 區，能力契約）:**
解析管線（FR1–7）：拍照→前端壓縮→async job→單次視覺 LLM→縮寫還原→
IRC 折扣配對母品項→非 #5564 結構硬拒。架構含意：需 job 表 + 背景 worker +
輪詢端點；視覺 LLM 為唯一外部相依，須以 LLM-Ops adapter 包裹。
核對閘門（FR8–16）：parsed_sum vs 印製總額比對、可疑行啟發式標示、
逐行/增刪編輯、IRC 改綁、手動輸入總額、N 次後未驗證強制放行、
未驗證標示向下游傳播——核心不變量「永不卡死付款人」。
連結與分享（FR17–19）：核對後產生 ≥128bit 不可猜 ID（NFR-S1）+ 訊息卡。
身份與存取（FR20–25）：免註冊；device-token 綁身份（localStorage）；
「是不是你」名單；token-scope 授權（NFR-S2）；同團名字本機記憶。
認領與分攤（FR26–34）：逐行認領/取消、單品項多人加權份額、即時小計、
undo、PENDING、伺服器權威解競態、付款人可見變更紀錄。
認領狀態看板（FR47–49）：參與者/各品項認領者/PENDING；v1 輪詢讀模型。
結算與結束（FR35–42, FR50）：每人=自己認領各行金額之和；
🔴 FR50 VAT 內含每行→含稅直接加總，須接 FR35 結算計算 + 對齊 FR6 IRC
淨價（架構必明確定義此計算模型，PRD 唯一弱點 carry-forward）；
信任標示、純文字匯出、付款人顯式吸收閘門、定案凍結唯讀、遲到者降級。
資料生命週期與隱私（FR43–45）：上傳前遮卡號、30 天到期可驗證銷毀、
全站 noindex/nofollow + robots disallow。
濫用防護（FR46）：開放解析端點 per-session/per-IP 預算上限。

**Non-Functional Requirements（25 + 2 範圍排除，驅動架構）:**
- Performance：job ack p95<1s（NFR-P1）；不設端到端 LLM SLA（P2）；
  認領互動感知<200ms 樂觀更新（P3）；輪詢 2–3s 閒置退避（P4）；
  結算純前端即時（P5）。
- Security/Privacy：連結 ID ≥128bit（S1）；device-token 授權隔離（S2）；
  上傳前遮卡號、不長期保未遮原圖（S3）；30 天可驗證銷毀（S4）；
  定案凍結唯讀無路徑改動（S5）；全站 noindex（S6）；端點預算上限（S7）。
  範圍排除：不適用 PCI-DSS/KYC/AML。
- Reliability：降級鏈 重試→廉模型→快取→靜態 fallback→友善訊息（R1）；
  核對永有前進路徑（R2）；認領持久化 Postgres（R3）；無 uptime SLA
  但不丟已提交資料（R4）。
- LLM-Ops（非協商）：退避+jitter 重試≥3（L1）；結構化 log 全欄位
  model/tokens/latency/cost/session_id/request_id/success（L2）；
  成本持久化 Postgres per-session-day（L3）；>1s 走 job 輪詢（L4）；
  per-session token-budget 速率限制（L5）。
- Scalability（刻意極小）：單 session ≤8 人不丟更新、伺服器權威（SC1）；
  DAU<10k 維持單 monolith + 單 Postgres，不引入
  microservices/sharding/autoscaling/websocket（SC2）。
- Accessibility：務實基本級（A1）；不設 WCAG AA（A2）。
- Integration：唯一外部相依視覺 LLM API（I1）；無金流/身份/其他整合（I2）。

### Scale & Complexity

- Primary domain: full-stack web（行動優先 SPA + 單一全端 monolith + Postgres）
- Complexity level: 產品/合規 LOW；技術協調 moderate（3 熱點：LLM async
  邊界、多人認領輪詢樂觀並發、session 生命週期狀態機）
- Estimated architectural components: ~15 邏輯模組（單 monolith 內分模組，
  非分散式服務）：影像擷取壓縮、上傳遮卡號、解析 job 編排、視覺 LLM
  adapter（LLM-Ops 包裹）、對帳引擎、收據逐行編輯、連結+訊息卡產生、
  device-token 身份、認領引擎（樂觀並發+undo+變更紀錄）、看板輪詢讀模型、
  結算計算器（FR50/FR6/FR35 接線）、session 狀態機+定案凍結、
  到期銷毀排程、濫用防護/速率限制、成本與結構化 log 持久化。
- 無 multi-tenancy（每 session 不可猜連結隔離）、無真即時（v1 輪詢）、
  無對外 API/admin/帳號後台

### Technical Constraints & Dependencies

- 唯一外部相依：視覺 LLM 供應商 API（NFR-I1）；無金流處理商、無第三方
  身份、無其他整合（NFR-I2，定義上排除）
- 單一全端 monolith + 單一 Postgres；DAU<10k 不引入
  microservices/sharding/autoscaling/websocket（NFR-SC2）
- 行動優先；iOS Safari + Android Chrome 近兩版為主，桌面 evergreen 次要
- 資源現實：單人開發 n=1，v1 必須真薄；任何非核心一律 v2
- Postgres 承載：sessions、claims、parse jobs、cost/budget、變更紀錄
- localStorage 承載：device-token、同團名字記憶
- v1 硬約束：#5564 同結構硬鎖（FR7）；可執行斷言
  `parsed_sum == 2208.50` + 3–5 張條件變異回歸測資為 v1 交付物
- 永久 OUT（定義上不做）：金流、收款、滾動帳本、帳號體系、商業化

### Cross-Cutting Concerns Identified

1. **LLM-Ops adapter（NFR-L1–L5 + R1）**：包裹唯一視覺 LLM 呼叫；
   重試/log/成本/預算/降級鏈。**不得獨立成技術 epic**，附掛於「收據解析」
   能力（就緒報告 carry-forward）。
2. **Device-token 授權（NFR-S2）**：每個認領變更須驗 token 擁有權；
   橫切認領/身份/看板。
3. **輪詢樂觀並發（NFR-P3/P4, FR33, SC1）**：本地樂觀更新 + 伺服器
   權威回填；橫切認領與看板。
4. **Session 生命週期狀態機**：草稿→對帳→分享→認領中→定案凍結唯讀；
   閘控每個操作的可行性；橫切幾乎全系統（含遲到者降級、未驗證標示傳播）。
5. **🔴 FR50 稅金計算接線**：結算計算器必明確定義「VAT 內含每行→各人
   認領行含稅直接加總」並對齊 FR6 IRC 淨價（PRD 唯一弱點，架構必處理）。
6. **成本/預算持久化（NFR-L3/L5/S7）**：Postgres per-session-day；
   同時供濫用速率限制；橫切解析與防護。
7. **到期可驗證銷毀（NFR-S4）**：橫切影像儲存與 claims 資料。
8. **全站 noindex/nofollow + robots disallow（NFR-S6）**：橫切所有頁面。

## Starter Template Evaluation

### Primary Technology Domain

Full-stack web（行動優先 SPA + 單一全端 monolith + Postgres），依 Project
Context Analysis。框架選型由 PRD 明示移交本階段（Phase 3）。

### Starter Options Considered

- **create-next-app（Next.js 16.2.x，極簡官方）** — TS strict + Tailwind +
  ESLint + App Router + Turbopack + `@/*` alias + AGENTS.md 預設；零 auth
  bloat（本專案 FR20 免註冊／NFR-I2 無第三方身份，T3 招牌 NextAuth 用不到）；
  n=1 維護負擔最小；AGENTS.md 對 AI 輔助 solo 開發實質加分。
- **create-t3-app（單 app）** — Next.js + tRPC v11 + Drizzle/Prisma +
  Tailwind v4，端到端型別安全；代價＝多 tRPC/ORM 約定維護 + 預設帶用不到的
  NextAuth 須手動取消。型別安全價值可於 step-04 以更輕方式補。
- **單一 Go 服務 + 前端分離** — 全域標準允許之替代；但行動優先 SPA + 全域
  TS-strict 規則 + 視覺 LLM SDK 生態 + n=1，TS 全端整合明顯更省工，未選。

### Selected Starter: create-next-app（Next.js 16，極簡）

**Rationale for Selection:**
本專案無帳號、無對外 API、無第三方整合（NFR-I2）——T3 的核心價值
（NextAuth）正好用不到，徒增 scaffold 與維護面。n=1 資源現實要的是
「真薄、少維護、AI 好接手」，create-next-app 的 AGENTS.md 直接服務
AI 輔助 solo 開發。型別安全（認領/輪詢 API 跨前後端契約）改於 step-04
以資料層 + 共享型別策略補，不需扛整套 tRPC 約定。符合全域工程標準
（TS strict、pnpm、Next.js 全端 monolith）與反過度工程原則。

**Initialization Command:**

```bash
pnpm create next-app@latest splitting-tools \
  --ts --tailwind --eslint --app --turbopack \
  --src-dir --use-pnpm --import-alias "@/*"
```

> 旗標說明：`--ts` TypeScript（後續 tsconfig 設 `strict: true`，全域非協商）；
> `--tailwind` Tailwind（行動優先樣式）；`--eslint` ESLint；`--app` App
> Router；`--turbopack` Next.js 16 預設打包器；`--src-dir` 採 `src/` 隔離
> 應用碼（monolith 漸長時組織更清楚）；`--use-pnpm` 全域套件管理器；
> `--import-alias "@/*"` 預設別名。scaffold 目錄與既有 repo 根整合方式為
> scaffold story 的實作細節。

**Architectural Decisions Provided by Starter:**

**Language & Runtime:** TypeScript（tsconfig 後續強制 `strict: true`）；
Node.js runtime；Next.js 16.2.x App Router（前後端同一 monolith，
Server Components + Route Handlers 同框架，符合「單一全端服務」）。

**Styling Solution:** Tailwind CSS（行動優先單欄、最小點擊區、黏性小計列
等 NFR-A1 務實基本級樣式以 utility 快速落地）。

**Build Tooling:** Turbopack（Next.js 16 預設，dev 啟動/重繪大幅加速，
n=1 迭代效率）；Next.js production build。

**Testing Framework:** starter 不預裝測試；step-04 架構決策選定
（須能跑 v1 交付物可執行斷言 `parsed_sum == 2208.50` + 3–5 條件變異
回歸測資，CI 可跑——就緒報告 carry-forward）。

**Code Organization:** App Router 慣例（`src/app/` 路由與 Route
Handlers）；`@/*` import alias；模組化單 monolith（~15 邏輯模組依
Project Context Analysis，非分散式服務）。

**Development Experience:** 內建 dev server + HMR（Turbopack）；
**AGENTS.md** 引導 AI agent 寫最新 Next.js 寫法（n=1 + AI 輔助開發
直接受益）；ESLint。

**Note:** 以此指令初始化專案應為**第一個 implementation story**
（Epic 1 Story 1：依架構 starter 建專案骨架，含相依、初始設定、
CI 跑 `parsed_sum == 2208.50`——就緒報告 Step 5 carry-forward #4）。

### Deployment Target Note（使用者於 step-03 提出，正式決策留 step-04）

使用者詢問是否可架於自有 Hostinger。查證結論：**Hostinger VPS（含
Docker Manager）可行且命中使用者全域 playbook stage 0–100「單 VPS +
Docker Compose + 單一 Postgres + 無 cache」**；Hostinger 共享/Cloud
方案因 CloudLinux LVE Entry-Process/NPROC 上限**不適合**（解析 async
worker 程序會 crash）。建議部署形狀：一台 Hostinger VPS、一份
docker-compose（`web` Next.js / `db` Postgres / `worker` pg-boss
解析消費者）。**step-04 待拍板決策點：** (a) Postgres 自架 VPS 容器
vs (b) VPS 跑 app+worker、Postgres 用 managed（Supabase/Neon）；
另 NFR-S4 收據影像 30 天可驗證銷毀的儲存位置（VPS volume vs
物件儲存）一併 step-04 決定。
> **step-04 已拍板：** (a) Postgres 自架 Hostinger VPS Docker；
> 影像存 VPS 本機 volume。詳見下方 Core Architectural Decisions。

## Core Architectural Decisions

### Decision Priority Analysis

**Critical（阻擋實作，已決）：** 框架 Next.js 16 App Router／資料層 Drizzle
0.45／Postgres 自架 VPS Docker／視覺 LLM＝Anthropic Claude（primary
claude-sonnet-4-6、fallback claude-haiku-4-5-20251001）／job queue pg-boss
v3+／LLM 回傳驗證 Zod v4／連結 ID 128-bit crypto-random。

**Important（顯著塑形，已決）：** 前端 server-state＝TanStack Query 5.x
（輪詢＋optimistic rollback）／API＝Next.js Route Handlers REST + 共享 Zod
schema 推導型別／LLM 降級鏈／Postgres 計數表做速率與成本／影像 VPS volume
＋排程銷毀／Docker Compose（web・db・worker）／GitHub Actions CI。

**Deferred（Post-MVP，明示）：** Redis cache／真即時 websocket 看板／
最少轉帳結算／比例攤稅 fallback／非 Costco 通用化（皆 PRD v2 backlog，
NFR-SC2 與 stage-0 playbook 一致，非遺漏）。

### Data Architecture

- **DB**：PostgreSQL，**自架於 Hostinger VPS（Docker 容器）**。單一
  Postgres 同時承載：app 狀態（sessions/claims/變更紀錄）、pg-boss job
  佇列、LLM cost/budget 計數、速率計數。符合 NFR-SC2／stage-0 playbook。
- **ORM**：**Drizzle 0.45**——thin SQL wrapper、無 codegen、即時型別、
  極小 bundle；schema 以 TS 宣告。Rationale：n=1 少 ceremony、2026 Next.js
  首選、與 pg-boss 共用同連線單純。Affects：所有資料存取 FR。
- **Migration**：**Drizzle Kit**（TS schema → SQL migration，版本控管）。
- **驗證**：**Zod v4** 為單一驗證權威——LLM 解析回傳、API 邊界輸入皆過
  Zod schema 並推導 TS 型別（NFR-L2／你全域「LLM JSON 結構錯早攔」非協商）。
- **備份**：compose 內 nightly `pg_dump` + 保留 N 份輪替（NFR-R3「不丟
  已提交資料」務實達標）。已知缺口：off-host 副本 v1 不做（n=1 dogfood
  規模，反過度工程；列 Deferred）。
- **Cache**：**MVP 無 cache**（stage-0 playbook；cache-aside 列 Deferred）。

### Authentication & Security

- **無帳號體系**（PRD FR20／NFR-I2，定義上排除）。身份＝**本機 device
  token**：前端產生 crypto-random token 存 localStorage，請求帶 token；
  伺服器以 token 綁定認領，授權檢查＝「此 token 是否擁有該 claim」
  （NFR-S2，FR21/FR24）。無第三方身份供應商。
- **分帳連結 ID**：**16-byte crypto-random → base64url（~22 字元，
  ≥128-bit 熵）**。明確**不用 UUIDv4**（僅 122-bit 隨機）。連結即唯一
  存取憑證（NFR-S1，FR17）。
- **濫用/預算防護**：Postgres 計數表，per-session ＋ per-IP 請求預算上限
  施於開放解析端點；逾限拒絕（FR46／NFR-S7／NFR-L5）。同表記 LLM
  cost per-session-day（NFR-L3）。免 Redis。
- **資料生命週期**：卡號遮蔽於**前端上傳前**完成，伺服器只存已遮影像、
  不長期保未遮原圖（FR43／NFR-S3）；連結 30 天到期＝排程 job 刪除
  影像檔＋DB claims，刪後做存在性/雜湊檢查使**銷毀可驗證**（FR44／
  NFR-S4）；定案後 session 凍結唯讀，無路徑改動（FR41/FR42／NFR-S5）。
- **反索引**：全站 `noindex,nofollow` meta ＋ robots.txt disallow，
  無 sitemap/公開入口（FR45／NFR-S6）。
- **範圍排除**：不適用 PCI-DSS／KYC／AML（無金流/帳號）。

### API & Communication Patterns

- **API 風格**：**Next.js Route Handlers，REST JSON**。前後端共享 **Zod
  schema → 推導 TS 型別**作為契約安全層（兌現 step-03「不扛 tRPC 也有
  型別安全」）。
- **非同步解析**：上傳 → 入 pg-boss job → **<1s 回 job_id**（NFR-P1）；
  解析（單次 Claude 視覺呼叫 FR4）在 **worker 程序**執行（NFR-L4 「>1s
  走 job」）。前端輪詢 job 狀態端點。
- **輪詢**：TanStack Query，間隔 2–3s、閒置退避（NFR-P4）；認領互動
  optimistic 更新感知 <200ms，伺服器權威回填校正，競態以 `onMutate`
  rollback（NFR-P3／FR33／NFR-SC1）。
- **錯誤/降級**：統一錯誤封套；LLM 降級鏈＝pg-boss jittered 指數退避
  重試（≥3，NFR-L1）→ 較廉 Claude 模型（Haiku 4.5）→ 上次良好/快取
  → 靜態 fallback → 友善訊息，原始錯誤永不外洩（NFR-R1）。核對閘門
  恆有前進路徑：手動輸入總額、N 次後未驗證強制放行，永不卡死付款人
  （FR13/FR14/FR16／NFR-R2）。
- **結構化 log**：每次 Claude 呼叫輸出 model／prompt_tokens／
  completion_tokens／latency_ms／cost_usd／session_id／request_id／
  success（NFR-L2），成本持久化 Postgres per-session-day（NFR-L3）。

### Frontend Architecture

- **狀態管理**：React 內建 + **TanStack Query 5.x** 管 server state
  （輪詢／optimistic／快取失效），不引入 Redux。
- **元件架構**：App Router；Server Components 為預設，互動認領/核對 UI
  為 Client Components。
- **路由**：兩面向——付款人流（拍照→輪詢→核對閘門→出連結）、朋友流
  （開連結→綁 token→認領→結算），均掛不可猜連結 ID 下。
- **影像處理**：上傳前 canvas 壓縮至長邊 ~1600px ＋ 卡號區域遮蔽
  （FR2/FR43／NFR-P1/S3），控制 payload。
- **結算計算**：**純前端即時計算**（NFR-P5）。🔴 **FR50 接線（PRD 唯一
  弱點 carry-forward）**：每人應付＝其認領各行**含稅金額**直接加總
  （VAT 內含每行，不獨立攤稅），且各行金額須為 **FR6 IRC 折扣配對後的
  母品項淨價**。此計算契約於 step-05 patterns 給出可被 AI agent 一致
  實作的精確規格與 `parsed_sum == 2208.50` 對齊斷言。
- **樣式/無障礙**：Tailwind；NFR-A1 務實基本級（語意 HTML、對比、
  行動點擊區、單手可用、核心動作鍵盤可達），不設 WCAG AA。

### Infrastructure & Deployment

- **部署**：單一 **Hostinger VPS** + 一份 `docker-compose.yml`：
  `web`（Next.js 16）、`db`（PostgreSQL）、`worker`（pg-boss 消費者，
  跑 Claude 視覺解析）。命中你 stage 0–100 playbook。
- **影像儲存**：**VPS 本機 Docker named volume**；到期排程 job 刪檔
  ＋驗證（NFR-S4）。
- **設定**：12-factor 環境變數，`ANTHROPIC_API_KEY` 等機密走 env／
  secret，不入版控。
- **CI/CD**：**GitHub Actions**——lint＋type-check＋跑可執行斷言
  `parsed_sum == 2208.50` ＋ 3–5 條件變異回歸測資（褪色/過曝/超長/
  折疊），綠燈才可部署（就緒報告 carry-forward）。
- **觀測**：**Sentry**（你全域預設）＋ Postgres 結構化 LLM 成本 log。
- **擴展策略**：刻意極小（NFR-SC2）；DAU<10k 不引入 microservices／
  sharding／autoscaling／websocket／Redis。

### Decision Impact Analysis

**Implementation Sequence（與就緒報告既定線性依賴一致，不可倒置）：**
1. Scaffold（create-next-app）＋ Docker Compose 骨架 ＋ Drizzle schema
   ＋ CI 跑 `parsed_sum==2208.50`（Epic 1 Story 1）
2. 解析管線：上傳/壓縮/遮卡號 → pg-boss job → Claude 視覺 adapter
   （LLM-Ops 包裹：重試/log/cost/budget/降級）→ IRC 配對 → 結構硬鎖
3. 核對閘門（對帳/可疑行/編輯/逃生口）
4. 連結＋訊息卡產生
5. 身份（device-token）＋認領＋加權份額＋看板（TanStack Query 輪詢）
6. 結算（FR50 含稅加總接線）＋付款人顯式吸收＋定案凍結
7. 生命週期/隱私（30 天銷毀可驗證）＋濫用防護

**Cross-Component Dependencies：**
- Drizzle schema 為 sessions/claims/jobs/cost/rate/變更紀錄共同基底，
  須最先 ship（foundation）。
- pg-boss 同 Postgres：job 表隨 Drizzle migration 一起建。
- device-token 授權橫切認領/身份/看板——任一認領變更端點皆須過 token
  擁有權檢查。
- LLM-Ops 包裹**附掛於解析能力**，不獨立成技術 epic（就緒報告
  carry-forward）。
- FR50 結算接線依賴 FR6 IRC 淨價輸出格式——解析資料模型須先定義
  「行含稅金額 ＋ IRC 已歸屬母品項」欄位，結算才算得對。

## Implementation Patterns & Consistency Rules

### Pattern Categories Defined

**Critical Conflict Points Identified:** 7 類 AI agent 可能各寫各的的點
（金額表示與結算捨入、DB 命名、API 封套、Zod 契約位置、device-token
授權、輪詢/樂觀更新、LLM-Ops 包裹）。最高風險＝結算捨入（FR50
carry-forward）。多數命名/結構採 Next.js/Drizzle/TS 慣例硬性統一。

### Naming Patterns

**Database（Drizzle / Postgres）:** 表名 snake_case 複數（`sessions`,
`claims`, `receipt_lines`, `claim_changes`, `parse_jobs`, `llm_costs`,
`rate_counters`）；欄位 snake_case；外鍵 `<表單數>_id`（`session_id`）；
索引 `idx_<表>_<欄>`；主鍵 `id`；金額欄位一律整數「分」、命名以
`_cents` 結尾（`amount_cents`, `subtotal_cents`）。時間 `timestamptz`，
欄名 `created_at`/`updated_at`/`expires_at`。

**API（Next.js Route Handlers）:** 路徑複數名詞 kebab，掛連結 ID 於
`/api/splits/[linkId]/...`（`/api/splits/[linkId]/claims`,
`/api/splits/[linkId]/parse-jobs/[jobId]`）；路由參數 `[linkId]`、
`[jobId]`（Next 慣例）；JSON 欄位 **camelCase**；HTTP 動詞 RESTful
（GET 讀、POST 建、PATCH 改、DELETE 取消認領）。

**Code（TS strict）:** 元件 PascalCase 檔同名（`ClaimBoard.tsx`）；
hooks `useXxx`（`useClaimMutation`, `useParseJobPolling`）；函式/變數
camelCase；型別/介面 PascalCase；常數 UPPER_SNAKE；Zod schema 以
`Schema` 結尾（`ReceiptLineSchema`），推導型別 `z.infer` 同名去
`Schema`。

### Structure Patterns

**Project Organization（`src/` feature-based，非按技術分層）:**
`src/app/`（路由＋Route Handlers）、`src/features/<能力>/`（parsing,
reconciliation, claiming, settlement, lifecycle 各自含 components/
hooks/server/schema）、`src/lib/`（共享：db、llm、id、money）、
`src/db/`（Drizzle schema + migrations）、`src/workers/`（pg-boss
消費者）。測試 **co-located `*.test.ts`**；回歸測資
`src/features/parsing/__fixtures__/`（含 #5564 + 3–5 變異）。

**File Structure:** env 範本 `.env.example`（機密不入版控）；
`docker-compose.yml` 於 repo 根；CI 於 `.github/workflows/`；
Drizzle 設定 `drizzle.config.ts`。

### Format Patterns

**API Response（統一封套，所有 Route Handler 一致）:**
成功 `{ "data": <payload> }`；錯誤 `{ "error": { "code":
"<MACHINE_CODE>", "message": "<使用者友善繁中>" } }`。HTTP 狀態：
200/201 成功、400 驗證（Zod 失敗）、403 token 授權失敗、404 連結
不存在、409 競態衝突（回伺服器權威狀態）、410 連結到期、423 session
凍結唯讀、429 預算/速率逾限。原始 LLM/系統錯誤**永不**進 message
（NFR-R1）。

**Data Formats:** JSON camelCase；金額整數分（`amountCents`）；
日期 ISO-8601 UTC 字串；布林 true/false；null 表「未設定」、不混用
空字串。**金錢計算全程整數分，僅顯示層格式化為 `¥X.XX`。**

### 🔴 Settlement Calculation Spec（FR50 carry-forward — 必須逐字實作，禁止 agent 自行發明）

PRD 唯一弱點。以下為**確定性、無捨入洩漏**的權威演算法，所有 agent
逐字實作；附 CI 不變量斷言。

1. **IRC 先折抵（FR6 先於 FR50）**：母品項 `net_cents = gross_cents
   + Σ(其 IRC 行, 皆負值)`。IRC **不**獨立認領/分攤——折抵後只存
   在母行 `net_cents`。解析資料模型必含每行 `net_cents` 與
   `irc_attributed_to`（母行 id 或 null）。
2. **對帳不變量（FR8）**：`parsed_sum = Σ 所有行 net_cents` 必等於
   收據印製總額（#5564 ＝ 220850 分）。CI 斷言 `parsed_sum ==
   2208.50`。
3. **單行加權分攤（FR28，整數分，最大餘數法 + 穩定排序）**：
   行 `net_cents`、認領者權重 `w_i`（預設全 1）、`W = Σ w_i`：
   - `raw_i = net_cents * w_i / W`（有理數，不先取整）
   - `floor_i = ⌊raw_i⌋`；`R = net_cents − Σ floor_i`（0 ≤ R < 認領人數）
   - 將 R 個「+1 分」依 `frac_i = raw_i − floor_i` **由大到小**逐一
     分配；`frac_i` 相同時以**認領者加入該 session 的順序（穩定）**
     tie-break，跨 agent/重算結果一致。
   - 保證 `Σ allocated_i == net_cents`（零洩漏）。
4. **每人應付**：`Σ` 其所有認領行的 `allocated_i`。
5. **PENDING（FR32/FR40）**：未認領行 `net_cents` 全歸付款人，且僅在
   付款人**顯式**「結束分帳並吸收剩餘」後計入（不超時/不靜默）。
6. **全域不變量**：`Σ 每人應付 + Σ PENDING(付款人吸收) == parsed_sum
   == 印製總額`。CI 另立斷言 `settlement_sum == parsed_sum`（捨入零
   漂移）；違反即紅燈。FR36「✓對得上總計」標示僅當此不變量成立 + 對帳
   通過才顯示。

### Communication Patterns

**State（TanStack Query 5.x）:** server state 一律經 Query/Mutation，
不自捲 fetch；不可變更新；認領 mutation 用 `onMutate` 樂觀更新 +
`onError` rollback + `onSettled` invalidate（FR31 undo／FR33 競態）；
輪詢 `refetchInterval` 2–3s、`refetchIntervalInBackground:false`
閒置退避（NFR-P4）；查詢鍵 `['split', linkId, <資源>]`。

**Authorization（device-token，橫切，零例外）:** 任何寫入認領的端點
**必**先驗 `X-Device-Token` 是否擁有該 claim/identity，否則 403；
讀取看板（FR47–49）不需 token。token 由前端 `crypto.getRandomValues`
產生存 localStorage。連結 ID 由伺服器 `crypto.randomBytes(16)` →
base64url。

**LLM-Ops 包裹（NFR-L1–L5，附掛解析能力，不獨立模組）:** 唯一
Claude 視覺呼叫經 `src/lib/llm/visionAdapter`，內含 pg-boss jittered
指數退避重試（≥3）→ 降級 Haiku 4.5 → 上次良好/快取 → 靜態 fallback
→ 友善訊息；每次呼叫寫結構化 log（model/prompt_tokens/
completion_tokens/latency_ms/cost_usd/session_id/request_id/success）
入 `llm_costs`，成本 per-session-day 持久化。任何新 LLM 呼叫點不得
繞過此 adapter。

### Process Patterns

**Error Handling:** Route Handler 統一 `try/catch` → 上述錯誤封套；
LLM/系統細節只入 Sentry + 結構化 log，不外洩 user。核對閘門恆有前進
路徑（手動輸入總額／N 次後未驗證強制放行），永不卡死付款人（FR16/
NFR-R2）。

**Loading States:** 解析走 job：提交 <1s 回 `jobId`，前端輪詢
`status ∈ {queued, processing, succeeded, failed, degraded}`；
`degraded` 須在所有認領者頁顯示「未經對帳驗證」橫幅（FR15）。

### Enforcement Guidelines

**All AI Agents MUST:**
- 金額一律整數「分」、欄位 `_cents`、永不 float；顯示層才格式化。
- 結算逐字實作上方 Settlement Calculation Spec，不得自行發明捨入。
- 所有 API I/O 邊界以 Zod schema 驗證並 `z.infer` 推導型別（單一契約源）。
- 任何認領寫入端點先過 device-token 擁有權檢查。
- 任何 LLM 呼叫只經 visionAdapter，不繞過 LLM-Ops 包裹。
- 統一回應/錯誤封套與 HTTP 狀態碼表。

**Pattern Enforcement:** CI（GitHub Actions）跑 type-check + lint +
`parsed_sum==2208.50` + `settlement_sum==parsed_sum` + 3–5 變異測資；
任一紅燈阻擋部署。違反模式於 PR/review 標記。

### Pattern Examples

**Good:** `amountCents: 220850` ↔ 顯示 `¥2,208.50`；
`POST /api/splits/[linkId]/claims` body 過 `CreateClaimSchema`；
餘數：`net=1001, A:1/B:1 → raw 500.5/500.5, floor 500/500, R=1,
frac 相等 → 依加入序給 A → A=501,B=500, Σ=1001` ✓。

**Anti-Patterns:** `amount: 2208.5`（float，禁）；每人各自
`Math.round` 後相加（Σ≠總額，禁）；IRC 行單獨被認領（禁，須先折抵
母行）；繞過 visionAdapter 直呼 Claude（禁）；用 UUIDv4 當連結 ID
（122-bit <128，禁）。

## Project Structure & Boundaries

### Complete Project Directory Structure

```
splitting-tools/
├── README.md
├── package.json                  # pnpm；deps: next@16 react drizzle-orm
│                                  #   pg pg-boss zod @tanstack/react-query
│                                  #   @anthropic-ai/sdk @sentry/nextjs
├── pnpm-lock.yaml
├── next.config.ts                # noindex headers、image、standalone output
├── tsconfig.json                 # "strict": true（全域非協商）
├── tailwind.config.ts
├── drizzle.config.ts             # schema→migration（自架 Postgres）
├── .env.example                  # DATABASE_URL ANTHROPIC_API_KEY SENTRY_DSN
│                                  #   LINK_ID_BYTES=16 PARSE_BUDGET_*（機密不入版控）
├── .gitignore
├── Dockerfile                    # web（Next standalone）
├── Dockerfile.worker             # pg-boss 消費者程序
├── docker-compose.yml            # web / db(Postgres) / worker（Hostinger VPS）
├── .dockerignore
├── .github/
│   └── workflows/
│       └── ci.yml                # lint+typecheck+parsed_sum==2208.50
│                                  #   +settlement_sum==parsed_sum+變異測資
├── scripts/
│   └── pg_dump_nightly.sh        # NFR-R3 備份輪替（compose cron 掛載）
├── public/
│   └── robots.txt                # disallow 全站（FR45/NFR-S6）
└── src/
    ├── app/
    │   ├── layout.tsx            # 全站 <meta noindex,nofollow>（NFR-S6）
    │   ├── globals.css
    │   ├── page.tsx              # 付款人入口：拍照上傳
    │   ├── providers.tsx         # TanStack QueryClientProvider
    │   ├── s/
    │   │   └── [linkId]/
    │   │       ├── page.tsx          # 朋友認領流（綁 token→認領）
    │   │       ├── settle/page.tsx   # 結算頁（FR35-38；唯讀降級 FR42）
    │   │       └── review/page.tsx   # 付款人核對閘門（FR8-16）
    │   └── api/
    │       └── splits/
    │           ├── route.ts                       # POST 建 session
    │           └── [linkId]/
    │               ├── route.ts                   # GET session（連結即憑證）
    │               ├── parse-jobs/route.ts        # POST 入解析 job→jobId
    │               ├── parse-jobs/[jobId]/route.ts# GET job 狀態（輪詢）
    │               ├── lines/route.ts             # 核對編輯（FR10-13）
    │               ├── reconcile/route.ts         # 手動總額/強制放行（FR13-15）
    │               ├── link/route.ts              # 產生連結+訊息卡（FR17-19）
    │               ├── identities/route.ts        # 身份名單/認領（FR22-25）
    │               ├── claims/route.ts            # 認領/份額/undo（FR26-34）
    │               ├── board/route.ts             # 看板讀模型（FR47-49）
    │               └── finalize/route.ts          # 顯式吸收+凍結（FR40-41）
    ├── features/
    │   ├── parsing/              # FR1-7
    │   │   ├── components/       # 拍照、壓縮、卡號遮蔽 UI
    │   │   ├── hooks/            # useParseJobPolling
    │   │   ├── server/           # job 入列、IRC 配對、#5564 結構硬鎖
    │   │   ├── schema.ts         # ReceiptLineSchema 等（Zod 單一契約源）
    │   │   └── __fixtures__/     # #5564 + 3-5 變異回歸測資
    │   ├── reconciliation/       # FR8-16（對帳/可疑行/逃生口）
    │   ├── linking/              # FR17-19（連結 ID/訊息卡）
    │   ├── identity/             # FR20-25（device-token/是不是你）
    │   ├── claiming/             # FR26-34（認領/加權/undo/競態）
    │   ├── board/                # FR47-49（輪詢看板）
    │   ├── settlement/           # FR35-42,50（結算/吸收/凍結）
    │   │   ├── settle.ts         # 🔴 引用 lib/money 結算規格
    │   │   └── settle.test.ts    # settlement_sum==parsed_sum 不變量
    │   └── lifecycle/            # FR43-45（遮蔽/30天銷毀/noindex）
    ├── lib/
    │   ├── db/
    │   │   ├── client.ts         # Drizzle + pg pool（單一 Postgres）
    │   │   └── index.ts
    │   ├── llm/
    │   │   ├── visionAdapter.ts  # 唯一 Claude 呼叫；LLM-Ops 包裹
    │   │   │                      #   重試/降級/log/cost（NFR-L1-5,R1）
    │   │   └── degradation.ts    # Sonnet4.6→Haiku4.5→快取→靜態→友善
    │   ├── money/
    │   │   ├── cents.ts          # 整數分；顯示格式化
    │   │   └── settle.ts         # 🔴 FR50 確定性結算（最大餘數+穩定排序）
    │   ├── id.ts                 # randomBytes(16)→base64url 連結 ID
    │   ├── apiEnvelope.ts        # {data}/{error{code,message}} 統一封套
    │   └── rateLimit.ts          # Postgres 計數（per-session/IP，FR46）
    ├── db/
    │   └── schema.ts             # sessions claims receipt_lines
    │                              #   claim_changes parse_jobs llm_costs
    │                              #   rate_counters（snake_case）
    ├── workers/
    │   ├── index.ts              # pg-boss boot（Dockerfile.worker 進入點）
    │   ├── parseWorker.ts        # 消費解析 job→visionAdapter
    │   └── lifecycleWorker.ts    # 排程 30 天銷毀+驗證（FR44/NFR-S4）
    └── middleware.ts             # noindex header 兜底、連結到期 410
└── drizzle/
    └── migrations/               # Drizzle Kit 產生（job 表隨此一起建）
```

### Architectural Boundaries

**API Boundaries:** 唯一對外輸入＝Route Handlers（無對外公開 API、無
admin）；外部相依僅 Claude 視覺 API，且**只**經 `lib/llm/visionAdapter`
（其他模組禁直呼）。連結 ID 為存取邊界（連結即唯一憑證）。

**Component Boundaries:** Server Components 預設；互動（核對/認領/看板）
為 Client Components，server state 一律經 TanStack Query（features/*/hooks）
→ Route Handler，禁元件內自捲 fetch。

**Service Boundaries（單 monolith 內模組界線）:** `features/*` 為能力垂
直切片，跨切片只透過 `lib/*` 共享（money/db/llm/id），不互相 import
彼此 server 內部。解析 job 由 web 入列、由 `workers/parseWorker` 執行
（程序邊界＝NFR-L4 >1s 走 job）。

**Data Boundaries:** 所有 DB 存取經 Drizzle（`lib/db`）；單一 Postgres
含 app 狀態＋pg-boss 佇列＋成本/速率計數；金額整數分；影像存 VPS
volume（非 DB）；30 天到期由 `lifecycleWorker` 銷毀並驗證。

### Requirements to Structure Mapping

| 能力區（FR） | 主要位置 |
|---|---|
| 解析 FR1-7 | `features/parsing/`＋`lib/llm/visionAdapter`＋`workers/parseWorker` |
| 核對閘門 FR8-16 | `features/reconciliation/`＋`api/.../reconcile`,`/lines` |
| 連結分享 FR17-19 | `features/linking/`＋`lib/id`＋`api/.../link` |
| 身份 FR20-25 | `features/identity/`＋`api/.../identities`（device-token） |
| 認領分攤 FR26-34 | `features/claiming/`＋`api/.../claims` |
| 看板 FR47-49 | `features/board/`＋`api/.../board`（TanStack 輪詢） |
| 結算結束 FR35-42,50 | `features/settlement/`＋`lib/money/settle`＋`api/.../finalize` |
| 生命週期隱私 FR43-45 | `features/lifecycle/`＋`workers/lifecycleWorker`＋`middleware` |
| 濫用防護 FR46 | `lib/rateLimit`（套於 parse 端點） |

**Cross-Cutting Concerns:** LLM-Ops＝`lib/llm/*`（附掛解析，不獨立 epic）；
device-token 授權＝每個寫入 Route Handler 共用守衛（檢 `X-Device-Token`
擁有權）；🔴 FR50 結算＝`lib/money/settle.ts` 單一純函式（所有 agent
逐字實作該規格，禁他處重造）；noindex＝`layout.tsx`+`middleware`+
`robots.txt` 三重。

### Integration Points

**Internal Communication:** 前端 → Route Handler（REST+Zod 契約）→
Drizzle/Postgres；解析路徑：web 入 pg-boss job → `parseWorker` →
visionAdapter → 寫回 DB → 前端輪詢 job 狀態。

**External Integrations:** 僅 Anthropic Claude（視覺解析，經 visionAdapter
含降級鏈）；Sentry（觀測）。無金流/身份/其他（NFR-I2）。

**Data Flow:** 拍照→前端壓縮+遮卡號→上傳→job→Claude 解析+IRC 折抵→
對帳→核對閘門→產生連結→朋友綁 token 認領（樂觀+輪詢回填）→結算
（lib/money/settle）→付款人顯式吸收→凍結唯讀→30 天銷毀。

### File Organization Patterns

**Configuration:** repo 根（`*.config.ts`、`docker-compose.yml`、
`.env.example`）；機密走 env/secret 不入版控。
**Source:** `src/` feature-based 垂直切片＋`lib/` 共享。
**Test:** co-located `*.test.ts`；回歸測資 `features/parsing/__fixtures__/`。
**Asset:** `public/`（含 robots.txt）；收據影像→VPS volume（非 repo/DB）。

### Development Workflow Integration

**Dev:** `pnpm dev`（Turbopack）；本機 Postgres 經 compose；worker 獨立
程序 `pnpm worker`。
**Build:** Next standalone output → `Dockerfile`；worker → `Dockerfile.worker`。
**Deploy:** Hostinger VPS 單一 `docker-compose up`（web/db/worker），
nightly `pg_dump` cron；CI 綠燈（含 `parsed_sum==2208.50` 與
`settlement_sum==parsed_sum`）才部署。

## Architecture Validation Results

### Coherence Validation ✅

**Decision Compatibility:** Next.js 16.2.x / Drizzle 0.45 / pg-boss v3+ /
Zod v4 / TanStack Query 5.100.x / @anthropic-ai/sdk / Sentry——全 Node/TS、
版本相容。單一 Postgres 由 Drizzle（app 表）與 pg-boss（佇列，自建
schema）共用 pg 連線，無衝突。Next standalone + Docker Compose 一致。
無相互矛盾決策。

**Pattern Consistency:** 整數分＋Zod 單一契約源＋`{data}/{error}`封套＋
device-token 守衛＋TanStack 樂觀 rollback——皆與 step-04 決策對齊。
命名（snake_case DB／camelCase JSON／PascalCase 元件）一致。

**Structure Alignment:** `features/*` 垂直切片＋`lib/*` 共享支撐所有
決策；🔴 FR50 收斂為 `lib/money/settle.ts` 單一純函式；解析程序邊界
（web 入列 → `workers/parseWorker`）落實 NFR-L4。

### Requirements Coverage Validation ✅

**Functional Requirements（50/50 有架構支撐）:**
- 解析 FR1-7 → `features/parsing`＋`visionAdapter`＋`parseWorker`
  （FR7 #5564 硬鎖於 parsing/server）
- 核對閘門 FR8-16 → `features/reconciliation`＋reconcile/lines 端點
  （FR13 手動總額／FR14 強制放行／FR15 job `degraded`→未驗證橫幅／
  FR16 永不卡死）
- 連結 FR17-19 → `lib/id`(128-bit)＋`features/linking`＋訊息卡
- 身份 FR20-25 → `features/identity`＋device-token＋名字 localStorage
- 認領 FR26-34 → `claims` 端點（FR31 undo／FR33 伺服器權威+rollback／
  FR34 `claim_changes` 表）
- 看板 FR47-49 → `features/board` 輪詢讀模型
- 結算 FR35-42,50 → `lib/money/settle`＋`finalize`（FR40 顯式吸收／
  FR41 凍結→423／FR42 唯讀降級）
- 生命週期 FR43-45 → 前端遮卡號／`lifecycleWorker` 30 天銷毀／
  noindex 三重
- 濫用 FR46 → `lib/rateLimit`

**Non-Functional Requirements（25/25 + 2 排除已處理）:**
P1-5（job ack<1s／無 SLA／樂觀<200ms／輪詢退避／結算純前端）✅；
S1-7（128bit／token 隔離／遮卡號只存遮後／30 天可驗證銷毀／凍結唯讀／
noindex／預算）✅；R1-4（降級鏈／永不卡死／Postgres 持久化+pg_dump／
無 SLA 不丟資料）✅；L1-5（pg-boss jitter 退避≥3／結構化 log／成本
per-session-day／>1s job／per-session 速率）✅；SC1-2（≤8 人伺服器
權威／單 monolith 不引入 microservices 等）✅；A1-2（務實基本級／
不設 WCAG AA）✅；I1-2（僅 Claude 經 visionAdapter／無其他整合）✅。

### Implementation Readiness Validation ✅

**Decision Completeness:** 關鍵決策皆附驗證版本；FR50 給確定性逐字
規格＋CI 不變量斷言，AI agent 無自由發明空間。
**Structure Completeness:** 完整具體樹、邊界、FR↔目錄映射齊備。
**Pattern Completeness:** 7 衝突點全覆蓋，含 Good/Anti-Pattern 範例與
CI 強制（`parsed_sum==2208.50`、`settlement_sum==parsed_sum`）。

### Gap Analysis Results

**Critical：無。** 無缺失決策阻擋實作。

**Important（非阻斷，epics 階段補，不返工架構）：**
1. **FR37 收據縮圖服務端點**：影像存 VPS volume 已定，但樹中未列顯式
   服務路由。補 `api/splits/[linkId]/receipt/route.ts`：依連結授權、
   隨 session 到期 410、回已遮影像。屬結構細化，邊界已定義。
2. **pg-boss × Drizzle 遷移共存**：pg-boss 執行時自建其 schema/表，
   **不**納入 Drizzle `schema.ts`／migration，避免遷移衝突；於 Epic 1
   scaffold story 註明初始化順序（Drizzle migrate → pg-boss start）。

**Minor（可選）：** 影像上傳 multipart 處理可在 parse-jobs 端點再
細列；A1 無障礙細節從簡（PRD 刻意基本級，可接受）。

### Validation Issues Addressed

2 個 Important gap 皆為結構細化、邊界與資料已定，列為 epics 階段
explicit story note；不觸發架構返工。Critical 0。

### Architecture Completeness Checklist

**Requirements Analysis**
- [x] Project context thoroughly analyzed
- [x] Scale and complexity assessed
- [x] Technical constraints identified
- [x] Cross-cutting concerns mapped

**Architectural Decisions**
- [x] Critical decisions documented with versions
- [x] Technology stack fully specified
- [x] Integration patterns defined
- [x] Performance considerations addressed

**Implementation Patterns**
- [x] Naming conventions established
- [x] Structure patterns defined
- [x] Communication patterns specified
- [x] Process patterns documented

**Project Structure**
- [x] Complete directory structure defined
- [x] Component boundaries established
- [x] Integration points mapped
- [x] Requirements to structure mapping complete

### Architecture Readiness Assessment

**Overall Status:** READY FOR IMPLEMENTATION（16/16 checklist `[x]`，
Critical Gap 0；2 個 Important gap 為非阻斷結構細化，邊界已定，
epics 階段補）

**Confidence Level:** high

**Key Strengths:**
- FR50（PRD 唯一弱點 carry-forward）已降為單一純函式 + 確定性規格 +
  CI 不變量斷言，跨 agent 一致性風險消除
- LLM-Ops 非協商項目落地為 `visionAdapter` 單一邊界，禁繞過
- 既定線性 epic 依賴順序保留於 Implementation Sequence，不倒置
- 全程命中使用者 stage 0–100 playbook，無過度工程

**Areas for Future Enhancement:** v2 backlog（websocket 真同步、最少
轉帳、比例攤稅 fallback、非 Costco 通用化）；off-host 備份副本。

### Implementation Handoff

**AI Agent Guidelines:** 嚴格遵循本文件全部架構決策；一致套用實作
模式；尊重專案結構與邊界；FR50 逐字實作 `lib/money/settle.ts` 規格；
所有架構問題以本文件為準。

**First Implementation Priority:**
```bash
pnpm create next-app@latest splitting-tools \
  --ts --tailwind --eslint --app --turbopack \
  --src-dir --use-pnpm --import-alias "@/*"
```
（Epic 1 Story 1：scaffold + Docker Compose 骨架 + Drizzle schema +
CI 跑 `parsed_sum==2208.50`）
