# Story 3.3: 系統分享 / 複製（FR19）

Status: done

## AC
1. `ShareActions` Client Component — 「分享…」按鈕走 `navigator.share` (Web Share API，行動 Safari/Android 原生)；無 Web Share → 自動 fallback 至 `navigator.clipboard.writeText`。「複製」按鈕永遠走 clipboard，顯示 ✓已複製 一次性 hint。
2. 任何錯誤（clipboard 拒絕、permission 阻擋）→ 友善 inline 訊息（不外洩 raw）。
3. `/splits/[linkId]/share/page.tsx` Server Component 組裝（MessageCard + ShareActions），shareUrl 從 headers() 動態組裝 origin。
4. Story 2.7 `NextStepGate` 「下一步：產生分享連結」 anchor → 此頁面（不再 404）。

## Files
- NEW `src/features/linking/components/ShareActions.tsx`（client island）
- NEW `src/app/splits/[linkId]/share/page.tsx`（Server Component）

Gate: 158 passed | 2 todo / build 7 routes（新增 /splits/[linkId]/share）。
