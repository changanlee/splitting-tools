---
stepsCompleted: ['step-01-validate-prerequisites', 'step-02-design-epics', 'step-03-create-stories', 'step-04-final-validation']
status: 'complete'
completedAt: '2026-05-19'
inputDocuments:
  - '_bmad-output/planning-artifacts/prd.md'
  - '_bmad-output/planning-artifacts/architecture.md'
  - '_bmad-output/planning-artifacts/ux-design-specification.md'
  - '_bmad-output/planning-artifacts/implementation-readiness-report-2026-05-18.md'
workflowType: 'epics-and-stories'
project_name: 'splitting_tools'
user_name: '長安'
date: '2026-05-19'
---

# splitting_tools - Epic Breakdown

## Overview

This document provides the complete epic and story breakdown for splitting_tools
（Costco 分帳小工具），由 PRD（50 FR / 25 NFR）、UX Design Specification
（14 步）、Architecture（status: complete）拆解為可實作 stories。Epic 順序
鎖定 Architecture「Implementation Sequence」線性依賴，**不可倒置**。

## Requirements Inventory

### Functional Requirements

**收據擷取與解析**
- FR1: 付款人 can 以裝置相機拍攝或從相簿選取**一或多張**收據影像（長收據連續分頁、依序組成單一邏輯收據）作為分帳來源〔2026-05-19 CIP，見 `docs/PRD-multi-page-receipt-roadmap.md`〕
- FR2: 系統 can 在上傳前於前端壓縮收據影像以控制傳輸量
- FR3: 系統 can 以非阻塞方式處理解析（提交後立即回工作識別、可查詢進度）
- FR4: 系統 can 以單次視覺模型呼叫將收據解析為逐行品項（品名、數量、金額）
- FR5: 系統 can 還原收據上的縮寫品名為可辨識名稱
- FR6: 系統 can 將 IRC 即時折扣行自動配對並歸屬到其對應母品項
- FR7: 系統 can 拒絕非 #5564 同結構的收據並明確告知不支援（v1 硬鎖）

**自我對帳與核對閘門**
- FR8: 系統 can 計算解析品項總和並與收據印製總額比對，向付款人顯示是否一致
- FR9: 系統 can 標示可疑行（單行佔比異常、品名疑似互換）供付款人抽檢
- FR10: 付款人 can 逐行編輯品名、金額、數量
- FR11: 付款人 can 新增或刪除品項行
- FR12: 付款人 can 變更任一 IRC 折扣所歸屬的母品項
- FR13: 付款人 can 在收據印製總額無法辨識時手動輸入該總額
- FR14: 付款人 can 在連續多次仍無法對帳時選擇「未驗證強制放行」繼續
- FR15: 系統 can 在未驗證放行後對所有認領者顯示「未經對帳驗證」標示
- FR16: 系統 can 確保核對流程恆有可前進路徑，永不卡死付款人

**分帳連結與分享**
- FR17: 付款人 can 在核對完成後產生一條不可猜測的分帳連結
- FR18: 系統 can 產生含日期、總額、品項數、付款人的可分享訊息卡（非裸 URL，防詐騙觀感）
- FR19: 付款人 can 將連結／訊息卡分享至外部群組（複製或系統分享）

**身份與存取**
- FR20: 認領者 can 無需註冊或登入即透過連結進入分帳
- FR21: 系統 can 以本機裝置 token 綁定認領者身份，同裝置再進視為同一人
- FR22: 認領者 can 從既有名單選「哪個是你」認領身份，或建立新身份
- FR23: 認領者 can 修正自己誤選的身份
- FR24: 系統 can 限制每位認領者僅能變更其裝置 token 所綁定的認領
- FR25: 系統 can 記憶同團名字以利下次選擇（本機）

**品項認領與分攤**
- FR26: 認領者 can 逐行認領或取消認領自己的品項
- FR27: 認領者 can 將單一品項設為多人分攤
- FR28: 認領者 can 為多人分攤品項設定權重份額（預設均分，可改如 A:5／B:3）
- FR29: 認領者 can 即時看到自己目前應付小計
- FR30: 認領者 can 標示「我已認領完成」
- FR31: 認領者 can 復原自己剛做的認領變更
- FR32: 系統 can 將未被任何人認領的品項維持在 PENDING 狀態
- FR33: 系統 can 在多人近同時操作同一品項時以伺服器狀態為準解決競態
- FR34: 付款人 can 檢視認領變更紀錄

**認領狀態可見性（社交壓力看板，v1 輪詢）**
- FR47: 認領者 can 檢視目前已加入此分帳的參與者名單
- FR48: 認領者 can 檢視每個品項目前由誰認領（含多人分攤的份額分配）
- FR49: 認領者 can 檢視哪些品項仍未被任何人認領（PENDING）

**結算與付款人結束**
- FR35: 認領者 can 檢視結算頁各人應付金額（誰欠誰）
- FR36: 系統 can 在結算頁顯示「對得上總計」信任標示（當已通過對帳）
- FR37: 認領者 can 檢視收據縮圖以核對
- FR38: 認領者 can 一鍵複製可貼回群組的純文字結算摘要
- FR39: 付款人 can 看到尚未認領之品項與金額的常駐提示
- FR40: 付款人 can 透過顯式操作「結束分帳並吸收剩餘」定案（不超時、不靜默）
- FR41: 系統 can 在定案後凍結分帳為唯讀
- FR42: 認領者 can 在定案後僅檢視唯讀結算結果（遲到者降級）
- FR50: 系統 can 以「VAT 內含於每行金額」直接加總各人認領行為應付；v1 不做獨立稅金分攤（比例攤稅列 v2）

