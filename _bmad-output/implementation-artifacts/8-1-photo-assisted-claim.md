# Story 8.1: 拍照認領（Phase 1）——拍實體商品照、視覺對應收據行、初步認領到本人

Status: in-progress

<!-- 來源：2026-06-21 brainstorming（長安「拍照後做初步的認領」）→ CIP 新增 Epic 8（additive，依賴 Epic 1 視覺邊界 + Epic 4 認領/身分）。Phase 1 = 本 story；Phase 2（精確件數、實物縮圖）見文末 deferred。 -->

## ⚠️ Dev 鐵則（最高優先）

1. **唯一 LLM 邊界**：所有外部 LLM 呼叫**只**經 `src/lib/llm/` 內的 adapter（現有 `visionAdapter`、`verifyTranslations`）。本 story 新增 `src/lib/llm/matchProductsAdapter.ts`，**禁**任何 route handler / 元件 / server action 直呼 `openrouter.ai`（架構：單一邊界）。
2. **Provider/model 不換 pin**：沿用 `anthropic/claude-sonnet-4.6`（`src/lib/llm/models.ts` PRIMARY，registry §2），走 OpenRouter。**不新增 model pin**（不必 mini-eval）。寫實際呼叫前 **MUST 先 invoke `claude-api` skill**（最新 SDK/vision 多圖/結構化輸出最佳實務，覆蓋訓練資料）。
3. **NFR-L4 worker-only**：視覺比對是 >1s 的 LLM 呼叫，**只能在 worker 程序**跑——比照 `parseWorker`，新增一個 pg-boss `match` queue + `matchWorker`，**禁**在 request thread / server action 內直接呼叫 LLM。
4. **NFR-R2 永不卡死**：比對失敗（重試耗盡 / 無 key / 低信心）→ 友善訊息、**不自動認領**，使用者仍可手動認領（Epic 4 既有流程完全不受影響）。原始 LLM/stack 錯誤零外洩。
5. **LLM-Ops 非協商**：retry+jitter≥3、每次嘗試寫 `llm_costs`、降級鏈、cost 有界——**複用** `retry.ts` / `costLog.ts`，比照 `verifyTranslations` 的寫法。
6. **不越界（Phase 2 OUT）**：本 story = 整行認領（whole-line），**不做**精確件數分配；**不做**實物縮圖掛行（需新影像儲存/CDN）。兩者明確 deferred。

## Story

As a 參與分帳的朋友（已綁定身分），
I want 拍一張我拿走的實體商品照，系統自動辨識並對應到收據逐行明細、把對到的品項初步認領到我名下，
so that 我不必逐行手動找自己的東西打勾——拍照即得初稿、再微調即可（延伸 FR20-34 自助認領）。

## Acceptance Criteria

> 來源：2026-06-21 brainstorming 決議（option 1+2）＋ 既有 Epic 4 認領契約 ＋ LLM 非協商（`docs/llm-compliance-checklist.md`）＋ 為防 LLM 模糊化補可驗證門檻。

