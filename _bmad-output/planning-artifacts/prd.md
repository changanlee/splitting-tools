---
stepsCompleted: ['step-01-init', 'step-02-discovery', 'step-02b-vision', 'step-02c-executive-summary', 'step-03-success', 'step-04-journeys', 'step-05-domain-skipped', 'step-06-innovation-skipped', 'step-07-project-type', 'step-08-scoping', 'step-09-functional', 'step-10-nonfunctional', 'step-11-polish', 'step-12-complete']
releaseMode: 'phased'
inputDocuments:
  - '_bmad-output/planning-artifacts/product-brief-splitting-tools.md'
  - '_bmad-output/planning-artifacts/product-brief-splitting-tools-distillate.md'
  - '_bmad-output/brainstorming/brainstorming-session-2026-05-17-1812.md'
documentCounts:
  briefs: 2
  research: 0
  brainstorming: 1
  projectDocs: 0
workflowType: 'prd'
projectType: 'greenfield'
classification:
  projectType: 'web_app'
  domain: 'general'
  complexity: 'low'
  projectContext: 'greenfield'
  note: '字面像 fintech，但使用者明令無金流/帳本/收款，刻意判為 general/low，PRD 不長合規章節'
note: 'config project_name 被安裝器預設為使用者名「長安」；本 PRD 以實際專案 splitting_tools 命名。'
---

# Product Requirements Document - splitting_tools（Costco 分帳小工具）

**Author:** 長安
**Date:** 2026-05-18

> **可追溯鏈**：Vision → Success Criteria → User Journeys → Functional Requirements。
> 每條 FR 可回溯至某段使用者旅程或執行摘要；下游 UX／架構／epic 僅實作 FR 所列能力。

## Executive Summary

splitting_tools 是個人／朋友共用的 Costco 收據拍照分帳小工具，**非商業產品**——
無金流、無收款、無滾動帳本、無商業模式，永久不在範圍內。錢從不經過此工具；
它只回答「誰點了哪幾行 → 各自加總多少」，等同一台用完即走的共享計算機。

解決的真痛點不是算數，是**動機與時機**：購物回家後對著縮寫天書收據沒人想當會計；
整箱商品當下誰拿幾個不講清，事後在群組吵不清。因此解法不是更強的計算器，
而是把分帳塞進「結帳當下、人都還在、低摩擦」那個時間窗。

核心流程：付款人拍收據 → 單次視覺 LLM 解析品項並自動把 IRC 即時折扣配對回母品項
＋自我對帳（解析總額 vs 收據印製總額）→ 付款人核對／修正關卡（有底有逃生口，永不卡死）
→ 產生不可猜免註冊連結＋可貼訊息卡，貼進群組 → 朋友開連結，身份綁本機 token，
自助認領／移除自己的品項（未認領＝PENDING，付款人須**顯式**按鈕吸收，非靜默）
→ 單一品項可多人加權分攤（A:5／B:3）→ 每人應付＝自己認領各行金額之和。

目標使用者：發起購買的付款人，與同行 2–6 名無帳號朋友。
成功定義：賣場或車上當下完成分帳，零事後群組補算。

### What Makes This Special

- **時機而非計算**：價值在把分帳發生在結帳當下、人都還在的低摩擦窗口，不是做更強算式。
- **單次視覺 LLM ＋自我對帳**：不堆傳統 OCR pipeline；對帳是「免費的正確性尺」，
  證明這次解析正確，而非因 LLM 不可信而補救。真實蘇州 Costco #5564 已驗證命中
  ¥2,208.50（含 3 筆 IRC 折扣抵減）。
- **免註冊不可猜連結 ＋ 本機 token 綁身份**：零守門（對照 Splyt「強迫先邀朋友」被罵爆），
  同時補上免註冊最大缺口——認領完整性。
- **PENDING ＋ 付款人顯式吸收**：未認領不靜默歸付款人，必須主動按鍵定案；
  此為對抗評審揪出的最大設計反轉（靜默坑付款人）。
- **加權份額**：整箱比例可直接表達（拿量 10:20 ＝ shares 1:2），比逐項 0/50/100% 細。

**誠實限制（非賣點，是已知風險）**：可行性僅單張收據驗證，準確率 n=1 未知；
v1 硬鎖只接受 #5564 同結構收據，異結構即拒絕；自我對帳只證總額、不證逐行品名／
IRC 歸屬正確，故核對關卡須含肉眼抽檢層。