**資料生命週期與隱私**
- FR43: 系統 can 支援在上傳前遮蔽收據上的會員卡號區域
- FR44: 系統 can 在連結到期（30 天）時銷毀收據影像與認領資料
- FR45: 系統 can 使所有分帳頁面不被搜尋引擎索引（反被發現）

**系統濫用防護**
- FR46: 系統 can 對開放解析端點施加 per-session／per-IP 請求預算上限以防濫用/惡意干擾

**Total FRs: 50**

### NonFunctional Requirements

**Performance**
- NFR-P1: 解析工作提交後系統回 job 識別的 ack，p95 < 1s（提交不阻塞）
- NFR-P2: 解析本身受外部視覺 LLM 延遲支配，不設端到端硬性秒數 SLA
- NFR-P3: 認領頁互動本地即時回饋，感知 < 200ms（樂觀更新，輪詢回填校正）
- NFR-P4: 狀態輪詢間隔 2–3s，閒置時退避以省資源
- NFR-P5: 結算頁與純文字匯出為純前端計算，即時完成

**Security & Privacy**
- NFR-S1: 分帳連結 ID 具 ≥128 bit 不可猜測熵，非序列/可枚舉
- NFR-S2: 認領變更以裝置 token 授權，任何人無法變更他人 token 綁定之認領
- NFR-S3: 收據影像於上傳前可遮蔽會員卡號；伺服器不長期保留未遮蔽原圖
- NFR-S4: 連結到期（30 天）時銷毀收據影像與認領資料，銷毀結果可驗證
- NFR-S5: 結清後 session 凍結唯讀，無任何路徑可改動已定案資料
- NFR-S6: 全站 noindex/nofollow ＋ robots disallow，無公開可發現入口
- NFR-S7: 開放解析端點施加 per-session/per-IP 請求預算上限，逾限拒絕
- 範圍排除聲明①：無金流/帳號/敏感金融資料，不適用 PCI-DSS/KYC/AML

**Reliability & Graceful Degradation**
- NFR-R1: 任一 LLM 呼叫失敗不外洩原始錯誤；降級鏈：重試→較廉模型→快取→靜態 fallback→友善訊息
- NFR-R2: 核對流程恆有可前進路徑，永不卡死付款人
- NFR-R3: 已送出之認領變更須持久化於 Postgres，不因單一程序重啟而遺失
- NFR-R4: 無正式 uptime SLA；目標為不丟已提交資料 ＋ LLM 中斷優雅降級

**LLM Operations（side-project 非協商）**
- NFR-L1: 每個 LLM 呼叫點具指數退避＋jitter 重試，至少 3 次
- NFR-L2: 每次 LLM 呼叫輸出結構化 log（model/prompt_tokens/completion_tokens/latency_ms/cost_usd/session_id/request_id/success）
- NFR-L3: Token/成本預算追蹤持久化於 Postgres，至少 per-session-per-day 粒度
- NFR-L4: 任何 >1s 的 LLM 操作走 job_id ＋ 輪詢，不阻塞 request thread
- NFR-L5: LLM 呼叫邊界做 per-session token-budget 速率限制

**Scalability（刻意極小）**
- NFR-SC1: 單一 session 須正確處理約 ≤8 名認領者近同時操作而不遺失更新
- NFR-SC2: DAU<10k 之前維持單一全端 monolith ＋ 單一 Postgres；不引入 microservices/sharding/autoscaling/websocket

**Accessibility**
- NFR-A1: 務實基本級——語意化 HTML、足夠對比、行動友善點擊區、核心動作鍵盤可達、單手可用
- NFR-A2: 不設正式 WCAG AA 合規目標

**Integration**
- NFR-I1: 唯一外部相依為視覺 LLM 供應商 API
- NFR-I2: 無金流處理商、無第三方身份供應商、無其他外部整合（範圍排除聲明②）

**Total NFRs: 25（＋2 範圍排除聲明）**

### Additional Requirements

來自 Architecture（status: complete），影響實作與 epic 拆解：

- **Starter（影響 Epic 1 Story 1）**：`pnpm create next-app@latest splitting-tools --ts --tailwind --eslint --app --turbopack --src-dir --use-pnpm --import-alias "@/*"`；tsconfig `strict:true`
- **部署**：單一 Hostinger VPS + `docker-compose.yml`：`web`(Next.js16) / `db`(Postgres) / `worker`(pg-boss)
- **資料層**：Drizzle 0.45 + Drizzle Kit migration；自架 Postgres（VPS Docker）；單一 Postgres 承載 app 表 + pg-boss 佇列 + cost/rate 計數
- **Job queue**：pg-boss v3+（免 Redis；內建 jittered 指數退避重試＝NFR-L1 落地）
- **驗證**：Zod v4 為單一契約源（LLM 回傳 + API 邊界）
- **前端 server-state**：TanStack Query 5.x（輪詢 2–3s + 樂觀 onMutate rollback）
- **LLM 邊界**：唯一 Claude 視覺呼叫經 `src/lib/llm/visionAdapter`（primary Sonnet 4.6 / fallback Haiku 4.5），含 LLM-Ops 包裹 + 降級鏈；任何模組禁繞過
- **連結 ID**：`crypto.randomBytes(16)`→base64url（≥128bit；明確不用 UUIDv4）
- **影像儲存**：VPS 本機 Docker named volume（非 DB）
- **🔴 FR50**：逐字實作 `src/lib/money/settle.ts` 確定性規格（IRC 先折抵→母行 net_cents；最大餘數法 + 穩定排序；整數分；零捨入洩漏）
- **CI（GitHub Actions）**：lint + type-check + 可執行斷言 `parsed_sum==2208.50` + 不變量 `settlement_sum==parsed_sum` + 3–5 條件變異回歸測資；綠燈才部署
- **觀測**：Sentry + Postgres 結構化 LLM 成本 log
- **備份**：compose 內 nightly `pg_dump` 輪替（off-host 副本 v1 不做）
- **無 cache**（stage-0 playbook）；DAU<10k 不引入 microservices/sharding/autoscaling/websocket/Redis
- **架構 Important gap（補為 explicit story note）**：
  - G1：FR37 收據縮圖服務端點 `api/splits/[linkId]/receipt`（依連結授權、隨 session 到期 410、回已遮影像）
  - G2：pg-boss 自建 schema/表**不**納入 Drizzle `schema.ts`/migration；Epic 1 初始化序＝Drizzle migrate → pg-boss start