1. **AC1（認領板入口 + 身分前置）** Given 一個已綁定身分（device-token，Epic 4-1/4-2）的使用者在認領板，When 點「📷 拍照認領」並上傳 1..N（≤`MAX_PARSE_PAGES`）張商品照，Then 經既有影像壓縮管線（1.2）後送出，建立一個 pg-boss `match` job（payload 含 `sessionId, identityId, images[]base64, mimeTypes[]`），立即回 `jobId`（<1s，request thread 不呼叫 LLM）。**未綁定身分** → 先導到身分選擇（不可匿名認領）。
2. **AC2（單一 LLM 邊界 + 單次多圖）** Given `match` job，When `matchWorker` 消費，Then **只**呼叫 `src/lib/llm/matchProductsAdapter.matchProductsToLines(images, mimeTypes, lines, ctx)`；該 adapter 對 OpenRouter（`anthropic/claude-sonnet-4.6`）做**單次**多圖呼叫，輸入＝商品照 + 該 session 已解析的收據行（`lineNo + description`，來自 `receipt_lines`，只給可認領的非 IRC 行）；**無任何**其他 `openrouter.ai` 呼叫點（靜態掃描可證）。
3. **AC3（Zod 驗證的比對契約）** Given LLM 回應，Then 經 **Zod `ProductMatchSchema`**（置 `src/features/claiming/photoMatch.ts`，`…Schema` 命名 + `z.infer`）驗證為 `{ matches: { lineNo:int, present:boolean, confidence:number(0..1) }[] }`；結構錯＝進降級/失敗，不得把未驗證資料用於認領。
4. **AC4（信心門檻 → 初步整行認領）** Given 驗證後的 matches，Then 純函式 `pickConfidentMatches(matches, lines, threshold)` 選出 `present===true && confidence>=THRESHOLD（預設 0.6，常數可調）` 且對應到存在的可認領行；`matchWorker` 用**既有** `claimRepo`/`shareMath`（Epic 4-4/4-5）把這些行以**整行**初步認領到 `identityId` 名下；認領是**疊加非破壞**（不覆寫他人既有認領；衝突＝照既有 last-write-wins / pending 規則）。低於門檻者**不自動認領**，列為「待確認」供使用者手動點選。
5. **AC5（NFR-R2 永不卡死 + 友善降級）** Given 重試耗盡 / 無 key / 全低信心 / 0 match，Then job 達終態（`succeeded`含 0 認領 / `degraded` / `failed`），寫**友善**訊息；**自動認領失敗不影響**手動認領與其餘流程；原始錯誤零外洩。
6. **AC6（LLM-Ops：retry/log/cost/degrade，複用）** Given **每次** LLM 嘗試，Then 退避+jitter≥3（`retry.ts`）、寫 `llm_costs`（`recordLlmCost`，model/tokens/latency/cost/session/success）、降級 sonnet→haiku→友善（`DEGRADATION_MODELS`）；成本**有界**：一次請求一組照片、`match` 不開 web plugin（純視覺，無 web 成本）。
7. **AC7（結果回呈 + 認領板反映）** Given job 終態，Then 認領板顯示：已自動認領的行（標「📷 初步認領」可取消/調整）、待確認的低信心行（一鍵手動認領）、未對應到的行（原樣）；輪詢/重整沿用 Epic 4 既有機制（`W-4-8-1` polling 不在本 story 範圍）。
8. **AC8（測試 + 綠燈 + 邊界不回歸）** Given `pnpm test`，Then 純邏輯（`ProductMatchSchema` 解析含非法輸入、`pickConfidentMatches` 門檻/越界/缺行、claim-seed 對應）node 全測；LLM SDK / matchWorker / DB 整合不入 node（型別 + 靜態掃描 + `W-8-1-1` runtime）；既有測試**零回歸**；`pnpm lint && typecheck && build` 全綠；唯一 `openrouter.ai` 邊界仍只在 `src/lib/llm/`。
9. **AC9（LLM Compliance on-spec）** Given 本 story 為 LLM 邊界 story，Then `## LLM Compliance` 表：item1（retry）✅、item2（cost log）✅、item3（async/queue，新 `match` job）✅、item4（degrade）✅、item5（per-call log）✅、item6 N/A（非 chat 串流）、item7（rate limit）⏸ 沿用既有 budget seam或登記 deferred。任一 P0 未交代不得 ready。

## Tasks / Subtasks

- [x] **Task 0**（鐵則 2）：呼叫寫法參照已落地的 `verifyTranslations.ts`/`visionAdapter.ts`（OpenRouter raw fetch + 多圖 + json_schema + recordLlmCost），沿用同 pin、不開 web plugin。
- [x] **Task 1**（AC3,AC4,AC8）：`src/features/claiming/photoMatch.ts`（純）——`ProductMatchSchema` + `PRODUCT_MATCH_JSON_SCHEMA` + `MATCH_CONFIDENCE_THRESHOLD=0.6` + `pickConfidentMatches()`；`photoMatch.test.ts` 7 測（合法/非法/門檻/absent/越界/dedupe/預設門檻）全綠。
- [x] **Task 2**（AC2,AC6）：`src/lib/llm/matchProductsAdapter.ts`——第三個 LLM 邊界，單次多圖、`DEGRADATION_MODELS`、`buildAttemptPlan`/`backoffWithJitterMs`/`isRetryableStatus`、`recordLlmCost`、`response_format` json_schema、**不開 web plugin**；best-effort 回 `{matches:[]}`、永不 throw（NFR-R2）。typecheck/lint 綠。
- [ ] **Task 3**（AC1,AC3,AC5）：`match` pg-boss queue + `matchWorker.ts`（比照 `parseWorker`：markStatus、resolve 不 throw、NFR-R2）；掛 `src/workers/index.ts`。 ← 整合層，待續
- [ ] **Task 4**（AC1,AC4,AC7）：API route `POST /api/splits/[linkId]/claim-photos` + 狀態查詢；認領板「📷 拍照認領」入口（複用 1.2 capture/compress + 4-x 板元件）；結果回呈。 ← 整合層，待續
- [ ] **Task 5**（AC4）：matchWorker 成功路徑用既有 `claimRepo`/`shareMath` seed 整行認領到 `identityId`（疊加非破壞）；初步標記決策（`claims.source` 欄 vs change-log）。 ← 整合層，待續
- [ ] **Task 6**（AC8,AC9）：全 gate 綠 + 靜態掃描 + LLM Compliance 表 + deferred 登記。 ← 待整合層完成後

## Dev Notes

### 範圍鐵則（Phase 1 OUT 清單）

- **OUT**：精確「這人拿了幾件」的件數分配（→ Phase 2 / Story 8-2）；每行掛實物縮圖（需新影像儲存/CDN，app 目前無長期影像儲存）（→ Phase 2）；polling 即時化（`W-4-8-1`，非本 story）。
- **IN**：拍照 → 視覺對應收據行 → 信心門檻 → 整行初步認領到本人 + 待確認清單。

### 複用既有（勿重造輪子）

