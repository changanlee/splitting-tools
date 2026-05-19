---
stepsCompleted: ['step-01-document-discovery', 'step-02-prd-analysis', 'step-03-epic-coverage-validation', 'step-04-ux-alignment', 'step-05-epic-quality-review', 'step-06-final-assessment']
status: 'complete'
overallReadiness: 'READY FOR IMPLEMENTATION'
completedAt: '2026-05-19'
assessmentScope: '完整四文件交叉驗證（PRD + Architecture + UX + Epics/Stories 皆 status: complete）—— 取代 2026-05-18 PRD-only 版作為 Phase 4 前最終就緒依據'
documentsIncluded:
  prd: '_bmad-output/planning-artifacts/prd.md'
  architecture: '_bmad-output/planning-artifacts/architecture.md'
  ux: '_bmad-output/planning-artifacts/ux-design-specification.md'
  epics: '_bmad-output/planning-artifacts/epics.md'
  upstreamContext:
    - '_bmad-output/planning-artifacts/product-brief-splitting-tools.md'
    - '_bmad-output/planning-artifacts/product-brief-splitting-tools-distillate.md'
  supersedes: '_bmad-output/planning-artifacts/implementation-readiness-report-2026-05-18.md（PRD-only 階段，非最終依據）'
workflowType: 'implementation-readiness'
project_name: 'splitting_tools'
user_name: '長安'
date: '2026-05-19'
---

# Implementation Readiness Assessment Report

**Date:** 2026-05-19
**Project:** splitting_tools（Costco 分帳小工具）

## 評估範圍

完整四文件交叉驗證（Phase 4 開發前最終就緒把關）。PRD、Architecture、
UX、Epics/Stories 四份皆 `status: complete`。本報告**取代** PRD-only 的
`implementation-readiness-report-2026-05-18.md` 作為進 Phase 4 的最終依據。

## Step 1 — Document Discovery

**納入評估（whole 檔，無 sharded、無重複衝突）：**
- PRD：`prd.md`（27 KB）
- Architecture：`architecture.md`（44 KB，含 Implementation Sequence、
  🔴 FR50 settle 規格、2 Important gap、starter）
- UX Design：`ux-design-specification.md`（37 KB，14 步、17 UX-DR）
- Epics & Stories：`epics.md`（36 KB，6 epics / 33 stories）

**上游脈絡（非評估主體）：** product-brief ×2。
**支援資產：** `ux-design-directions.html`（UX 設計方向 showcase）。
**先前產出（已被本報告取代，非輸入）：**
`implementation-readiness-report-2026-05-18.md`（PRD-only 階段）。

**CRITICAL 重複衝突：** 無（每文件單一 whole 檔）。
**Missing 必要文件：** 無（PRD/Architecture/UX/Epics 四份齊備）。

## PRD Analysis

### Functional Requirements

完整讀取 `prd.md`。50 條 FR，9 能力區（逐字見 PRD §Functional
Requirements，本處列 ID 與區塊以供追溯）：
- 收據擷取與解析：FR1–FR7
- 自我對帳與核對閘門：FR8–FR16
- 分帳連結與分享：FR17–FR19
- 身份與存取：FR20–FR25
- 品項認領與分攤：FR26–FR34
- 認領狀態可見性（看板）：FR47–FR49
- 結算與付款人結束：FR35–FR42, FR50
- 資料生命週期與隱私：FR43–FR45
- 系統濫用防護：FR46

**Total FRs: 50**

### Non-Functional Requirements

25 條 NFR（＋2 範圍排除聲明）：
- Performance：NFR-P1–P5
- Security & Privacy：NFR-S1–S7（＋排除聲明①：不適用 PCI-DSS/KYC/AML）
- Reliability & Graceful Degradation：NFR-R1–R4
- LLM Operations（非協商）：NFR-L1–L5
- Scalability（刻意極小）：NFR-SC1–SC2
- Accessibility：NFR-A1–A2（A2 明確不設 WCAG AA）
- Integration：NFR-I1–I2（＋排除聲明②：無金流/身份/其他整合）

**Total NFRs: 25（＋2 範圍排除聲明）**

### Additional Requirements

- 相位：releaseMode `phased`；v1 = FR1–FR50 全集；v2 backlog（比例攤稅、
  websocket 真同步、最少轉帳、按量拆專屬 UI、非 Costco 通用化）
- 永久 OUT（定義上不做）：金流、收款、滾動帳本、帳號體系、商業化
- v1 硬約束：#5564 同結構硬鎖（FR7）；可執行斷言 `parsed_sum == 2208.50`
  ＋ 3–5 張條件變異回歸測資（Step 8 共識，置 v1 不得降級）
- 資源現實：單人開發 n=1
- 平台：行動優先 SPA、單一全端 monolith ＋ Postgres

