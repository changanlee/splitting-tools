---
stepsCompleted: ['step-01-document-discovery', 'step-02-prd-analysis', 'step-03-epic-coverage-validation', 'step-04-ux-alignment', 'step-05-epic-quality-review', 'step-06-final-assessment']
assessmentScope: 'PRD-only（Phase 2 結尾，進 Phase 3 架構前的就緒度檢查）'
documentsIncluded:
  prd: '_bmad-output/planning-artifacts/prd.md'
  upstreamInputs:
    - '_bmad-output/planning-artifacts/product-brief-splitting-tools.md'
    - '_bmad-output/planning-artifacts/product-brief-splitting-tools-distillate.md'
    - '_bmad-output/brainstorming/brainstorming-session-2026-05-17-1812.md'
  architecture: 'N/A — 尚未到該階段（Phase 3）'
  epics: 'N/A — 尚未到該階段'
  ux: 'N/A — 尚未到該階段'
workflowType: 'implementation-readiness'
---

# Implementation Readiness Assessment Report

**Date:** 2026-05-18
**Project:** splitting_tools（Costco 分帳小工具）

## 評估範圍

PRD-only 就緒度檢查。Architecture／Epics／UX 於 Phase 2 結尾**尚未產出（預期）**，
非缺失扣分。重點：PRD 內部一致性、可追溯鏈完整性、能力契約缺口、相位邏輯。

## Step 1 — Document Discovery

**納入評估：**
- PRD：`prd.md`（單一完整檔，無 sharded／無重複衝突）
- 上游追溯輸入：product-brief、product-brief-distillate、brainstorming SSOT

**N/A（尚未到階段，非缺失）：** Architecture、Epics & Stories、UX Design

**CRITICAL 重複衝突：** 無

## PRD Analysis

### Functional Requirements（共 50，9 區）

**收據擷取與解析**
- FR1: 付款人 can 以裝置相機拍攝或從相簿選取一張收據影像作為分帳來源
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

### Non-Functional Requirements（共 25 + 2 範圍聲明）

- **Performance**：NFR-P1 job ack p95<1s／P2 不設端到端 LLM SLA／P3 認領互動感知<200ms／P4 輪詢 2–3s 閒置退避／P5 結算前端即時
- **Security & Privacy**：NFR-S1 連結 ID ≥128bit／S2 token 授權隔離／S3 上傳前遮卡號／S4 30 天銷毀可驗證／S5 結清凍結唯讀／S6 noindex／S7 端點預算上限；＋範圍聲明「不適用 PCI-DSS/KYC/AML」
- **Reliability & Graceful Degradation**：NFR-R1 降級鏈／R2 永不卡死付款人／R3 認領持久化 Postgres／R4 無 uptime SLA 但不丟資料
- **LLM Operations（非協商）**：NFR-L1 退避＋jitter 重試≥3／L2 結構化 log 全欄位／L3 成本持久化 Postgres per-session-day／L4 >1s 走 job 輪詢／L5 per-session token 速率限制
- **Scalability（刻意極小）**：NFR-SC1 單 session ≤8 人不丟更新／SC2 DAU<10k 不引入 microservices/sharding/autoscaling/websocket
- **Accessibility**：NFR-A1 務實基本級／A2 不設 WCAG AA 目標
- **Integration**：NFR-I1 唯一外部相依視覺 LLM API／I2 無金流/身份/其他整合（定義上排除）

**Total NFRs: 25（＋2 範圍排除聲明）**

### Additional Requirements / Constraints

- **相位**：releaseMode `phased`；v1＝FR1–FR50 全集；v2 backlog＝比例攤稅、看板真同步、最少轉帳、按量拆專屬 UI、非 Costco 通用化
- **永久 OUT（定義上不做）**：金流、收款、滾動帳本、帳號體系、商業化
- **v1 硬約束**：#5564 同結構硬鎖（FR7）；可執行斷言 `parsed_sum == 2208.50` ＋ 3–5 張條件變異回歸測資（Step 8 共識證據，置於 v1，不得再降級）
- **資源現實**：單人開發 n=1
- **平台**：行動優先 SPA、單一全端 monolith ＋ Postgres、框架選型移交 Phase 3

### PRD Completeness Assessment（初判）

PRD 結構完整含全部必要段落；FR 為能力導向、可測、實作無關；NFR 可量化處皆量化、
刻意排除項明示理由（非遺漏）；可追溯鏈（Vision→Success→Journey→FR）顯式宣告。
初判：高完整度。深度追溯與缺口檢查於後續步驟進行（重點觀察：FR47–49 看板可見性
× NFR-S2 token 隔離之一致性；FR50 稅金 × FR35 結算 × FR6 IRC 之計算交互；
v2 邊界是否乾淨）。

## Epic Coverage Validation

