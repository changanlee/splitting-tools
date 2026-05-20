# Story 2.2: 可疑行標示與一鍵定位（FR9）

Status: done

## Files

- NEW `src/features/reconciliation/suspicious.ts` — pure classifier (3 flags, severity)
- NEW `src/features/reconciliation/suspicious.test.ts` — 11 named node tests
- NEW `src/features/reconciliation/components/SuspiciousSummary.tsx` — server, anchor links
- MODIFIED `src/features/reconciliation/components/ReceiptLineRow.tsx` — `suspicious?` prop, border-left + ⚠ + 「可疑」(triple a11y), `id="line-N"`, `scroll-mt-20`
- MODIFIED `src/app/splits/[linkId]/review/page.tsx` — build classification map + suspicious-row anchor list

Gate: typecheck 0 / lint 0 / test 13 files 133 passed | 2 todo (zero regression) / build 6 routes. visionAdapter / schema / migrations / package zero diff. Regression anchor untouched.

## Story
As 付款人，I want 系統標出可疑行並讓我一鍵跳到，so that 我能快速抽檢而非逐行重看（FR9）。

## ⚠️ Dev 鐵則
1. **純啟發式分類器** `classifySuspicious(line, allLines): SuspiciousFlags` — pure，node-test 全覆蓋。OUT: 編輯增刪（2-3）／IRC 改綁（2-4）／真資料 e2e（gated W-1-4-1）。
2. **三重編碼 a11y**（色＋圖示＋文字，UX L514）；不依色一條路徑。
3. **一鍵定位** = 純 HTML anchor link（`<a href="#line-{lineNo}">`）+ CSS `scroll-margin-top`（避被 sticky bar 蓋）；**不需** client island、不需 JS。
4. 沿用 2.1 既有：ReceiptLineRow Server Component、formatCents、page Server。零新 npm、零 migration、visionAdapter 零改、regression anchor 零改。

## Acceptance Criteria
1. **AC1（純分類器）** `classifySuspicious(line, ctx): { flags: SuspiciousFlag[]; severity: "normal"|"suspicious" }`：偵測 `share_ratio_outlier`（單行 `netCents / Σ netCents > 0.5` 且 lines.length ≥ 3）、`description_unusual`（description 完全為符號／無中文且無拉丁字母）、`negative_non_irc`（amountCents < 0 且 isIrc=false——upstream invariant 違反）。組合多旗 → severity:"suspicious"；無命中 → "normal"。純函式、整數運算、零 IO。
2. **AC2（視覺）** suspicious 行：左側 4px 琥珀條 + ⚠ 圖示 + 「可疑」文字 label（sr-only/visible 由 css 控制）；data-attr `data-suspicious="true"` 便於 anchor 跳轉。零客戶端 state。
3. **AC3（一鍵定位 anchor）** 頁頂可疑行清單摘要（n≥1 時顯示）：`<a href="#line-N">第 N 行</a>`，CSS `scroll-margin-top: 4rem`（避 sticky bar）。原生瀏覽器 anchor，零 JS。
4. **AC4（測試）** `classifySuspicious.test.ts`：每旗單獨命中 + 多旗組合 + 邊界（行數 < 3 時 ratio 不觸發、空 description 不觸發等）+ severity 收斂。既有 122 pass 零回歸；regression anchor 零改。
5. **AC5（邊界）** 不改 schema／visionAdapter／migrations／package；純規則 + 視覺加強，server-only 預設。
