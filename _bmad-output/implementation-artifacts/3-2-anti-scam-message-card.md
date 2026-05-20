# Story 3.2: 防詐騙訊息卡（FR18）

Status: done

## AC
1. `MessageCard` Server Component — 顯示日期 / 總額 / 品項數 / 付款人(placeholder Epic 4) / 連結 / 未驗證警示。非裸 URL share 防詐騙（UX L537-539）。
2. `buildShareText(args)` 純函式 — 產生 share 字串給 ShareActions/copy 用。
3. `getShareSummary(linkId)` 讀模型 glue — JOIN sessions + receipt_lines aggregate（lineCount + grossSum）。

## Files
- NEW `src/features/linking/server/shareSummary.ts`
- NEW `src/features/linking/components/MessageCard.tsx`

Gate: 158 passed | 2 todo / 7 routes（與 3.3 同 build）。