**狀態：N/A — epics 尚未產出（Phase 3 之後才建）。** 此階段無法做 FR↔Epic 對映矩陣，
非缺失扣分；本就是「進架構/epics 前」的就緒度檢查。

### 現階段代理檢查：PRD 內部追溯（FR ↔ Journey）

以 PRD 的 Journey Requirements Summary 作為「每條 FR 是否有來源旅程／可實作路徑」
的代理：

- **有旅程支撐**：FR1–FR16（J1/J2）、FR17–FR19（J1）、FR20–FR25（J3/J4）、
  FR26–FR34（J3/J4）、FR47–FR49（J3/J4，本次補入後 Journey 3/4 已含看板敘事）、
  FR35–FR42（J3/J4）。
- **無專屬旅程、屬橫切約束（可接受，非缺口）**：
  - FR43–FR45（資料生命週期/隱私）、FR46（濫用防護）：系統橫切能力，不綁單一旅程，
    由 NFR-S 系列與 Implementation Considerations 支撐——正常。
  - FR50（稅金計算規則）：補述 locked 決策，無敘事旅程；**追溯薄弱點**——
    建議架構/epic 階段明確把它接到結算計算流程（FR35）與 IRC（FR6），
    否則下游可能漏實作或重新發明稅邏輯。已列入後續觀察。

### Coverage Statistics（現階段）

- Total PRD FRs：50
- 有來源旅程可追溯：47（FR1–42、FR47–49）
- 橫切約束（由 NFR/Implementation 支撐，非缺口）：FR43–46
- 追溯薄弱、需 Phase 3 明確接線：FR50（1 項）
- FR↔Epic 覆蓋率：**N/A（epics 未產出）**

## UX Alignment Assessment

### UX Document Status

**Not Found（N/A — UX 設計為 Phase 3 工作，尚未進行）。** 但 UX **強烈隱含**：
行動優先 user-facing web app，PRD 含完整 User Journeys、Web App Specific
Requirements、互動流程——UI 絕非「不需要」，只是尚未到設計階段。非缺失扣分。

### Alignment Issues

無法評（UX 與 Architecture 皆未產出）。PRD 內部已先行定錨 UX 約束
（Responsive Design、Accessibility 務實基本級、Performance 感知門檻），
為 Phase 3 UX/架構提供對齊基準，方向一致無內部矛盾。

### Warnings / Phase 3 UX 須重點設計的高互動區（建設性提示）

PRD 與上游 SSOT 已標為「待 PRD/UX 細化」、且互動密度最高、最容易做壞的區塊，
建議 `bmad-create-ux-design` 階段優先攻：

1. **核對閘門 UX**（FR8–16）：可疑行如何呈現、差額一鍵定位修正、
   逃生口「未驗證強制放行」的措辭與後果可見性。
2. **認領狀態看板**（FR47–49）：誰加入／誰領了什麼／PENDING，
   輪詢更新的視覺穩定性（不可閃爍跳動）。
3. **「是不是你」名單**（FR22–23）：免註冊下如何低摩擦選身份、改身份。
4. **多人加權份額**（FR27–28）：A:5/B:3 在手機單手如何輸入不出錯。
5. **付款人顯式吸收閘門**（FR39–40）：PENDING 橫幅與「結束分帳並吸收剩餘」
   的不可誤觸 / 不可靜默設計。
6. **訊息卡**（FR18）：防詐騙觀感的具體版面（這是「朋友敢不敢點」的關鍵）。

此為**前瞻清單非扣分**——交付給 Phase 3，避免那時才現場想。

## Epic Quality Review

**狀態：N/A — epics 尚未產出。** 矩陣式 epic/story 品質審查無對象。
改做**最高槓桿的預檢**：PRD 結構是否拆得出符合 best-practice 的 epic，
把會在 `bmad-create-epics-and-stories` 階段製造壞 epic 的風險現在標出。

### 預檢結論：PRD 結構利於拆出 user-value epic（基底良好）

- FR 已按**使用者價值能力區**分組（收據解析／核對／連結／身份／認領／看板／
  結算／生命週期／濫用防護），非技術分層 → 天然映射 user-value epic，
  低「Setup Database」型技術 epic 風險。
- 依賴為**自然線性管線、無環**：解析(FR1–7)→核對閘門(FR8–16)→出連結(FR17–19)
  →身份/認領/看板(FR20–34,47–49)→結算/結束(FR35–42,50)→生命週期/濫用(FR43–46)。
  建議 epic 順序照此，create-epics 階段**不可倒置**（倒置＝forward dependency）。

### 🟠 交付 create-epics 的前瞻警告（現在不是缺陷，是預防壞 epic）

1. **LLM-Ops NFR 勿獨立成技術 epic**：NFR-L1–L5（重試/log/成本/job/速率）
   是橫切關注。風險＝被切成無使用者價值的「LLM 基礎建設」epic。
   **建議**：併入「收據解析」epic 的 story 驗收條件（解析能力自帶其重試/log/
   成本/預算），不得獨立。