- **橫切（不得獨立成技術 epic，附掛能力 epic 的 story 驗收）**：LLM-Ops（NFR-L1–L5）、回歸測資、device-token 授權、noindex 三重、到期可驗證銷毀
- **Epic 依賴順序（不可倒置）**：scaffold → 解析 → 核對閘門 → 連結 → 身份/認領/看板 → 結算 → 生命週期/濫用

### UX Design Requirements

來自 UX Design Specification（first-class input，逐項可生成可測 story）：

- **UX-DR1**：shadcn/ui 初始化（Radix + Tailwind v4，copy-in 至 `src/components/ui/`）；中性 design tokens（OKLCH 語意色、8px spacing scale、最小點擊區 ≥44px）寫入 Tailwind theme
- **UX-DR2**：**ReceiptLineRow** —— 單一事實來源列元件，variants：`claim`/`review`(可疑行高亮+逐行編輯+IRC改綁)/`pending`(斜線+標籤)/`readonly`(凍結)；認領看板/核對閘門/結算唯讀**皆複用此元件，禁各畫面另造列**
- **UX-DR3**：**StickySubtotalBar**（頂部黏性）——「我應付 ¥X」+ 信任標示，states：verified(綠✓對得上)/mismatch(紅+差額¥X)/unverified(琥珀)；金額 tabular-nums，輪詢就地更新不跳動
- **UX-DR4**：**ReconciliationGate** —— 差額橫幅 + 可疑行高亮 + 一鍵定位跳行 + 逃生口（手動輸入總額 Input、未驗證強制放行需 Dialog 二次確認 + 明示後果）；恆有可前進按鈕
- **UX-DR5**：**WeightedShareControl** —— A:5/B:3 單手 stepper，預設均分，每認領者 +/- ≥44px，即時重算小計
- **UX-DR6**：**IdentityPicker** —— 「哪個是你」名單（Sheet/Dialog）選/新增/改選；device-token 綁定；同團名字 localStorage 記憶
- **UX-DR7**：**PayerAbsorbGate** —— 常駐「N項/¥Z未認領」橫幅 + 「結束分帳並吸收剩餘」鈕（與其他鈕拉開、Dialog 二次確認、明示後果、不可誤觸/不可靜默/無超時）
- **UX-DR8**：**MessageCard** —— 防詐騙分享卡（日期/總額/品項數/付款人，非裸 URL）+ 系統分享/複製
- **UX-DR9**：**ParseProgress** —— 非阻塞 job 進度（queued/processing/succeeded/failed/degraded）；失敗走友善訊息+重試（不外洩原始錯）
- **UX-DR10**：**UnverifiedBanner** —— 「未經對帳驗證」橫幅向所有認領者頁傳播（FR15）
- **UX-DR11**：**PlaintextSettlementExport** —— 純文字結算區塊 + 一鍵複製
- **UX-DR12**：**ClaimerChips** —— 列內認領者頭像 chip（方向 D 看板內嵌）；輪詢穩定 key 就地 diff、保留捲動、變更行柔和高亮，**不重排不閃爍**（FR47–49 核心規範）
- **UX-DR13**：設計方向＝D 看板內嵌清單 + A 頂部黏性小計 + C「未認領」filter chip（全部/我的/未認領，非分頁跳轉）
- **UX-DR14**：互動模式一致性——按鈕階層（每屏至多 1 Primary；危險/定案動作必 Dialog 二次確認+明示後果，禁與 Primary 相鄰）；回饋三重編碼（色+圖示+文字，色盲可辨）；錯誤永不外洩原始訊息+恆有下一步
- **UX-DR15**：響應式——行動單欄優先（iOS Safari + Android Chrome 為主），桌面僅單欄置中可用（不做專屬版面）；safe-area inset；鍵盤不遮黏性 CTA；`inputmode=decimal`
- **UX-DR16**：無障礙＝NFR-A1 務實基本級，明確不設 WCAG AA（NFR-A2）；下游 epic 不得擅自升級為 AA 目標
- **UX-DR17**：唯讀降級態（定案/遲到者）——整頁唯讀 + 明確「已結清」標示 + 引導（找付款人線下），非 disabled 灰畫面

### FR Coverage Map

