# Story 2.7: 核對流程永不卡死保證（FR16 / NFR-R2）

Status: done

## AC
1. 純 `canProgress(state)` 函式對四個 reconciliation state 各列 `canProgress: bool` + `nextHints: string[]`。**契約：所有 state 至少 1 個 nextHint（無死路）**。TypeScript `_exhaustive: never` 守護新狀態加入時編譯失敗。
2. `NextStepGate` Server Component — 可前進 → 顯「下一步：產生分享連結」(連到 `/splits/[linkId]/share`，Story 3.1 owner)；不可前進 → 顯描述性 placeholder + 逃生口 hint list。
3. node 4 tests 涵蓋四 state、契約守恆、exhaustiveness。
4. 零 migration / 零新 npm / visionAdapter 零改 / regression anchor 零改。

## Files
- NEW `canProgress.ts` — 純 state→decision map
- NEW `canProgress.test.ts` — 4 named tests (state-by-state, ≥1 hint contract, exhaustiveness)
- NEW `components/NextStepGate.tsx` — Server Component；可前進 → 按鈕；不可 → placeholder + hint list
- MODIFIED `app/splits/[linkId]/review/page.tsx` — wire NextStepGate；footer 更新 Epic 2 完成

Gate: typecheck 0 / lint 0 / test 16 files / 153 passed | 2 todo / build 6 routes.

**Epic 2 全 7 stories 完成。**