## Project Classification

- **專案類型**：web_app（行動優先 SPA；無 SEO——私密連結刻意反被搜尋；免註冊連結存取；
  v1 輪詢非 websocket；無原生 App）
- **領域**：general，複雜度 **LOW**。字面含「收據／分帳／金額」會被誤歸 fintech（HIGH，
  自動長出 PCI DSS／KYC／稽核／詐欺合規章節）；因無金流／帳本／收款，**刻意判定 general/LOW**，
  PRD 不長合規章節。
- **專案脈絡**：greenfield（無既有程式碼或專案文件）

## Success Criteria

### User Success

- **付款人**：拍一張照 → 核對關卡手動修正 ≤ ~3 項即過關（非逐行重打）→ 出連結貼群；
  全程在賣場或車上完成，回家前結束。情緒成功點＝「不必當會計」。
- **朋友**：開連結無需任何口頭解釋即能認出「哪個是我」、勾完自己品項、看到應付數字、
  複製貼回群。零註冊、零學習曲線。
- **「完成」的定義**：群組貼出一段純文字「誰各付多少 ✓對得上總計 ¥X」，
  事後無人追問、無人被靜默多付。

### Business Success（非商業——重定義為「專案成功」）

明確聲明：本工具**無營收／用戶成長／留存目標**，這些刻意 OUT。
對非商業小工具，"business success" 重定義為：
- **真實 dogfood 至少一次**：一趟真實 Costco 行程，付款人 ＋ ≥2 朋友全程用它分完，
  零事後群組補算。
- **維持「小工具」本性**：用完即走，未長出帳本／金流／帳號／商業化
  （範圍紀律本身即成功指標）。
- 對此 n=1 使用圈，「手動算 Costco 分帳」這件事消失。

### Technical Success

- 視覺 LLM 對真實 #5564：可執行回歸斷言 `parsed_sum == 2208.50`
  （含 3 筆 IRC 折扣抵減）綠燈。
- 自我對帳閘門：總額相符自動通過；兜不攏有手動輸入 ＋ N 次後「未驗證強制放行」
  逃生口，**永不卡死付款人**。
- side-project 非協商標準（LLM 邊界）達標：指數退避重試、結構化 log
  （model／tokens／latency／cost／session_id）、成本追蹤持久化於 Postgres、
  >1s 走 job_id＋輪詢、parse 端點 per-session／per-IP 預算上限。
- 認領完整性：身份綁本機 token；每人只能改自己裝置認領；變更可 undo ＋
  付款人可見變更紀錄；結清後 session 凍結唯讀；連結 30 天到期銷毀影像／claims。

### Measurable Outcomes

- 手動修正 ≤ ~3 項過關（單次 dogfood 觀察，非統計樣本）
- `parsed_sum == 2208.50` 斷言 pass（CI 可跑）
- 零「未認領被靜默吃掉」事件（由 PENDING ＋ 顯式吸收強制達成）
- 朋友端零口頭解釋完成（dogfood 觀察）
- 自我對帳通過＝**前置條件，非成果指標**（明確標註，禁止當 KPI 慶祝）

## Product Scope

本節為**分期權威定義**（releaseMode: phased，沿用上游 SSOT 既定分期）；
能力細節見 Functional Requirements，本節僅定相位邊界。

### MVP - Minimum Viable Product (v1)

v1 能力 = **Functional Requirements FR1–FR50 全集**（含核對閘門、認領、加權份額、
認領狀態看板、結算、隱私生命週期、濫用防護）。v1 邊界另含兩項硬約束：

- **v1 硬鎖**：只接受 #5564 同結構收據，異結構即明確拒絕（FR7）。
- **n=1 防線**：#5564 可執行回歸斷言 `parsed_sum == 2208.50` ＋ 3–5 張條件變異
  （褪色／過曝／超長／折疊）回歸測資，皆為 v1 交付物。

### Growth Features (Post-MVP / v2 backlog)

SSOT 既定 v2，**非本期實作**：比例攤稅 fallback、即時看板真同步（取代輪詢）、
結算自動最少轉帳、按數量拆專屬 UI、非 Costco 收據結構通用化。