- **影像**：`src/lib/image/*`（1.2 壓縮/遮罩）、`MAX_PARSE_PAGES`（`schema.ts`）。
- **LLM**：`src/lib/llm/{models,retry,costLog}.ts`；新 adapter 比照 `verifyTranslations.ts`（raw fetch + json_schema + best-effort）。
- **認領**：`src/features/claiming/{shareMath,server/claimRepo,server/changeLog}.ts`、認領板元件（4-4/4-5/4-6）。
- **身分**：`src/features/identity/*`（4-1/4-2 device token）。
- **Worker**：`src/workers/{index,parseWorker}.ts` 為 `matchWorker` 範本。

### 架構/資料決策（documented，非 silent）

- **新 schema 欄？**：「初步認領」是否需 `claims.source`（`auto|manual`）以利 UI 標示與「一鍵清除自動認領」？dev 評估最小可行：優先用既有 `claim_changes`（4-9 change-log）記 source，避免動 `src/db/schema.ts`；若 UI 確需持久旗標 → 加單一 `source` 欄（單純 additive migration）並記錄。**勿擅自大改 schema**。
- **比對準確度天生有限**（實體包裝照 ↔ 收據文字）：故門檻保守（0.6）、只自動認領高信心、其餘「待確認」，且一律可手動覆蓋——這是產品定位（初稿非定稿），非 bug。
- **成本**：`match` 為純視覺單次呼叫（**不開 web plugin**，避免 `verifyTranslations` 觀測到的 $0.7-0.9 web 成本）；每人一次、有界。

### LLM Compliance（`docs/llm-compliance-checklist.md`）

| # | 項目 | 8.1 處置 | 指向 |
|---|---|---|---|
| 1 | retry≥3 jitter | ✅ 複用 `retry.ts` | AC6, Task2 |
| 2 | 持久化 cost | ✅ `recordLlmCost`→`llm_costs` | AC6 |
| 3 | >1s async/queue | ✅ 新 `match` pg-boss job + matchWorker | AC1, Task3 |
| 4 | 降級鏈 | ✅ sonnet→haiku→友善 | AC5 |
| 5 | per-call log | ✅ 每次嘗試寫 `llm_costs` | AC6 |
| 6 | SSE 串流 | N/A（async job，非 chat） | — |
| 7 | per-user rate limit | ⏸ 沿用 budget seam 或登記 deferred | AC9 |

### References

- [Source: 2026-06-21 brainstorming（長安「拍照後做初步認領」，option 1+2）]
- [Source: epics.md#Epic 4（認領 FR20-34）；本 story 為 Epic 8 additive 延伸]
- [Source: src/lib/llm/verifyTranslations.ts（OpenRouter raw-fetch + json_schema + best-effort 範本）、visionAdapter.ts（單次多圖 + LLM-Ops）、models.ts/retry.ts/costLog.ts]
- [Source: src/workers/parseWorker.ts + index.ts（worker/queue 範本，NFR-L4/R2）]
- [Source: src/features/claiming/{shareMath.ts,server/claimRepo.ts,server/changeLog.ts}、src/features/identity/*（複用認領+身分）]
- [Source: src/lib/image/*（1.2 壓縮）、src/features/parsing/schema.ts（MAX_PARSE_PAGES）]
- [Source: ops/model-registry.md §2（splitting_tools pin = anthropic/claude-sonnet-4.6，不換）；`claude-api` skill]

## Dev Agent Record

### Completion Notes List

- 2026-06-21（dev-story，部分）：**Task 0-2 完成**——可單測核心 + LLM 邊界落地、全綠。
  - `photoMatch.ts`（純）：契約 + 信心門檻選擇器，7 node 測。
  - `matchProductsAdapter.ts`：第三個 LLM 邊界（OpenRouter sonnet→haiku、單次多圖、json_schema、recordLlmCost、不開 web plugin、best-effort 不 throw）。
  - **不換 model pin**、未動 `src/db/schema.ts`、唯一 openrouter 邊界仍只在 `src/lib/llm/`。
- **待續（整合層 Task 3-5）**：`match` queue + matchWorker、API route、認領板拍照入口 + 結果回呈、用 claimRepo seed 認領。需逐一讀既有 `parseWorker`/`queue.ts`/claim board page/route/`claimRepo` 對齊 pattern；且 live 驗證需 VPS 有效 key（`W-8-1-1`）。於 checkpoint 暫停等使用者決定是否續跑。

### File List

> A=新增 M=改。
- `src/features/claiming/photoMatch.ts`（A：純比對契約 + 門檻選擇器）
- `src/features/claiming/photoMatch.test.ts`（A：7 node 測）
- `src/lib/llm/matchProductsAdapter.ts`（A：第三個 LLM 視覺邊界）
- `_bmad-output/implementation-artifacts/{8-1-...md, sprint-status.yaml}`（A/M）

### Deferred / Follow-ups

- **W-8-1-1**（P1）：真 LLM runtime 驗證——本機 `.env` key 失效史（見 [[openrouter-key-on-vps]]），有效 key 在 VPS；比對準確率須以真 key 實測（比照 `W-1-4-1`，不謊報）。
- **Phase 2（Story 8-2，未排）**：①精確件數分配（同款多件、誰拿幾件）；②每行掛實物縮圖（需影像儲存/CDN 基礎建設）。
