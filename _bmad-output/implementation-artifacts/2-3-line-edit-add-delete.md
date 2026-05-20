# Story 2.3: 逐行編輯與增刪行（FR10, FR11）

Status: done

## Files
- NEW `parseInputs.ts` + `parseInputs.test.ts` (9 named node tests)
- NEW `server/actions.ts` — editLine/deleteLine/addLine Server Actions (zod parse + drizzle mutate + revalidatePath)
- NEW `components/ReceiptLineEditForm.tsx` — inline edit + delete (server form actions)
- NEW `components/AddLineForm.tsx` — append new line (server form action, native <details>)
- MODIFIED `components/ReceiptLineRow.tsx` — adds optional `editHref` → 「編輯」 anchor (IRC rows skip)
- MODIFIED `app/splits/[linkId]/review/page.tsx` — `searchParams.edit=<lineId>` swaps row for form; AddLineForm at bottom

Gate: typecheck 0 / lint 0 / test 14 files / 142 passed | 2 todo / build 6 routes. visionAdapter / schema / migrations / package zero diff.

## Story
As 付款人，I want 修正品名/金額/數量並可增刪行，so that 兜不攏時能改對。

## ⚠️ Dev 鐵則
1. **三個 Next.js Server Actions**：`editLineAction(linkId, lineId, formData)` / `deleteLineAction(linkId, lineId)` / `addLineAction(linkId, formData)`。每個都 zod-validate + drizzle mutate + `revalidatePath`。
2. **零 client island**：URL `?edit=<lineId>` 切換 row 顯示 form variant；表單 `action={serverAction}` 走 progressive enhancement，零 JS。
3. **整數分**：UI 收 NT$X.XX 字串 → server 解析為整數分（兩位小數固定）。零 float、邊界驗證（gross_cents/qty 必整、qty>0）。
4. **不重新計算 IRC 折抵 net_cents**：本 story 只改 `gross_cents`/`description`/`qty`；`net_cents` 暫時 = `gross_cents`（編輯後 IRC 重綁是 2-4 範疇；本 story 不碰 IRC 行的母碼配對）。重編輯時 `net_cents := gross_cents`（覆蓋既有 1.5 計算的 net）保守一致——edit 必然破壞原 IRC 配對，由 2-4 重新對齊。**新增行**：是普通母行（is_irc=false, claimable=true, orphan=false, irc_attributed_to=null）。**刪除行**：硬刪（drizzle delete）；不留 tombstone（4.9 audit log owner）。
5. **session 必須存在**；其他 lifecycle gating（status=draft 才可編輯）非 2-3 scope。
6. 零新 npm、零 migration、visionAdapter 零改、regression anchor 零改。

## Acceptance Criteria
1. **AC1（純 parse helpers）** `parseCentsInput(str): number | null`：接 "NT$2,208.50" / "2208.5" / "2208" → `220850` / `220850` / `220800`；非法 → null（2 位小數固定，多位/負數/空 → null）。`parseQtyInput`（int>0）/`parseDescription`（min 1 / max 100 trim）皆純函式，node-test 全覆蓋。
2. **AC2（server actions）** 三個 actions 都呼叫 zod schema 驗證；DB 寫入用 drizzle；成功後 `revalidatePath('/splits/[linkId]/review')`；失敗回 friendly message（NFR-R1）。session 不存在 → throw `notFound()` 等價或回友善訊息。
3. **AC3（編輯 UI）** URL `?edit=<lineId>` → 對應 row 切換 form variant（描述 input / qty input / 金額 input + 「儲存」/「取消」），其他 row 唯讀；提交 → mutate + redirect to `/splits/[linkId]/review`（去掉 query）。
4. **AC4（新增 UI）** 列表底端 `<details>` 摺疊 + 表單；提交 → 寫入新 line（line_no = max(existing) + 1）。
5. **AC5（刪除 UI）** 行尾「刪除」按鈕（在 edit mode 才出現）→ 簡易確認 form（不用 dialog，純 server form 二次確認頁面或內嵌 confirm）。
6. **AC6（parsed_sum 即時重算）** mutate 後 revalidatePath → page 重新讀 receipt_lines → `Σ gross_cents` 立即反映，SubtotalBar 與可疑行重算（既有 2.1/2.2 邏輯）。**對帳狀態即時更新**（epic AC）。
7. **AC7（測試）** parse helpers 具名 node 測；server actions glue 非 node-test（IO/integration → W-defer）。既有 133 pass 零回歸；regression anchor 零改。
8. **AC8（邊界）** 不碰 schema/migrations/package/visionAdapter；不寫 4.9 audit log；不重綁 IRC（2.4）；session lifecycle status gating 非 2-3。