> **Step 8 共識證據（保留）**：草稿曾將「3–5 張條件變異回歸測資」誤置於此
> Post-MVP；經使用者裁示**修正回 v1 MVP**（理由：n=1 準確率風險的唯一防線，
> 不得延後）。此修正為明示共識，不得再次靜默降級。

### Vision (Future)

- 維持小工具本質：對更多賣場收據結構穩健解析。
- **永久 OUT（定義上不做，非未做）**：金流、收款、滾動帳本、帳號體系、商業化。

## User Journeys

四條旅程覆蓋兩種使用者（付款人／朋友）× 順流與逆境；每條結尾標注其揭示的能力，
經 Functional Requirements 收斂為可實作契約。

### Journey 1｜付款人 · 順流（核心體驗）

**開場**：阿哲跟 4 個朋友逛完蘇州 Costco，推兩車出來，收據一長條縮寫天書。
以前回家要在群組當會計，沒人想對帳。

**上升**：停車場推車時掏手機拍收據 → 前端壓縮上傳 → 看到 job 進度條
（不阻塞）→ 數秒後逐行品名已還原、3 筆 IRC 折扣自動配對回母品項、
底部「解析 ¥2,208.50 ✓ 對得上收據印製總額」。

**高潮**：核對關卡掃一眼可疑行（無單行佔比異常），改了 1 個品名、
把 1 筆折扣改綁正確母品項——3 項內過關。按「確認並產生連結」。

**收束**：拿到不可猜連結 ＋ 一張訊息卡（日期／總額／品項數／我是付款人），
直接貼進群組，回車上前就發出去了。心理狀態：解脫，沒當會計。
→ 揭示能力：拍照壓縮上傳、async job＋輪詢、視覺 LLM 解析、IRC 配對、
自我對帳顯示、可疑行抽檢 UI、逐行編輯、連結＋訊息卡產生。

### Journey 2｜付款人 · 逆境（解析兜不攏／逃生口）

**開場**：收據被冷藏袋壓出水漬，總計那行糊掉。

**上升**：解析回來，自我對帳紅字「解析 ¥2,180 ≠ 印製總額（讀不到）」。
阿哲手動輸入印製總額 ¥2,208.50 → 仍差 ¥28.50，逐行找到一筆數量被讀成 1
（實際 2），改正 → 對上。

**逆境分支**：若連續 N 次仍兜不攏 → 出現「未驗證強制放行」，
按下後連結照常產生，但**所有認領者頁面顯示「未經對帳驗證」橫幅**。
付款人從不被卡死。

**收束**：寧可帶警示出門，也不卡在賣場。
→ 揭示能力：對帳失敗態、手動輸入總額、逐行修正回流、
N 次後強制放行、未驗證橫幅向下游傳播。

### Journey 3｜朋友 · 順流（自助認領）

**開場**：小美在群組看到訊息卡，點連結。

**上升**：免註冊直接進；頁面列出名單問「哪個是你？」她選「小美」
（身份綁本機 token，下次同裝置自動是她）。逐行勾自己的東西；
那箱衛生紙她和阿哲一起拿——點該品項「多人分」，設 小美:1 / 阿哲:1（均分），
即時看到自己小計，也看到看板上誰已加入、別人勾了哪些、哪些還沒人領。
勾完按「我認領完了」。

**高潮**：結算頁看到「小美 應付 ¥412 ✓對得上總計 ¥2,208.50」，
可點收據縮圖核對。

**收束**：一鍵複製純文字貼回群組。全程無人需口頭解釋。
→ 揭示能力：免註冊進入、本機 token 身份、名單挑「是不是你」、
逐行認領／取消、單品項多人加權份額、即時小計、**認領狀態看板（誰加入/
誰領了什麼/誰未領）**、信任標記、收據縮圖、純文字匯出、同團名字記憶。

### Journey 4｜朋友 · 逆境（認錯人／爭議品項／遲到者）

**認錯身份**：阿凱誤選「小華」→ 發現後可改選正確身份；
每人只能改自己**裝置 token**綁定的認領，改不到別人的。

**同品項競態**：兩人幾乎同時把同一箱可樂加進「多人分」——
輪詢回來看到對方已在份額名單，介面顯示更新後狀態而非互相覆蓋。

**遲到者**：收據已被付款人按「結束分帳並吸收剩餘」定案、session 凍結唯讀。
阿凱才點開——看到唯讀結算頁與「已結清」標示，知道找付款人線下處理，
不會靜默改動已定案資料。

