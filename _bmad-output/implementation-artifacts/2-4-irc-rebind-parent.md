# Story 2.4: 變更 IRC 折扣歸屬母品項（FR12）

Status: done

## Story
As 付款人，I want 改正 IRC 折扣綁錯的母品項，so that 折扣折給正確的人。

## AC（核心）
1. 純 `recomputeNets(lines): { id, netCents, orphan }[]` — 全 session 重新 fold；IRC 指向不存在 / 指向另一 IRC → orphan；多筆 IRC 同母累加；conservation 守恆。
2. `rebindIrcAction(linkId, ircLineId, formData{parentId})` Server Action：zod-validate（parentId="" / "orphan" / 一個非 IRC line id），在 transaction 內 update IRC 的 ircAttributedTo + 重算所有 lines 的 netCents/orphan。失敗回 friendly。
3. UI：IRC row 「編輯/改綁」anchor → `?edit=<ircId>` → `IrcRebindForm`（<select> 母品項 + orphan 選項）→ 儲存後 revalidatePath，SubtotalBar 立即重算。
4. 既有 142 pass 零回歸；regression anchor 零改；zero migration / zero new npm / visionAdapter 零改。

## Files
- NEW `recompute.ts` + `recompute.test.ts` (5 named node tests incl. conservation)
- NEW `components/IrcRebindForm.tsx` — Server Component <select> + server action
- MODIFIED `server/actions.ts` — +`rebindIrcAction` (transactional re-fold)
- MODIFIED `components/ReceiptLineRow.tsx` — IRC branch also gets `editHref` (「改綁」/「編輯」label by orphan flag)
- MODIFIED `app/splits/[linkId]/review/page.tsx` — IRC editing → IrcRebindForm, non-IRC → ReceiptLineEditForm

Gate: typecheck 0 / lint 0 / test 15 files / 147 passed | 2 todo / build 6 routes.