### PRD Completeness Assessment

PRD 結構完整、FR 能力導向可測、NFR 可量化處皆量化、刻意排除項明示
理由；可追溯鏈（Vision→Success→Journey→FR）顯式宣告。先前 PRD-only
就緒檢查（2026-05-18）已結論「READY、0 阻斷、唯一弱點 FR50 追溯薄弱
交棒架構」。本次重點＝驗證該弱點與全部 carry-forward 是否已於
Architecture/UX/Epics 正確接線（後續步驟交叉驗證）。

## Epic Coverage Validation

### Coverage Matrix（FR ↔ Epic ↔ Story，全 50）

| FR | Story | 狀態 | FR | Story | 狀態 |
|---|---|---|---|---|---|
| FR1 | E1·S1.2 | ✓ | FR26 | E4·S4.4 | ✓ |
| FR2 | E1·S1.2 | ✓ | FR27 | E4·S4.5 | ✓ |
| FR3 | E1·S1.3 | ✓ | FR28 | E4·S4.5 | ✓ |
| FR4 | E1·S1.4 | ✓ | FR29 | E4·S4.4 | ✓ |
| FR5 | E1·S1.4 | ✓ | FR30 | E4·S4.6 | ✓ |
| FR6 | E1·S1.5 | ✓ | FR31 | E4·S4.6 | ✓ |
| FR7 | E1·S1.6 | ✓ | FR32 | E4·S4.7 | ✓ |
| FR8 | E2·S2.1 | ✓ | FR33 | E4·S4.7 | ✓ |
| FR9 | E2·S2.2 | ✓ | FR34 | E4·S4.9 | ✓ |
| FR10 | E2·S2.3 | ✓ | FR35 | E5·S5.2 | ✓ |
| FR11 | E2·S2.3 | ✓ | FR36 | E5·S5.2 | ✓ |
| FR12 | E2·S2.4 | ✓ | FR37 | E5·S5.2 | ✓ |
| FR13 | E2·S2.5 | ✓ | FR38 | E5·S5.3 | ✓ |
| FR14 | E2·S2.6 | ✓ | FR39 | E5·S5.4 | ✓ |
| FR15 | E2·S2.6 | ✓ | FR40 | E5·S5.4 | ✓ |
| FR16 | E2·S2.7 | ✓ | FR41 | E5·S5.5 | ✓ |
| FR17 | E3·S3.1 | ✓ | FR42 | E5·S5.5 | ✓ |
| FR18 | E3·S3.2 | ✓ | FR43 | E1·S1.2 | ✓ |
| FR19 | E3·S3.3 | ✓ | FR44 | E6·S6.1 | ✓ |
| FR20 | E4·S4.1 | ✓ | FR45 | E6·S6.2 | ✓ |
| FR21 | E4·S4.1 | ✓ | FR46 | E1·S1.7 | ✓ |
| FR22 | E4·S4.2 | ✓ | FR47 | E4·S4.8 | ✓ |
| FR23 | E4·S4.3 | ✓ | FR48 | E4·S4.8 | ✓ |
| FR24 | E4·S4.3 | ✓ | FR49 | E4·S4.8 | ✓ |
| FR25 | E4·S4.2 | ✓ | FR50 | E5·S5.1 | ✓ |

### Missing Requirements

**無。** 50/50 FR 皆對應至少一個 story，且該 story ACs 涵蓋 FR 行為。
無「epics 有但 PRD 無」之孤兒需求。

### Coverage Statistics

- Total PRD FRs：50
- FRs covered in epics/stories：50
- Coverage percentage：**100%**
- 孤兒 story（無對應 FR/NFR/UX-DR）：0（Story 1.1 scaffold 為架構
  starter 必要起手，非孤兒——承載全部橫切起點，BMAD greenfield 既定）

## UX Alignment Assessment

### UX Document Status

**Found** —— `ux-design-specification.md`（status: complete，14 步，
17 條 UX-DR）。輔以 `ux-design-directions.html`。

### UX ↔ PRD 對齊

- UX 旅程流程（step-10 含 Mermaid）對映 PRD J1–J4，無新增超出 PRD 之
  使用者能力。
- 6 高互動區皆有 PRD FR 來源：核對閘門(FR8–16)、看板(FR47–49)、
  「是不是你」(FR22–23)、加權份額(FR27–28)、付款人吸收(FR39–40)、
  訊息卡(FR18)。
- UX-DR16（NFR-A1 務實基本級、不設 WCAG AA）與 PRD NFR-A1/A2 **一致**，
  無互相矛盾。
- 結論：UX 不引入 PRD 外需求、不與 PRD 衝突。

### UX ↔ Architecture 對齊