**未認領**：沒人領的 2 項顯示 PENDING；付款人結算頁常駐
「2 項／¥86 未認領」橫幅，必須**主動**按「結束分帳並吸收剩餘」才定案，
絕不超時靜默歸付款人。
→ 揭示能力：身份可改＋token 隔離、認領變更含 undo、付款人可見變更紀錄、
輪詢競態處理、PENDING 狀態、付款人顯式吸收閘門、結清凍結唯讀、
遲到者唯讀降級。

### Journey Requirements Summary

| 能力區塊 | 由哪些旅程揭示 |
|---|---|
| 拍照壓縮 ＋ async job ＋ 輪詢 | J1, J2 |
| 視覺 LLM 解析 ＋ IRC 配對母品項 | J1 |
| 自我對帳顯示（通過／失敗態） | J1, J2 |
| 可疑行抽檢 ＋ 逐行編輯 ＋ 修正回流 | J1, J2 |
| 對帳逃生口（手動輸入總額、N 次強制放行、未驗證橫幅傳播） | J2 |
| 不可猜連結 ＋ 訊息卡 | J1 |
| 免註冊進入 ＋ 本機 token 身份 ＋「是不是你」名單 | J3, J4 |
| 逐行認領／取消 ＋ 即時小計 | J3 |
| 單品項多人加權份額（預設均分、可改 A:5/B:3） | J3 |
| 認領狀態看板（誰加入／誰領了什麼／哪些未領） | J3, J4 |
| 認領變更 undo ＋ 付款人可見變更紀錄 ＋ token 隔離 | J4 |
| 輪詢競態處理（同品項同時操作） | J4 |
| PENDING ＋ 付款人顯式吸收閘門 | J4 |
| 結清凍結唯讀 ＋ 遲到者唯讀降級 | J4 |
| 結算頁：誰欠誰 ＋ ✓對得上總計 ＋ 收據縮圖 ＋ 純文字匯出 ＋ 名字記憶 | J3 |

**不適用旅程（刻意排除，非遺漏）**：Admin／Operations、Support／Troubleshooting、
API／Integration——本工具零營運、無帳號後台、無對外 API、用完即走，
這三類使用者不存在。

## Web App Specific Requirements

### Project-Type Overview

行動優先的單頁式（SPA 風格）Web 應用，由單一全端 monolith 服務
（具體框架於 Phase 3 架構決定）。兩個面向：付款人流（拍照→輪詢→核對閘門→出連結）、
朋友流（開連結→綁本機 token→認領→結算）。無原生 App、無 CLI、無對外 API。

### Technical Architecture Considerations

- **單體全端**：單一服務 ＋ Postgres 存 session／claims；DAU<10k 不引入
  microservices／websocket（side-project 標準）。
- **非同步解析**：拍照解析 >1s → 回 job_id ＋ 前端輪詢，不阻塞 request thread。
- **狀態同步**：v1 認領看板用輪詢（建議 2–3s，競態以伺服器狀態為準、樂觀更新本地）；
  真即時同步列 v2 backlog。
- **無 SEO / 反索引**：所有頁面 `<meta name="robots" content="noindex,nofollow">`
  ＋ robots.txt disallow；連結 ID 不可猜；訊息卡非裸 URL。屬隱私需求。

### Browser Support Matrix

- **主要**：iOS Safari、Android Chrome 近兩個主要版本（行動優先；賣場/車上手機使用）。
- **次要**：桌面 evergreen（Chrome／Safari／Firefox／Edge 近兩版）為附帶支援。
- **不支援**：IE 及任何非 evergreen legacy。
- **相機拍照**：以 `<input type="file" accept="image/*" capture="environment">`
  為主路徑；同時容許從相簿選圖（已拍好的收據）。

### Responsive Design

- 行動單欄優先；長收據逐行清單需順暢縱向捲動 ＋ 黏性小計／動作列。
- 點擊區符合行動最小尺寸；認領勾選、份額調整單手可操作。
- 桌面僅需可用（置中單欄即可），不為桌面做專屬版面。

### Performance Targets（取代被否決的「<1 分鐘」幻想 SLA）