- FR1–FR7: Epic 1 — 拍照擷取與單次視覺 LLM 解析、IRC 折抵、#5564 結構硬鎖
- FR8–FR16: Epic 2 — 自我對帳與核對閘門（含逃生口、永不卡死）
- FR17–FR19: Epic 3 — 不可猜連結與防詐騙訊息卡分享
- FR20–FR25: Epic 4 — 免註冊 device-token 身份與「是不是你」名單
- FR26–FR34: Epic 4 — 逐行認領、加權分攤、即時小計、undo、競態、變更紀錄
- FR35–FR42: Epic 5 — 結算頁、信任標示、收據縮圖、純文字匯出、顯式吸收、定案凍結、遲到者降級
- FR43: Epic 1 — 上傳前遮蔽會員卡號（屬拍照上傳體驗）
- FR44: Epic 6 — 連結到期 30 天可驗證銷毀影像/claims
- FR45: Epic 6 — 全站 noindex/反搜尋索引
- FR46: Epic 1 — 解析端點 per-session/per-IP 預算上限（附掛解析端點）
- FR47–FR49: Epic 4 — 認領狀態看板（誰加入/誰領了什麼/PENDING）
- FR50: Epic 5 — VAT 內含直接加總結算規格（lib/money/settle）

全 50 FR 覆蓋，零遺漏。

## Epic List

### Epic 1: 拍照解析——付款人拍收據得到看得懂的逐行明細
付款人拍一張 #5564 同結構收據，非阻塞解析出還原品名、IRC 已折抵、
含稅金額的逐行明細並完成自我對帳計算。
**FRs covered:** FR1, FR2, FR3, FR4, FR5, FR6, FR7, FR43, FR46
**內嵌（不獨立成技術 epic）:** Story 1＝scaffold（create-next-app +
Docker Compose web/db/worker + Drizzle schema + shadcn init + CI 跑
`parsed_sum==2208.50`）；LLM-Ops NFR-L1–L5 + 降級鏈 NFR-R1 + 3–5 條件
變異回歸測資為 story 驗收條件；G2 pg-boss 自建表不納 Drizzle migration
（初始化序 Drizzle migrate→pg-boss start）；FR43 上傳前遮卡號、FR46
parse 端點預算上限附掛此能力。

### Epic 2: 核對閘門——付款人核對修正並信任金額對得上
付款人掃一眼可疑行、逐行修正、永不被卡死（逃生口），達成「✓ 對得上
總計」或明示「未驗證強制放行」。
**FRs covered:** FR8, FR9, FR10, FR11, FR12, FR13, FR14, FR15, FR16
**內嵌:** ReconciliationGate（UX-DR4）、ReceiptLineRow `review` variant
（UX-DR2）、UnverifiedBanner 起源（FR15/UX-DR10）、NFR-R2 永不卡死。

### Epic 3: 出連結——產生不可猜連結與防詐騙訊息卡分享
核對完成後產生 ≥128bit 不可猜連結 + 可分享訊息卡，貼回外部群組。
**FRs covered:** FR17, FR18, FR19
**內嵌:** 連結 ID NFR-S1（crypto 16-byte base64url，非 UUIDv4）、
MessageCard（UX-DR8）。

### Epic 4: 朋友自助認領——免註冊進入、認領/加權分攤、即時小計與狀態看板
朋友開連結、綁本機 token、選身份、逐行認領（單品項可多人加權）、
即時看到自己應付小計，並於同畫面看板看到誰加入/誰領了什麼/PENDING。
**FRs covered:** FR20, FR21, FR22, FR23, FR24, FR25, FR26, FR27, FR28,
FR29, FR30, FR31, FR32, FR33, FR34, FR47, FR48, FR49
**內嵌（身份+認領+看板共用同一認領畫面/核心檔案，合併為含有序 stories
的單一 epic）:** device-token 授權 NFR-S2、TanStack 樂觀/輪詢
NFR-P3/P4、ClaimerChips 就地 diff 不閃爍（UX-DR12，FR47–49 核心規範）、
IdentityPicker（UX-DR6）、WeightedShareControl（UX-DR5）、
ReceiptLineRow `claim` variant、競態 FR33/NFR-SC1、undo FR31。

### Epic 5: 結算與結束——應付金額、信任標示、付款人顯式吸收、定案凍結
各人看應付（誰欠誰）、✓ 對得上總計、收據縮圖、一鍵純文字匯出；
付款人顯式吸收剩餘並定案凍結；遲到者唯讀降級。
**FRs covered:** FR35, FR36, FR37, FR38, FR39, FR40, FR41, FR42, FR50
**內嵌:** 🔴 FR50 逐字實作 `lib/money/settle.ts` 確定性規格（IRC 先折抵、
最大餘數法+穩定排序、整數分）+ CI 不變量 `settlement_sum==parsed_sum`；
PayerAbsorbGate（UX-DR7，不可誤觸/不可靜默/無超時）；G1 FR37 收據
縮圖端點 `api/splits/[linkId]/receipt`（依連結授權、到期 410、回已遮
影像）；唯讀降級態（UX-DR17）；PlaintextSettlementExport（UX-DR11）。

### Epic 6: 資料生命週期與隱私——到期可驗證銷毀與反被發現
連結 30 天到期時銷毀收據影像與認領資料（銷毀可驗證）；全站不被搜尋
引擎索引。使用者資料不被長留、分帳不被外部發現。
**FRs covered:** FR44, FR45
**內嵌:** lifecycleWorker 排程銷毀 + 刪後存在性/雜湊檢查（NFR-S4）；
noindex 三重（layout meta + middleware + robots.txt，NFR-S6）。