- UX 設計系統 shadcn/ui 建於架構已鎖 Tailwind ✓；TanStack Query
  輪詢/樂觀為架構既定決策 ✓；ReceiptLineRow/自訂元件對映架構
  `src/components/ui`＋`src/features/*` 結構 ✓；金額整數分 / 結算對映
  架構 🔴 FR50 `lib/money/settle` 規格 ✓；輪詢視覺穩定(UX-DR12)由
  架構 TanStack 決策支撐 ✓。
- 無 UI 元件不被架構支援；無效能需求超出架構效能門檻(NFR-P1–P5)。

### UX-DR ↔ Story 承載（17/17）

- 專屬 story 承載（13）：UX-DR2→S2.3/S4.4/S5.x、DR3→S2.1/S4.4、
  DR4→S2.1–2.7、DR5→S4.5、DR6→S4.2、DR7→S5.4、DR8→S3.2、
  DR9→S1.3、DR10→S2.6、DR11→S5.3、DR12→S4.8、DR13→S4.8/篩選、
  DR17→S5.5、DR1→S1.1(shadcn init)。
- 橫切約束（不需獨立 story，落為跨 story ACs，與 NFR 處理一致）：
  UX-DR14（按鈕階層/三重編碼/錯誤不外洩——見 S2.6 二次確認、S5.4）、
  UX-DR15（行動單欄優先——全 UI story 通用約束）、UX-DR16（不設
  WCAG AA——非目標約束）。

### Alignment Issues

**無。** UX 與 PRD/Architecture/Epics 四向一致，無矛盾、無未支援元件、
無孤立 UX 需求。

### Warnings

**無。** UX 文件齊備且 UI-primary 已正式設計（非「UI 隱含但缺 UX」）。

## Epic Quality Review

嚴格比對 create-epics-and-stories best practices（enforcer 模式，
非橡皮圖章）。

### A. User Value Focus（6/6 通過）

| Epic | 使用者產出 | 判定 |
|---|---|---|
| E1 拍照解析 | 付款人拍照得看得懂逐行明細 | ✓ user value |
| E2 核對閘門 | 付款人信任金額對得上、永不卡死 | ✓ |
| E3 出連結 | 產生可分享連結貼回群組 | ✓ |
| E4 朋友認領 | 朋友勾完即知應付、看板可見 | ✓ |
| E5 結算結束 | 各人應付/付款人定案 | ✓ |
| E6 生命週期隱私 | 資料不長留、分帳不被發現 | ✓（隱私即使用者價值）|

無「Setup Database / API Development / Infrastructure」型技術里程碑
epic。Story 1.1（scaffold）本身無直接 user value，但屬 **BMAD
greenfield 既定例外**（架構指定 starter → Epic 1 Story 1 = 建骨架），
非違規。

### B. Epic Independence（通過）

線性 E1→E6。E2 僅用 E1 產出（解析行），不需 E3+；E3 用 E2（已核對）；
E4 用 E3（連結）；E5 用 E4（claims）；E6 系統性。**無 epic 需後續
epic 才運作、無循環依賴。**

### C. Story 品質與前向依賴（通過）

- 33 stories 皆單 dev-agent 可完成、有 user value、GWT 可測 ACs。
- 逐 epic 檢 story 順序：每 story 僅依賴**前序** story（如 S1.4 用
  S1.3 job 基礎、S5.2 用 S5.1 settle 函式、S4.8 看板讀 S4.4–4.7
  claims）。**未發現任何前向依賴**（無「依賴未來 story」「等未來
  story 才能運作」）。
- ACs 採 Given/When/Then、含錯誤/邊界（如 S2.7 永不卡死分支全覆蓋、
  S4.7 競態、S5.5 423 凍結）。

### D. DB 建立時機

- 未犯「Epic 1 一次建全部表」反模式：S1.1 僅建最小表
  （sessions/parse_jobs/llm_costs/rate_counters）。
- receipt_lines（S1.4/1.5 需）、claims（S4.4 需）、claim_changes
  （S4.9 需）依需建立——原則已守。

### E. Starter / Greenfield 檢查（通過）

架構指定 starter（create-next-app 指令）→ Epic 1 Story 1.1 = 依
starter 建骨架（含相依、初始設定、CI 早建），greenfield 指標齊備 ✓。

### Best Practices Compliance（每 epic）

| 檢查項 | E1 | E2 | E3 | E4 | E5 | E6 |
|---|---|---|---|---|---|---|
| 交付 user value | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| 可獨立運作 | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| story 適當大小 | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| 無前向依賴 | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| DB 依需建立 | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| ACs 清楚可測 | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| 可追溯 FR | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |

### Quality Findings by Severity