- 前端拍照壓縮（長邊 ~1600px）後再上傳，控制 payload。
- job 提交 ack < 1s（提交後立即回 job_id 並顯示進度）。
- 解析本身受外部視覺 LLM 延遲支配，**不設端到端硬性秒數 SLA**；以
  「提交不阻塞 ＋ 進度可見 ＋ 指數退避重試」取代。
- 認領頁互動（勾選／改份額／看小計）本地即時反應；輪詢回填以伺服器為準。
- 結算頁與純文字匯出為純前端計算，瞬時。

### SEO Strategy

不適用——本產品**刻意反搜尋索引**。策略＝全站 `noindex,nofollow`、
robots.txt disallow、無 sitemap、無公開可發現入口；唯一入口為不可猜連結。

### Accessibility Level

務實基本級（pragmatic baseline）：語意化 HTML、足夠色彩對比、
行動友善點擊區、鍵盤可操作核心動作、單手可用。**不設正式 WCAG AA
合規目標**（非商業小工具、領域 general/low，無合規要求；過度工程化排除）。

### Implementation Considerations

- 同團名字記憶用 localStorage；身份綁本機 token（非帳號）。
- 結清後 session 凍結唯讀；連結 30 天到期銷毀影像／claims。
- 上傳前遮蔽會員卡號區域。
- 框架／部署具體選型移交 Phase 3（bmad-create-architecture），此處僅定約束。

## Project Scoping & Phased Development

承上 Product Scope 的相位定義，本節補充 MVP 策略、資源現實與風險緩解
（不重列能力清單，能力以 Functional Requirements 為權威）。

### MVP Strategy & Philosophy

**MVP 取向**：problem-solving MVP——最小可證「賣場/車上當下分完、零事後補算」。
**資源現實**：單人開發（n=1），無團隊。MVP 必須真的薄；任何非核心一律 v2。
不編造團隊規模或營收里程碑（非商業）。

### MVP Feature Set (Phase 1 = v1)

- **能力範圍**：Functional Requirements **FR1–FR50 全集**（見該節，本處不重列）。
- **支援的核心旅程**：J1（付款人順流）、J2（付款人逆境/逃生口）、
  J3（朋友順流認領）、J4（朋友逆境：認錯人/競態/遲到/PENDING）——四條全在 v1。
- **v1 硬約束**：#5564 同結構硬鎖（FR7）；`parsed_sum == 2208.50` 可執行斷言
  ＋ 3–5 張條件變異回歸測資（依 Step 8 共識置於 v1，見 Product Scope 共識證據）。

### Post-MVP Features

見 Product Scope §Growth（同一份 v2 backlog 清單，不重複維護）。
**永久 OUT**：金流、收款、滾動帳本、帳號體系、商業化。

### Risk Mitigation Strategy

- **技術風險（最高）**：視覺 LLM 解析準確率 n=1 未知。緩解＝自我對帳閘門
  （免費正確性尺，只證總額）＋ 可疑行肉眼抽檢層（補逐行/IRC 歸屬）＋
  3–5 條件變異回歸測資（v1 防線）＋ 永不卡死逃生口。
- **市場風險**：非商業、無市場目標——以「真實 dogfood 至少一次成功」取代
  市場驗證，不適用市場風險框架。
- **資源風險**：單人。緩解＝v1 範圍鎖死、v2 一律延後、拒絕任何
  商業化/帳本誘惑（範圍紀律即風險控制）。

## Functional Requirements

> 能力契約：下游 UX／架構／epic 僅實作此處所列；未列者不存在於最終產品。
> 純品質屬性（重試、結構化 log、成本持久化、輪詢頻率、影像尺寸/秒數）屬 NFR，
> 見下一節。

### 收據擷取與解析
- FR1: 付款人 can 以裝置相機拍攝或從相簿選取**一或多張**收據影像（長收據連續分頁、依序組成單一邏輯收據）作為分帳來源〔2026-05-19 CIP：原「一張」，多頁拉進 v1，見 `docs/PRD-multi-page-receipt-roadmap.md`〕
- FR2: 系統 can 在上傳前於前端壓縮收據影像以控制傳輸量
- FR3: 系統 can 以非阻塞方式處理解析（提交後立即回工作識別、可查詢進度）
- FR4: 系統 can 以單次視覺模型呼叫將收據解析為逐行品項（品名、數量、金額）
- FR5: 系統 can 還原收據上的縮寫品名為可辨識名稱
- FR6: 系統 can 將 IRC 即時折扣行自動配對並歸屬到其對應母品項
- FR7: 系統 can 拒絕非 #5564 同結構的收據並明確告知不支援（v1 硬鎖）