**依賴鏈（線性、無前向依賴，對齊 Architecture Implementation Sequence）:**
Epic 1 → Epic 2 → Epic 3 → Epic 4 → Epic 5 → Epic 6。每 epic standalone
可交付使用者價值，不需後續 epic 才能運作。

## Epic 1: 拍照解析——付款人拍收據得到看得懂的逐行明細

付款人拍一張 #5564 同結構收據，非阻塞解析出還原品名、IRC 已折抵、
含稅金額（整數分）的逐行明細並完成 parsed_sum 計算。

### Story 1.1: 專案骨架與 CI 基線

As a 開發者（n=1），
I want 依架構 starter 指令建立可運行骨架與 CI，
So that 後續所有能力 story 有一致、可驗證的基底（greenfield 起手）。

**Acceptance Criteria:**

**Given** 空 repo
**When** 執行 `pnpm create next-app@latest splitting-tools --ts --tailwind --eslint --app --turbopack --src-dir --use-pnpm --import-alias "@/*"`
**Then** 專案建立、`tsconfig.json` 設 `strict:true`、shadcn/ui 初始化於 `src/components/ui/`
**And** `docker-compose.yml` 含 `web`/`db`(Postgres)/`worker` 三服務可 `docker compose up`

**Given** 骨架已建
**When** 初始化資料層與佇列
**Then** Drizzle 設定 + 初始 migration（最小表：sessions、parse_jobs、llm_costs、rate_counters）
**And** 初始化序為 Drizzle migrate → pg-boss start；pg-boss 自建 schema/表**不**納入 Drizzle `schema.ts`（架構 gap G2）

**Given** CI 設定
**When** push 觸發 GitHub Actions
**Then** 跑 lint + type-check + 回歸測試 harness（含 `parsed_sum==2208.50` 佔位斷言、`settlement_sum==parsed_sum` 佔位）
**And** Sentry 接線；任一紅燈阻擋部署

### Story 1.2: 收據拍照/相簿擷取、前端壓縮與卡號遮蔽

As a 付款人，
I want 用相機或相簿選一張收據並在上傳前壓縮、遮住會員卡號，
So that 控制傳輸量且不外洩卡號（FR1, FR2, FR43）。

**Acceptance Criteria:**

**Given** 付款人在首頁
**When** 點「拍收據」
**Then** 開啟 `<input type="file" accept="image/*">`（**不寫死 `capture`**：iOS Safari 會強制相機並移除相簿選項；由 OS 原生選單提供拍照／相簿／檔案）〔2026-05-19 AC1 修正〕
**And** 前端壓縮至長邊 ~1600px

> 〔2026-05-19 CIP〕單張不夠拍長收據 → 多頁能力由 **Story 1.2b** 承載（本 story 維持 done，不改寫）。

**Given** 已選影像
**When** 上傳前
**Then** 可遮蔽會員卡號區域，且**僅已遮影像**離開裝置（NFR-S3）
**And** 伺服器不接收/不保留未遮原圖

### Story 1.2b: 多頁長收據擷取（CIP 2026-05-19，多頁拉進 v1）

As a 付款人，
I want 一張拍不完的長收據可以分段多拍幾張、依序組成同一張收據，
So that Costco 那種超長收據也能完整解析（FR1 擴充；見 `docs/PRD-multi-page-receipt-roadmap.md`）。

**Acceptance Criteria:**

**Given** 已擷取一頁（壓縮+遮罩完成）
**When** 付款人選「再拍下一段」或從相簿多選
**Then** 加入**有序頁面清單**；每頁各自遮卡號（NFR-S3 不變，逐頁）；可移除/重排頁；可「完成」
**And** 輸出為**有序的已遮+已壓縮 blob 陣列**（非單一 blob）

**Given** 多頁清單
**When** 完成擷取
**Then** 頁面去重 + 穩定排序（重複/缺頁交由 Epic 2 對帳閘門兜底）；UI 維持小工具級極簡（「再拍下一段／完成」，不做重型頁面管理器）

> 範圍鐵則：本 story 是唯一真 retrofit（隔離於此，1.2 維持 done）。多頁解析準確率 n=0 → 回歸測資須加真·多頁案例（`deferred-work.md#W-CR-5`）。

### Story 1.3: 非阻塞解析提交與進度輪詢

> 〔CIP fold-in〕上傳改為**有序 N 個已遮 blob**；job 帶頁數。create-story 時併入 AC。

As a 付款人，
I want 提交後立即拿到工作識別並看到進度，
So that 解析不阻塞、賣場弱網也可見進展（FR3, NFR-P1, NFR-L4）。

**Acceptance Criteria:**

**Given** 已遮影像上傳
**When** POST 至解析端點
**Then** 入 pg-boss job 並於 p95 < 1s 回 `jobId`（不阻塞 request thread）

**Given** 持有 jobId
**When** 前端輪詢 job 狀態端點
**Then** 回 `queued|processing|succeeded|failed|degraded`，ParseProgress 元件呈現（非黑箱轉圈）

### Story 1.4: 單次視覺 LLM 解析與縮寫品名還原（LLM-Ops 包裹）

> 〔CIP fold-in〕推薦：**單次 Claude vision 呼叫帶 N 張影像**（原生多圖、單筆 cost 紀錄、對帳較單純）vs 逐頁+合併——於 create-story 拍板；cost×N 寫入 `llm_costs`。

As a 付款人，
I want 系統把天書縮寫收據解析成可辨識逐行品項，
So that 我不必逐行打帳（FR4, FR5；NFR-L1–L5, NFR-R1）。

**Acceptance Criteria:**