**🔴 Critical：0**
**🟠 Major：0**
**🟡 Minor：1**
- 個別 story ACs 未逐一明列其建立/變更的具體 schema DDL（epic 層
  「依需建立、不前載」原則已守、反模式未犯）。**Remediation：** 於
  `bmad-create-story`/`bmad-dev-story` 階段，每 story 明列其
  receipt_lines/claims/claim_changes 等 Drizzle schema 變更。
  非阻斷——屬逐 story 細化，不影響 epic 結構或依賴正確性。

**INFO（非缺陷）：** UX-DR14/15/16 為橫切約束，落為跨 story ACs/
非目標而非獨立 story——與 NFR 處理方式一致，刻意設計，非遺漏。

## Carry-Forward 接線驗證（2026-05-18 PRD-only 弱點與全部 carry-forward）

| Carry-forward | 接線位置 | 狀態 |
|---|---|---|
| 🔴 FR50 稅金（PRD 唯一弱點，2026-05-18 標記） | Architecture `lib/money/settle.ts` 確定性規格 → Story 5.1（IRC 先折抵、最大餘數法+穩定排序、整數分、CI `settlement_sum==parsed_sum` 不變量） | ✅ 已接線（弱點消解） |
| LLM-Ops NFR-L1–L5 + 降級鏈 R1 | visionAdapter 單一邊界 → Story 1.4 ACs（退避+jitter≥3、結構化 log、cost per-session-day、降級鏈） | ✅ 落為 story 驗收，非獨立技術 epic |
| 回歸測資 `parsed_sum==2208.50` + 3–5 變異 | Story 1.1（CI harness）+ Story 1.4 ACs | ✅ |
| device-token 授權 NFR-S2 | Story 4.1（綁定）/ 4.3（token 隔離） | ✅ |
| noindex 三重 NFR-S6 | Story 6.2 | ✅ |
| 30 天可驗證銷毀 NFR-S4 | Story 6.1（刪後存在性/雜湊檢查） | ✅ |
| 架構 gap G1（FR37 縮圖端點） | Story 5.2（`api/splits/[linkId]/receipt`，連結授權/410/已遮影像） | ✅ explicit |
| 架構 gap G2（pg-boss 不納 Drizzle migration） | Story 1.1（初始化序 Drizzle migrate→pg-boss start） | ✅ explicit |
| Epic 順序對齊架構 Implementation Sequence | E1→E6 線性、不可倒置、無前向依賴 | ✅ |
| 四文件一致（Tailwind/shadcn/TanStack/整數分/NFR-A1 不設 AA） | step-04 交叉驗證無矛盾 | ✅ |

**先前 2026-05-18 唯一弱點（FR50 追溯薄弱）已於 Architecture→UX→Epics
全鏈接線並可被 CI 不變量驗證——弱點正式消解。**

## Summary and Recommendations

### Overall Readiness Status

**READY FOR IMPLEMENTATION**

四文件（PRD + Architecture + UX + Epics/Stories）皆 `status: complete`、
相互一致；FR 覆蓋 50/50（100%）；UX-DR 承載 17/17；全部 carry-forward
（含 2026-05-18 唯一弱點 FR50）已接線並可驗證；epic 結構 user-value、
線性無前向依賴、無技術里程碑 epic。

### Critical Issues Requiring Immediate Action

**無。** 0 Critical、0 Major。

### Recommended Next Steps

1. **進 Phase 4：`bmad-sprint-planning`**——由 epics.md 產出
   `_bmad-output/implementation-artifacts/sprint-status.yaml`，依
   E1→E6 線性順序排程，Story 1.1（scaffold）為首。
2. **story 循環**：`bmad-create-story` → `bmad-dev-story` → `bmad-code-review`
   逐 story 推進。
3. **Minor remediation（隨流程自然解決，非阻斷）**：於
   `bmad-create-story`/`bmad-dev-story` 時，每 story 明列其具體
   Drizzle schema DDL（receipt_lines/claims/claim_changes 等）。
4. CI 首要綠燈門檻：`parsed_sum==2208.50` 與 `settlement_sum==parsed_sum`
   兩不變量（Story 1.1 建 harness、Story 1.4/5.1 填實）。

### Final Note

本評估在 6 步驟跨四文件交叉驗證，檢出 **0 Critical、0 Major、
1 非阻斷 Minor（per-story DDL 細化，create-story 階段解決）**。
2026-05-18 PRD-only 唯一弱點 FR50 已全鏈接線消解。**規劃可原樣進
Phase 4 實作，不需返工。** 本報告取代 2026-05-18 PRD-only 版作為
Phase 4 前最終就緒依據。

**Assessor:** 長安（PM facilitator）｜**Date:** 2026-05-19｜
**Scope:** PRD + Architecture + UX + Epics/Stories 完整四文件交叉驗證