### 自我對帳與核對閘門
- FR8: 系統 can 計算解析品項總和並與收據印製總額比對，向付款人顯示是否一致
- FR9: 系統 can 標示可疑行（單行佔比異常、品名疑似互換）供付款人抽檢
- FR10: 付款人 can 逐行編輯品名、金額、數量
- FR11: 付款人 can 新增或刪除品項行
- FR12: 付款人 can 變更任一 IRC 折扣所歸屬的母品項
- FR13: 付款人 can 在收據印製總額無法辨識時手動輸入該總額
- FR14: 付款人 can 在連續多次仍無法對帳時選擇「未驗證強制放行」繼續
- FR15: 系統 can 在未驗證放行後對所有認領者顯示「未經對帳驗證」標示
- FR16: 系統 can 確保核對流程恆有可前進路徑，永不卡死付款人

### 分帳連結與分享
- FR17: 付款人 can 在核對完成後產生一條不可猜測的分帳連結
- FR18: 系統 can 產生含日期、總額、品項數、付款人的可分享訊息卡（非裸 URL，
  使收件者一眼可辨為朋友分帳而非詐騙連結，降低不敢點開的摩擦）
- FR19: 付款人 can 將連結／訊息卡分享至外部群組（複製或系統分享）

### 身份與存取
- FR20: 認領者 can 無需註冊或登入即透過連結進入分帳
- FR21: 系統 can 以本機裝置 token 綁定認領者身份，同裝置再進視為同一人
- FR22: 認領者 can 從既有名單選「哪個是你」認領身份，或建立新身份
- FR23: 認領者 can 修正自己誤選的身份
- FR24: 系統 can 限制每位認領者僅能變更其裝置 token 所綁定的認領
- FR25: 系統 can 記憶同團名字以利下次選擇（本機）

### 品項認領與分攤
- FR26: 認領者 can 逐行認領或取消認領自己的品項
- FR27: 認領者 can 將單一品項設為多人分攤
- FR28: 認領者 can 為多人分攤品項設定權重份額（預設均分，可改如 A:5／B:3）
- FR29: 認領者 can 即時看到自己目前應付小計
- FR30: 認領者 can 標示「我已認領完成」
- FR31: 認領者 can 復原自己剛做的認領變更
- FR32: 系統 can 將未被任何人認領的品項維持在 PENDING 狀態
- FR33: 系統 can 在多人近同時操作同一品項時以伺服器狀態為準解決競態
- FR34: 付款人 can 檢視認領變更紀錄

### 認領狀態可見性（社交壓力看板，v1 輪詢）
- FR47: 認領者 can 檢視目前已加入此分帳的參與者名單
- FR48: 認領者 can 檢視每個品項目前由誰認領（含多人分攤的份額分配）
- FR49: 認領者 can 檢視哪些品項仍未被任何人認領（PENDING）

### 結算與付款人結束
- FR35: 認領者 can 檢視結算頁各人應付金額（誰欠誰）
- FR36: 系統 can 在結算頁顯示「對得上總計」信任標示（當已通過對帳）
- FR37: 認領者 can 檢視收據縮圖以核對
- FR38: 認領者 can 一鍵複製可貼回群組的純文字結算摘要
- FR39: 付款人 can 看到尚未認領之品項與金額的常駐提示
- FR40: 付款人 can 透過顯式操作「結束分帳並吸收剩餘」定案（不超時、不靜默）
- FR41: 系統 can 在定案後凍結分帳為唯讀
- FR42: 認領者 can 在定案後僅檢視唯讀結算結果（遲到者降級）
- FR50: 系統 can 以「VAT 內含於每行金額」直接加總各人認領行為應付；
  v1 不做獨立稅金分攤（比例攤稅 fallback 列 v2）

### 資料生命週期與隱私
- FR43: 系統 can 支援在上傳前遮蔽收據上的會員卡號區域
- FR44: 系統 can 在連結到期（30 天）時銷毀收據影像與認領資料
- FR45: 系統 can 使所有分帳頁面不被搜尋引擎索引（反被發現）

### 系統濫用防護
- FR46: 系統 can 對開放解析端點施加 per-session／per-IP 請求預算上限以防濫用/惡意干擾