**Given** worker 取得解析 job
**When** 呼叫視覺 LLM
**Then** 經唯一 `src/lib/llm/visionAdapter`（primary claude-sonnet-4-6）單次呼叫，回傳過 Zod schema 驗證為逐行品項（品名、數量、金額）
**And** 縮寫品名還原為可辨識名稱

**Given** LLM 呼叫
**When** 發生 5xx/429 或失敗
**Then** 指數退避+jitter 重試 ≥3 → 降級 claude-haiku-4-5 → 快取/靜態 fallback → 友善訊息（原始錯誤不外洩）
**And** 每次呼叫寫結構化 log（model/prompt_tokens/completion_tokens/latency_ms/cost_usd/session_id/request_id/success）入 `llm_costs`，成本 per-session-day 持久化

**Given** 回歸測資 #5564
**When** CI 執行
**Then** 解析為 28 行（含 3 筆 IRC）、`parsed_sum==2208.50` 斷言綠燈
**And** 另含 3–5 張條件變異（褪色/過曝/超長/折疊）回歸測資

### Story 1.5: IRC 折扣自動配對母品項與 parsed_sum 計算

> 〔CIP fold-in〕`parsed_sum = Σ 跨所有頁 net_cents − IRC`；印製總計通常只在某一頁；頁去重/排序前置於 Story 1.2b。

As a 付款人，
I want IRC 即時折扣自動折抵到對應母品項並算出解析總額，
So that 後續分帳金額正確（FR6；FR50 前置資料基礎）。

**Acceptance Criteria:**

**Given** 解析逐行（含負值 IRC 行）
**When** 執行 IRC 配對
**Then** 每筆 IRC 歸屬母行，母行 `net_cents = gross_cents + Σ(其 IRC, 皆負)`，IRC 不獨立成可認領行
**And** 每行記 `net_cents` 與 `irc_attributed_to`

**Given** 全部行 net_cents
**When** 計算
**Then** `parsed_sum = Σ net_cents`（整數分；#5564 = 220850 分）

### Story 1.6: 非 #5564 結構收據明確拒絕

> 〔CIP fold-in〕結構檢查需處理多頁（逐頁結構 + 跨頁連續性）。

As a 付款人，
I want 系統在收據結構不支援時明確告知，
So that 不被靜默誤算（FR7，v1 硬鎖）。

**Acceptance Criteria:**

**Given** 上傳影像解析後
**When** 偵測非 #5564 同結構（獨立稅行/不同稅碼佈局/不同幣別）
**Then** 明確拒絕並告知「v1 僅支援 #5564 同結構」，不產生分帳、不靜默誤算

### Story 1.7: 解析端點濫用/預算防護

> 〔CIP fold-in〕預算/rate 以**影像張數**計（非每 parse 1）；硬上限推薦 **≤5 頁/parse**，於 create-story 拍板。

As a 系統，
I want 對開放解析端點施加 per-session/per-IP 預算上限，
So that 免註冊開放連結不被濫用/惡意干擾（FR46, NFR-S7, NFR-L5）。

**Acceptance Criteria:**

**Given** 解析端點請求
**When** 同 session 或同 IP 超過預算上限
**Then** 以 Postgres `rate_counters` 計數判定，逾限回 429 拒絕
**And** 與 LLM 成本計數共用 Postgres，免 Redis

## Epic 2: 核對閘門——付款人核對修正並信任金額對得上

付款人掃一眼可疑行、逐行修正、永不被卡死，達「✓對得上總計」或明示
未驗證放行。

### Story 2.1: 對帳結果顯示（相符/差額）

As a 付款人，
I want 看到解析總額與收據印製總額是否一致，
So that 我知道這次解析對不對（FR8）。

**Acceptance Criteria:**

**Given** 解析完成
**When** 進核對閘門
**Then** StickySubtotalBar 顯示 `verified`（綠「✓對得上¥2,208.50」）或 `mismatch`（紅 + 具體差額¥X）
**And** 差額為具體數字，非僅「錯誤」

### Story 2.2: 可疑行標示與一鍵定位

As a 付款人，
I want 系統標出可疑行並讓我一鍵跳到它，
So that 我能快速抽檢而非逐行重看（FR9）。

**Acceptance Criteria:**

**Given** 解析結果
**When** 啟發式判定（單行佔比異常、品名疑似互換）
**Then** 該行高亮（色+圖示+文字三重編碼）
**And** 點「一鍵定位」捲動聚焦該行

### Story 2.3: 逐行編輯與增刪行

As a 付款人，
I want 修正品名/金額/數量並可增刪行，
So that 兜不攏時能改對（FR10, FR11）。

**Acceptance Criteria:**

**Given** 核對閘門（ReceiptLineRow `review` variant）
**When** 編輯品名/金額/數量或新增/刪除行
**Then** parsed_sum 即時重算、對帳狀態即時更新

### Story 2.4: 變更 IRC 折扣歸屬母品項

As a 付款人，
I want 改正 IRC 折扣綁錯的母品項，
So that 折扣折給正確的人（FR12）。

**Acceptance Criteria:**

**Given** 某 IRC 折扣
**When** 改綁至另一母行
**Then** 兩母行 `net_cents` 重算、parsed_sum 重算

### Story 2.5: 手動輸入印製總額

As a 付款人，
I want 在收據總計糊掉時手動輸入它，
So that 仍能對帳前進（FR13）。

**Acceptance Criteria:**

**Given** 印製總額無法辨識
**When** 付款人手動輸入該總額（帶單位提示的聚焦 Input）
**Then** 以此值對帳並顯示相符/差額

