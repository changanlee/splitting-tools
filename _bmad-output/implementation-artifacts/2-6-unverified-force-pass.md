# Story 2.6: 未驗證強制放行 + UnverifiedBanner 傳播（FR14, FR15）

Status: done

## AC
1. `computeReconciliation` 加第 4 態 `unverified`：當 `unverified=true` 旗標 → 覆蓋 verified/mismatch/awaiting 數學，永遠回 unverified；下層 mismatchCents 保留供顯示。
2. `forcePassUnverifiedAction(linkId, formData{confirmed})` Server Action：`confirmed=yes` → 設 true；`confirmed=undo` → 設 false；其他 → friendly invalid。FR14 二次確認 = `<details>` 摺疊 + `confirmed=yes` hidden field（兩步：先展開、再點按鈕）。
3. `UnverifiedBanner` Server Component — `sessions.unverified=true` 時頂部琥珀 banner（將來 Epic 4 認領頁面共用）。
4. `getReconciliationSummary` 加讀 `sessions.unverified`；SubtotalBar 同步顯第 4 態。
5. 零 migration（`sessions.unverified` 既有 1.1）、零新 npm、visionAdapter 零改、regression anchor 零改。

## Files
- MODIFIED `compute.ts` — +4th `unverified` state + override
- MODIFIED `compute.test.ts` — +2 named tests (override + default preserve)
- MODIFIED `components/StickySubtotalBar.tsx` — +unverified state (琥珀 ⚠)
- MODIFIED `server/actions.ts` — +forcePassUnverifiedAction (yes/undo)
- MODIFIED `server/summary.ts` — return unverified flag
- NEW `components/UnverifiedBanner.tsx` — server, amber, FR15 propagation
- NEW `components/ForcePassForm.tsx` — `<details>` 二次確認 + hidden `confirmed=yes`; undo button when already unverified
- MODIFIED `app/splits/[linkId]/review/page.tsx` — wire banner + form + pass unverified into compute

Gate: typecheck 0 / lint 0 / test 15 files / 149 passed | 2 todo / build 6 routes.