## Non-Functional Requirements

### Performance

- NFR-P1: 解析工作提交後系統回 job 識別的 ack，p95 < 1s（提交不阻塞）。
- NFR-P2: 解析本身受外部視覺 LLM 延遲支配，**不設端到端硬性秒數 SLA**；
  以「非阻塞 ＋ 進度可見 ＋ 退避重試」滿足體驗，而非承諾解析時間。
- NFR-P3: 認領頁互動（勾選/改份額/看小計）本地即時回饋，感知 < 200ms
  （樂觀更新，輪詢回填校正）。
- NFR-P4: 狀態輪詢間隔 2–3s，閒置時退避以省資源。
- NFR-P5: 結算頁與純文字匯出為純前端計算，即時完成。

### Security & Privacy

- NFR-S1: 分帳連結 ID 具 ≥128 bit 不可猜測熵，非序列/可枚舉；連結即唯一存取憑證。
- NFR-S2: 認領變更以裝置 token 授權，任何人無法變更他人 token 綁定之認領。
- NFR-S3: 收據影像於上傳前可遮蔽會員卡號；伺服器不長期保留未遮蔽原圖。
- NFR-S4: 連結到期（30 天）時銷毀收據影像與認領資料，銷毀結果可驗證。
- NFR-S5: 結清後 session 凍結唯讀，無任何路徑可改動已定案資料。
- NFR-S6: 全站 noindex/nofollow ＋ robots disallow，無公開可發現入口。
- NFR-S7: 開放解析端點施加 per-session/per-IP 請求預算上限，逾限拒絕（防濫用/grief）。
- 範圍聲明：無金流/帳號/敏感金融資料，故**不適用 PCI-DSS/KYC/AML**；
  安全焦點在「連結即憑證」之不可猜測性與開放端點濫用防護。

### Reliability & Graceful Degradation

- NFR-R1: 任一 LLM 呼叫失敗不得將原始錯誤外洩給使用者；走降級鏈：
  重試 → 較廉模型 → 快取 → 靜態 fallback → 友善錯誤訊息。
- NFR-R2: 核對流程恆有可前進路徑（手動輸入總額／N 次後未驗證強制放行），
  **永不卡死付款人**。
- NFR-R3: 已送出之認領變更須持久化於 Postgres，不因單一程序重啟而遺失。
- NFR-R4: 無正式 uptime SLA（非商業）；目標為「不丟已提交資料 ＋
  LLM 中斷時優雅降級」，而非可用率數字。

### LLM Operations（side-project 非協商標準）

- NFR-L1: 每個 LLM 呼叫點具指數退避＋jitter 重試，至少 3 次；5xx/429 視為
  transient，不得單次失敗即外洩。
- NFR-L2: 每次 LLM 呼叫輸出結構化 log，欄位含 model、prompt_tokens、
  completion_tokens、latency_ms、cost_usd、session_id、request_id、success/error。
- NFR-L3: Token/成本預算追蹤**持久化於 Postgres**（非僅記憶體），至少
  per-session-per-day 粒度。
- NFR-L4: 任何 >1s 的 LLM 操作走 job_id ＋ 輪詢，不阻塞 request thread。
- NFR-L5: LLM 呼叫邊界做 per-session token-budget 速率限制。

### Scalability（刻意極小——明示決策，非遺漏）

- NFR-SC1: 單一 session 須正確處理約 ≤8 名認領者近同時操作而不遺失更新
  （伺服器為權威）。
- NFR-SC2: DAU<10k 之前維持單一全端 monolith ＋ 單一 Postgres；
  **不引入 microservices／sharding／autoscaling／websocket**（反過度工程，
  與 side-project playbook 一致）。

### Accessibility

- NFR-A1: 務實基本級——語意化 HTML、足夠色彩對比、行動友善點擊區、
  核心動作鍵盤可達、單手可用。
- NFR-A2: **不設正式 WCAG AA 合規目標**（非商業小工具、領域 general/low、
  無合規要求）。

### Integration

- NFR-I1: 唯一外部相依為視覺 LLM 供應商 API；其延遲/5xx/429 由
  Reliability 降級鏈與 LLM Ops 重試吸收。
- NFR-I2: 無金流處理商、無第三方身份供應商、無其他外部整合（定義上排除）。