2. **回歸測資勿成孤兒測試 story**：`parsed_sum==2208.50` ＋ 3–5 條件變異測資
   是 v1 交付物。風險＝變成「建測試框架」無價值 story。
   **建議**：作為「收據解析」epic 的可驗收標準（解析正確性可驗證），隨能力走。
3. **FR50 稅金 / FR43–46 橫切**：勿成孤兒技術 story。FR50 接到結算計算
   （FR35）與 IRC（FR6）；FR43–46 附掛於對應能力 story（上傳/連結/解析端點）。
   呼應 Step 3 已標的 FR50 追溯薄弱點。
4. **Greenfield 起手 story**：框架選型移交 Phase 3 架構——**架構必須先於 epics**
   （BMAD 既定順序）。epics 階段 Epic 1 Story 1 應為「依架構 starter 建專案骨架」
   （含相依、初始設定、CI 跑 `parsed_sum==2208.50`）。

### Best-Practice Compliance（預檢，對 PRD 而非 epics）

| 檢查項 | 預檢結果 |
|---|---|
| 能否拆出 user-value epic（非技術里程碑） | ✅ 結構支持 |
| Epic 可獨立、無 forward dependency | ✅ 線性無環（前提：順序不倒置） |
| FR 可追溯 | ✅ 47/50 有旅程；FR50 待 Phase 3 接線 |
| Greenfield 起手 | ⚠️ 需架構先行，epics 補 scaffold story |
| 橫切 NFR 不汙染成技術 epic | 🟠 已預警（見上 1–3） |

## Summary and Recommendations

### Overall Readiness Status

**READY — 可進 Phase 3（架構）。** PRD 本身結構完整、可追溯、能拆出 user-value
epic、依賴線性無環。本次為 PRD-only 階段檢查；Architecture／Epics／UX 不存在
是預期（非扣分）。**無阻斷性缺陷，PRD 不需返工即可進架構。**

### 發現統計

- 阻斷性 / Critical：**0**
- 真實 PRD 弱點（建議處理但不阻斷）：**1** — FR50 稅金追溯薄弱
- 交付下游的前瞻 carry-forward（非現缺陷）：**5**
  （Step 5 的 4 條 epic 預警 ＋ Step 4 的 UX 高互動清單）
- 重複/遺漏文件衝突：0

### 本次檢查的誠實定位

最高價值的缺口其實在 PRD 流程內就抓掉了——brainstorming reconciliation
（PRD Step 11）撈回完全沒進 46 條 FR 的「認領狀態看板」核心需求（現 FR47–49）。
本就緒檢查的價值是**確認沒有第二個那種洞**，並結論：沒有。其餘為交付下游的
清單，非 PRD 病灶。

### 唯一建議處理的 PRD 弱點

**FR50（稅金）追溯薄弱**：它是 PRD Step 11 末補入的 locked 決策，無來源旅程，
與 FR35（結算計算）、FR6（IRC 折扣淨價）的計算交互未在 PRD 走完。
- **影響**：下游架構/epic 若沒接好，可能漏實作或重新發明稅邏輯，
  造成「每人應付」金額算錯（朋友間社交尷尬＝產品核心失敗）。
- **建議（二選一，皆不阻斷進度）**：
  - (A) 不改 PRD，由本報告把 FR50 明確交棒架構：要求 Phase 3 把
    「VAT 內含每行 → 各人認領行含稅金額直接加總」接進結算計算模型，
    並與 IRC 淨價（FR6）對齊。← **推薦**（FR50 意圖明確，報告已載指令）。
  - (B) 現在於 PRD 輕量補一句把 FR50 交叉引用 FR35/FR6。

### Recommended Next Steps

1. **進 Phase 3 架構**（`bmad-create-architecture`）：框架/部署/資料模型/
   LLM 邊界實作。架構必須先於 epics。
2. **架構階段務必處理**：FR50 稅金計算接線（見上）；採 Step 5 既定 epic
   線性順序，勿倒置。
3. **epics 階段（架構後）注意**：Step 5 的 4 條前瞻警告——LLM-Ops/測資/
   橫切 NFR 不得獨立成技術 epic；Epic 1 Story 1 為依架構 starter 建骨架。
4. **UX 階段**：優先攻 Step 4 列的 6 個高互動區。

### Final Note

本評估在 6 類別檢出 **0 阻斷、1 建議處理弱點（FR50）、5 前瞻 carry-forward**。
PRD 可原樣進 Phase 3；FR50 由架構階段接線即可。這些發現用於讓下游更順，
非阻擋目前進度。

**Assessor:** 長安（PM facilitator）｜**Date:** 2026-05-18｜**Scope:** PRD-only





