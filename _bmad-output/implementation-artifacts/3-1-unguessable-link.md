# Story 3.1: 不可猜分帳連結 ID（FR17 / NFR-S1）

Status: done

## AC
1. `generateLinkId()` — `crypto.randomBytes(16)` → base64url → 22 chars，**≥128-bit 熵**（架構 L256-258 明確拒用 UUIDv4 122-bit）。
2. `isValidLinkId(s)` strict shape guard — 22 chars [A-Za-z0-9_-] only。閘關 W-2-1-3：在 route handlers + review page 入口 reject 形狀錯的 linkId 直接 404。
3. `createSession` 改用 `generateLinkId()`（既有 sessions.id 為 text PK，無 migration）。
4. 5 named node tests（generate 形狀 / 100 ids 互異 / shape accept&reject 全覆蓋）。

## Files
- NEW `src/lib/linkId.ts` + `src/lib/linkId.test.ts`
- MODIFIED `src/features/parsing/server/jobs.ts` — createSession 用 generateLinkId
- MODIFIED `src/app/splits/[linkId]/review/page.tsx` — `isValidLinkId` 預檢 → notFound()
- MODIFIED `src/app/api/splits/[linkId]/parse-jobs/route.ts` — 預檢
- MODIFIED `src/app/api/splits/[linkId]/parse-jobs/[jobId]/route.ts` — 預檢

Gate: 17 files / 158 passed | 2 todo / 7 routes / 0 / 0. W-2-1-3 RESOLVED.