### Story 2.6: 未驗證強制放行與標示傳播

As a 付款人，
I want 連續兜不攏時仍能帶警示繼續，
So that 不被卡死在賣場（FR14, FR15）。

**Acceptance Criteria:**

**Given** 連續 N 次仍無法對帳
**When** 付款人選「未驗證強制放行」
**Then** 必經 Dialog 二次確認 + 明示後果，session 標記未驗證

**Given** 已未驗證放行
**When** 任何認領者開啟分帳
**Then** 所有認領者頁顯示「未經對帳驗證」橫幅（UnverifiedBanner）

### Story 2.7: 核對流程永不卡死保證

As a 付款人，
I want 核對流程任何狀態都有前進路徑，
So that 我永遠出得了賣場（FR16, NFR-R2）。

**Acceptance Criteria:**

**Given** 核對閘門任一狀態（相符/差額/讀不到總額/連續失敗/解析降級）
**When** 檢視畫面
**Then** 恆有可前進按鈕，無死路
**And** 測試覆蓋所有分支皆可抵達「產生連結」

## Epic 3: 出連結——產生不可猜連結與防詐騙訊息卡分享

### Story 3.1: 產生不可猜分帳連結

As a 付款人，
I want 核對後產生一條別人猜不到的分帳連結，
So that 連結即唯一存取憑證、外人無法枚舉（FR17, NFR-S1）。

**Acceptance Criteria:**

**Given** 核對通過或已未驗證放行
**When** 付款人按「產生連結」
**Then** 伺服器以 `crypto.randomBytes(16)`→base64url 產生 ≥128bit 連結 ID（非序列、非 UUIDv4）
**And** 連結即唯一憑證，未核對前不得產生

### Story 3.2: 防詐騙訊息卡產生

As a 付款人，
I want 拿到一張看起來不像詐騙的分享卡，
So that 朋友敢點開（FR18）。

**Acceptance Criteria:**

**Given** 連結已產生
**When** 產生分享內容
**Then** MessageCard 含日期、總額、品項數、付款人，非裸 URL

### Story 3.3: 分享至外部群組

As a 付款人，
I want 一鍵把連結/訊息卡分享出去，
So that 直接貼回既有群組（FR19）。

**Acceptance Criteria:**

**Given** 訊息卡已備
**When** 付款人按分享
**Then** 呼叫系統分享；不支援時退化為複製

## Epic 4: 朋友自助認領——免註冊進入、認領/加權分攤、即時小計與狀態看板

### Story 4.1: 免註冊進入與 device-token 身份綁定

As a 認領朋友，
I want 點連結直接進、同裝置再進仍是我，
So that 零註冊零守門（FR20, FR21, NFR-S2）。

**Acceptance Criteria:**

**Given** 收到連結
**When** 點開
**Then** 無需註冊/登入即進入分帳
**And** 前端 `crypto` 產生 device-token 存 localStorage；同裝置再進視為同一人；認領變更以 token 授權

### Story 4.2: 「是不是你」名單選/新增身份與名字記憶

As a 認領朋友，
I want 從名單挑「哪個是我」或新增，
So that 低摩擦認出自己、下次免再打（FR22, FR25）。

**Acceptance Criteria:**

**Given** 進入分帳且本機無已知身份
**When** 顯示 IdentityPicker
**Then** 可從既有名單選或新增身份
**And** 同團名字存 localStorage，下次自動帶出

### Story 4.3: 修正誤選身份（token 隔離）

As a 認領朋友，
I want 改正我選錯的身份，
So that 認領歸對人且不動到別人（FR23, FR24）。

**Acceptance Criteria:**

**Given** 已選身份
**When** 改選正確身份
**Then** 僅影響此 device-token 綁定之認領，無法變更他人 token 的認領

### Story 4.4: 逐行認領/取消與即時小計

As a 認領朋友，
I want 勾自己的品項並即時看到應付小計，
So that 勾完就知道付多少（FR26, FR29, NFR-P3, NFR-R3）。

**Acceptance Criteria:**

**Given** 認領清單（ReceiptLineRow `claim` variant）
**When** toggle 認領/取消某行
**Then** 樂觀更新感知 < 200ms，頂部黏性「我應付 ¥X」即時變動
**And** 認領變更持久化於 Postgres（程序重啟不丟）

### Story 4.5: 單品項多人加權分攤

As a 認領朋友，
I want 把整箱品項和別人按份額分，
So that 拿不一樣多也算得公平（FR27, FR28）。

**Acceptance Criteria:**

**Given** 某品項
**When** 設為多人分並用 WeightedShareControl 調份額
**Then** 預設均分，可改如 A:5/B:3（單手 +/- ≥44px）
**And** 我的小計依最大餘數法結果即時反映

### Story 4.6: 認領完成標示與復原

As a 認領朋友，
I want 標示認領完成、也能復原剛做的變更，
So that 收尾明確且可反悔（FR30, FR31）。

**Acceptance Criteria:**

**Given** 認領中
**When** 按「我認領完了」
**Then** 我的狀態標記完成（定案前仍可回改）

**Given** 剛做一次認領變更
**When** 按 undo
**Then** 復原該次變更

### Story 4.7: PENDING 狀態與競態伺服器權威

As a 系統，
I want 未認領維持 PENDING、近同時操作以伺服器為準，
So that ≤8 人不丟更新、不互相覆寫（FR32, FR33, NFR-SC1）。

**Acceptance Criteria:**

