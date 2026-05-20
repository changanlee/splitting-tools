# Story 2.5: 手動輸入印製總額（FR13）

Status: done

## AC
1. `setPrintedTotalAction(linkId, formData)` — empty 清除（→ awaiting_printed_total）；否則 `parseCentsInput` 驗證為整數分；update sessions.printed_total_cents + revalidate。
2. `PrintedTotalForm` Server Component — `<details>` 摺疊，預設 open 當 currentCents===null；input pattern strict。
3. SubtotalBar 立即重算（既有 computeReconciliation 走新值）。
4. 零 migration（sessions.printed_total_cents 既有 1.1）；零新 npm；visionAdapter / regression anchor 零改。

Gate: 147pass2todo / 6 routes / 0 / 0.