**Given** 某行無人認領
**When** 檢視
**Then** 維持 PENDING 狀態

**Given** 兩人近同時操作同一品項
**When** 輪詢回填
**Then** 以伺服器狀態為準解決競態、不互相覆寫；≤8 認領者不遺失更新；本地 onMutate rollback

### Story 4.8: 認領狀態看板（內嵌、輪詢不閃爍）

As a 認領朋友，
I want 同畫面看到誰加入、誰領了什麼、哪些沒人領，
So that 收尾不靠人催、社交壓力可見（FR47, FR48, FR49）。

**Acceptance Criteria:**

**Given** 認領畫面（方向 D 內嵌看板）
**When** 檢視
**Then** 顯示參與者名單、每行認領者 chips（含多人份額）、PENDING 行明顯

**Given** 2–3s 輪詢更新
**When** 狀態變化
**Then** 穩定 key 就地 diff、保留捲動位置、變更行柔和高亮，**不重排不閃爍**；閒置退避

### Story 4.9: 付款人檢視認領變更紀錄

As a 付款人，
I want 看到認領的變更歷程，
So that 有爭議時可追溯（FR34）。

**Acceptance Criteria:**

**Given** 認領發生變更
**When** 寫入
**Then** 記錄於 `claim_changes`

**Given** 付款人
**When** 檢視變更紀錄
**Then** 可看到誰於何時對哪行做了什麼變更

## Epic 5: 結算與結束——應付金額、信任標示、付款人顯式吸收、定案凍結

### Story 5.1: FR50 結算計算確定性純函式

As a 系統，
I want 以確定性規格算出每人應付，
So that Σ每人精確等於總額、跨 agent 一致（FR50）。

**Acceptance Criteria:**

**Given** 各行 `net_cents`（IRC 已折抵）與認領者權重
**When** 執行 `src/lib/money/settle.ts`
**Then** 加權分攤用最大餘數法 + 穩定排序（認領加入序 tie-break），整數分，`Σ allocated_i == net_cents`（零捨入洩漏）

**Given** 全分帳
**When** CI 執行
**Then** 不變量 `settlement_sum == parsed_sum`（= 印製總額）綠燈，違反即紅燈

### Story 5.2: 結算頁應付金額、信任標示與收據縮圖

As a 認領者，
I want 看到各人應付、是否對得上總計、可看收據縮圖，
So that 我信任這個數字（FR35, FR36, FR37；架構 gap G1）。

**Acceptance Criteria:**

**Given** 已認領
**When** 進結算頁
**Then** 顯示各人應付（誰欠誰）；若已通過對帳顯示「✓ 對得上總計 ¥X」信任標示

**Given** 結算頁
**When** 點收據縮圖
**Then** 經 `api/splits/[linkId]/receipt` 取得已遮影像（依連結授權、session 到期回 410）

### Story 5.3: 純文字結算匯出一鍵複製

As a 認領者，
I want 一鍵複製可貼回群組的純文字結算，
So that 直接貼群、無需教學（FR38, NFR-P5）。

**Acceptance Criteria:**

**Given** 結算頁
**When** 按「複製純文字」
**Then** 純前端產生純文字摘要並複製到剪貼簿（即時）

### Story 5.4: 付款人 PENDING 提示與顯式吸收定案

As a 付款人，
I want 看到未認領提示並主動吸收剩餘才定案，
So that 絕不被靜默坑（FR39, FR40）。

**Acceptance Criteria:**

**Given** 有未認領品項
**When** 付款人在結算頁
**Then** 常駐「N 項／¥Z 未認領」橫幅（PayerAbsorbGate，與其他鈕拉開）

**Given** 付款人決定結束
**When** 按「結束分帳並吸收剩餘」
**Then** 必經 Dialog 二次確認 + 明示後果才定案；不超時、不靜默

### Story 5.5: 定案凍結唯讀與遲到者降級

As a 系統/遲到認領者，
I want 定案後一切唯讀、遲到者看到已結清，
So that 已定案資料不被改動、遲到者不被當壞人（FR41, FR42, NFR-S5）。

**Acceptance Criteria:**

**Given** 付款人已定案
**When** 任何寫入請求
**Then** 拒絕（423），無路徑改動已定案資料

**Given** 遲到者於定案後開啟
**When** 進入
**Then** 唯讀結算 + 明確「已結清」標示 + 引導（找付款人線下），非 disabled 灰畫面

## Epic 6: 資料生命週期與隱私——到期可驗證銷毀與反被發現

### Story 6.1: 連結 30 天到期可驗證銷毀

As a 系統，
I want 連結到期時銷毀影像與認領資料且可驗證，
So that 使用者資料不被長留（FR44, NFR-S4）。

**Acceptance Criteria:**

**Given** 連結建立滿 30 天
**When** lifecycleWorker 排程執行
**Then** 刪除 VPS volume 影像檔與該 session 之 claims 資料

**Given** 銷毀完成
**When** 驗證
**Then** 做刪後存在性/雜湊檢查，銷毀結果可驗證並記錄

### Story 6.2: 全站反搜尋索引

As a 系統，
I want 所有分帳頁面不被搜尋引擎索引，
So that 私密分帳不被外部發現（FR45, NFR-S6）。

**Acceptance Criteria:**

**Given** 任一頁面
**When** 被爬蟲或使用者存取
**Then** 回 `<meta name="robots" content="noindex,nofollow">` + middleware 兜底 header + `robots.txt` disallow
**And** 無 sitemap、無公開可發現入口
