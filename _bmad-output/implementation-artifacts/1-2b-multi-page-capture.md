# Story 1.2b: 多頁長收據擷取（依序組成單一邏輯收據）

Status: ready-for-dev

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a 付款人，
I want 一張拍不完的長收據可以分段多拍幾張、或從相簿多選，依序組成「同一張收據」，每頁一樣在裝置端壓縮並遮掉會員卡號，
so that Costco 那種超長收據也能完整進入解析，而不是被一張畫面截斷（FR1 擴充；`docs/PRD-multi-page-receipt-roadmap.md`）。

## Acceptance Criteria

> 來源：`epics.md#Story 1.2b`（CIP 2026-05-19）＋ 為防 LLM 模糊化補可驗證門檻；嚴格沿用 Story 1.2（done）之 NFR-S3 與零相依規則。

1. **AC1（多頁累積入口）** Given 已擷取並處理完一頁（壓縮+遮罩決斷完成），When 付款人選「再拍下一段」或「從相簿多選」，Then 該頁加入一個**有序頁面清單**，可繼續再加（直到頁數上限）；取消/未選不報錯、不破壞既有頁；單張流程（只加一頁就完成）行為與 Story 1.2 完全一致。
2. **AC2（逐頁 NFR-S3 不變 — 本 story 的靈魂）** Given 任一頁，Then 該頁**各自**走既有 `compressToCanvas` → 遮罩 → `applyMaskAndEncode`（**沿用** `src/lib/image/{compress,mask,geometry}.ts`，不得重寫）；任一頁的**未遮原圖**（原始 `File`/`ImageBitmap`/未遮 canvas）**永不**寫 `localStorage`/`sessionStorage`/`IndexedDB`/Cache、**永不**進網路、**永不**進 log、**永不** `createObjectURL`；只有「逐頁已遮+已壓縮」的 blob 進入可外送狀態。本 story 不發任何網路請求（上傳＝Story 1.3）。
   - **縮圖例外（明確允許，勿為了靜態掃描而繞路）：** 頁面清單縮圖**可**對「**已遮+已壓縮 blob**」用 `URL.createObjectURL`（已遮＝NFR-S3 安全，本就可離開裝置），但**必須**在移除該頁/卸載時 `URL.revokeObjectURL`。NFR-S3 的零洩漏鐵則只針對**未遮原圖**（與 1.2 一致；1.2 因直接畫 canvas 故零 object URL，1.2b 縮圖是新場景）。AC9 的靜態掃描據此**只**禁「未遮原圖的」object URL/網路/持久化，不禁已遮 blob 縮圖的 object URL。
3. **AC3（頁面管理 — 小工具級極簡）** Given 多頁清單，Then 付款人可：移除任一頁、調整頁序（上/下移動即可，不必拖曳排序）、預覽各頁縮圖；UI 維持單欄極簡（「再拍下一段／完成」為主動作），**明確不做**重型頁面管理器、不做自動拼接、不做自動 OCR 偵測頁序（過度工程化、違小工具定位）。
4. **AC4（輸出契約：有序、去重的 blob 陣列）** Given 付款人按「完成」，Then 輸出為一個**有序的、已去重的**「已遮+已壓縮」`Blob[]`（順序＝付款人確認的頁序）；完全相同內容的重複頁做基本去重（以內容簽章，如 `size`+簡易 hash）；此 `Blob[]` 是 **Story 1.3 上傳的輸入契約**（單頁時長度為 1，與 1.2 的單 blob 語意相容）。重複/缺頁的語意正確性最終由 Epic 2 對帳閘門兜底，但本 story 須完成基本去重 + 穩定排序。
5. **AC5（每頁強制決斷，decided-by-construction）** Given 任一頁，Then 該頁**只有在** per-page 決斷已滿足（`hasUsableMaskOrSkip(rects, skip) === true`，沿用 1.2 之 `applyMaskAndEncode` confirm 路徑）後，**才**被加入頁面清單——清單中不存在「未決斷頁」。若付款人從清單「重編」某頁，該頁須**回到未完成狀態並重新滿足決斷**才能回填清單。`allPagesDecided` 為**防衛性不變量**（清單非空且每頁 `decided===true`）；「完成」鍵 gating ＝ `allPagesDecided(list)`（在 decided-by-construction 下即等同「清單非空」，但仍以此純函式為唯一判準，杜絕繞過）。
6. **AC6（單頁路徑零回歸）** Given 只擷取一頁就「完成」，Then 行為、產出、隱私保證與 Story 1.2 完全等價（輸出 `Blob[]` 長度 1）；Story 1.2 既有檔（`CaptureFlow`/`MaskEditor`/`compress`/`mask`/`geometry`）之既有行為與測試不被破壞，含 1.2 之 post-review 修正（無 `capture` 屬性、`sr-only` input、`clampMaskRect` 向外取整+非有限值零面積、MaskEditor 多指/pointercancel 守衛、CaptureFlow await 前同步鎖 phase）全部保留。
7. **AC7（純函式可測 + 綠燈）** Given `pnpm test`，Then 頁面清單邏輯（加入/移除/重排/去重/`allPagesDecided` gating）抽為**純函式**置 `src/lib/image/pages.ts`，有 node 環境單元測試且全綠；canvas/DOM 膠合層**不**入 node 單元測試（沿用 1.2 既定策略，避免引入 jsdom/canvas 重相依）；既有 `geometry.test.ts` + `regression-invariants.test.ts`（23 pass + 2 todo）零回歸。
8. **AC8（行動優先 + 基本無障礙，沿用 1.2 AC7）** Given 行動單欄，Then 主要動作鍵實心 accent、滿寬、≥48px；頁面清單可 Tab 可達、Enter/Space 可觸發移除/移動；狀態以「文字＋圖示＋顏色」三重編碼（非僅顏色）；對比 ≥4.5:1。明確**不**追 WCAG AA（NFR-A2/UX-DR16）。
9. **AC9（既有不回歸 + 邊界鐵則）** Given 改動，Then `pnpm lint && pnpm typecheck && pnpm test && pnpm build` 全綠；**不**觸碰 `src/lib/llm/visionAdapter.ts`；**不**建任何 `src/app/api` route；**不**入 pg-boss job；**不**發任何網路請求；**零新增 npm 相依**（原生 `createImageBitmap`/`<canvas>`/`toBlob`，沿用 1.2）；不更動 Story 1.1 邊界檔（schema/worker/visionAdapter/CI harness）。

## Tasks / Subtasks

- [ ] **Task 1：先讀 Next 16 文件（AGENTS.md 鐵則；防過時 API）（AC1, AC9）**
  - [ ] 本 story 為純 client 延伸（無新 Next API 預期）；仍依 AGENTS.md 確認 `node_modules/next/dist/docs/` 中 client component / state 相關無變動，記於 Debug Log。若需新 Next API 才深讀對應 doc。
- [ ] **Task 2：頁面清單純邏輯（無 DOM、可 node 單測）（AC4, AC5, AC7）**
  - [ ] 新增 `src/lib/image/pages.ts`：型別 `Page = { id: string; signature: string; decided: boolean }`；純函式 `addPage(list, page)`、`removePage(list, id)`、`movePage(list, id, dir: 'up'|'down')`（穩定、邊界安全）、`dedupePages(list)`（依 `signature` 保留首見、保序）、`allPagesDecided(list): boolean`（非空且每頁 `decided===true`）、`orderedPageIds(list)`。
  - [ ] `src/lib/image/pages.test.ts`（co-located，vitest node env）：空清單、單頁、移除中間/頭/尾、移到頂/底邊界、重複 signature 去重保序、未決斷頁使 `allPagesDecided=false`、移動不破壞既有順序——具名測試全綠。
- [ ] **Task 3：頁面內容簽章（client 膠合，極薄）（AC4）**
  - [ ] 在既有 image 膠合層加一個薄函式：對「已遮+已壓縮 blob」算簽章（`blob.size` + 取樣 bytes 的簡易 hash，**不**引入 crypto 相依；夠用即可，去重是 best-effort，非安全用途）。註記：簽章僅用於去重，非密碼學用途。
- [ ] **Task 4：擴充 CaptureFlow 狀態機支援多頁（AC1, AC2, AC3, AC6）（UPDATE 既有檔）**
  - [ ] `src/features/parsing/components/CaptureFlow.tsx`：phase 由 `idle|compressing|editing|ready|error` 擴為支援頁面清單。建議模型：`editing` 之 confirm（已滿足 `hasUsableMaskOrSkip` + `applyMaskAndEncode` 產出已遮 blob）→ **才**推入 `pages`（decided-by-construction，AC5）→ 進 `review`（顯示清單 + 「再拍下一段」「完成」）；`ready` 改持 **有序去重 `Blob[]`**（非單一 blob）；`compressing/editing/error` 維持單頁語意。從 `review` 重編某頁 → 回 `editing`，須重新 confirm 才回填。**單頁路徑（只加一頁就完成）必須與 1.2 等價**（AC6）。
  - [ ] 保留 1.2 全部 post-review 修正：無 `capture`、`sr-only` 隱藏 input、await 前同步鎖 phase 防雙擊重入（多頁時每頁 confirm 同樣鎖定）。
- [ ] **Task 5：頁面清單 UI（review 階段，client component）（AC3, AC8）**
  - [ ] 既有 `src/features/parsing/components/` 下新增極簡頁面清單元件（或內嵌 CaptureFlow review 區）：每頁縮圖 + 「上移／下移／移除」鍵（≥48px、Tab/Enter 可達、三重編碼）；「再拍下一段」觸發既有單頁擷取流程回填清單；「完成」於 `allPagesDecided` 才 enable。**不**做拖曳排序、不做自動拼接。
  - [ ] 縮圖只顯示**已遮**頁（未遮像素永不顯示/外送，AC2）；用後釋放未遮中間物（沿用 1.2 `bitmap.close()`/丟 canvas 參考的紀律）。
- [ ] **Task 6：輸出契約落地（AC4, AC6）**
  - [ ] 「完成」時：`dedupePages` → 依頁序產生 `Blob[]`，存於 `ready` 狀態（client-only、無網路）。明確標註：此 `Blob[]` 為 Story 1.3 上傳輸入契約；單頁長度 1（向後相容 1.2）。
  - [ ] 檔頭/型別註解標明 NFR-S3 逐頁邊界與「下一步＝上傳屬 Story 1.3」。
- [ ] **Task 7：驗收自查（AC6, AC7, AC9）**
  - [ ] `pnpm lint`(0) && `pnpm typecheck`(0) && `pnpm test`（既有 23 pass+2 todo 不回歸 + `pages.test.ts` 新具名測試全綠）&& `pnpm build`（綠）。
  - [ ] 靜態掃描：**未遮原圖**零 `localStorage`/`sessionStorage`/`indexedDB`/`caches`/`fetch`/`XHR`/`sendBeacon`/`createObjectURL`；`createObjectURL` 若出現，須證明只作用於**已遮 blob 縮圖**且有對應 `revokeObjectURL`（AC2 例外）；無 `@/lib/llm/visionAdapter` import；`src/app/api` 不存在；無新增 `package.json` 相依。
  - [ ] 內容核對 Story 1.1/1.2 邊界檔未被破壞；單頁路徑手動 smoke（dev）確認與 1.2 等價。

## Dev Notes

### 範圍鐵則（最高優先，防 scope creep / 防回歸）

- **本 story 100% client-side、延伸而非重寫。** 嚴禁重寫 `compress.ts`/`mask.ts`/`geometry.ts` —— 多頁只是「對每一頁重複呼叫既有單頁管線」+ 一層有序頁面清單。**不**建 API route、**不**發網路、**不**入 pg-boss、**不**碰 `visionAdapter.ts`。上傳/job ＝ Story 1.3；視覺 LLM 如何吃多圖 ＝ Story 1.4（本 story 完全不涉，只負責產出有序 blob 陣列契約）。[Source: architecture.md#Implementation-Sequence L311-320；docs/PRD-multi-page-receipt-roadmap.md §3]
- **明確 OUT（過度工程化、違小工具非商業定位）：** 自動影像拼接（stitch）、自動 OCR 偵測頁序/重複、拖曳排序 UI、重型頁面管理器、伺服器端再處理。頁序由付款人手動「上移/下移」確認即可。[Source: docs/PRD-multi-page-receipt-roadmap.md §4 風險「UX over-engineering」]
- **零新增 npm 相依。** 沿用瀏覽器原生 `createImageBitmap`+`<canvas>`+`toBlob`（1.2 已驗）。去重簽章用 `blob.size`+簡易 byte 取樣 hash，**不**引入 crypto/hash 套件。[Source: Story 1.2 Dev Notes「零新增 npm 相依」；Side Project 標準「不過度工程化」]

### NFR-S3 — 逐頁單向保證（違反即資安事故）

每一頁獨立適用 Story 1.2 的 NFR-S3 鐵則：未遮原圖只短暫存記憶體、用後即釋放；**永不**持久化/網路/log；遮罩必須**燒進像素**（沿用 `applyMaskAndEncode`，非 CSS overlay/blur）。多頁清單中保留的，只能是逐頁「已遮+已壓縮 blob」。縮圖顯示亦只能用已遮頁。[Source: architecture.md L247-250；prd.md FR43/NFR-S3；Story 1.2 AC4/Dev Notes]

### 輸出契約變更（本 story 的架構貢獻 — Story 1.3 依此 fold-in）

- 1.2 的擷取產出＝**單一** masked `Blob`。1.2b 將其改為**有序、去重的 `Blob[]`**（單頁＝長度 1，向後相容）。
- 這是 Story 1.3「非阻塞解析提交」的**上傳輸入契約**：1.3 將上傳此 `Blob[]`、job 帶頁數。請在型別與註解中把契約寫死清楚，讓 1.3 create-story 能無痛 fold-in。[Source: epics.md#Story 1.3 〔CIP fold-in〕；docs/PRD-multi-page-receipt-roadmap.md §2-3]
- **鎖定決策（非本 story 範圍，勿實作）：** 視覺 LLM 用「單次 Claude 多圖呼叫」vs 逐頁＝Story 1.4 create-story 拍板；頁數硬上限（建議 ≤5/parse）＝Story 1.7 拍板。本 story 僅需把上限做成一個可配置常數（預設 5）以 gate UI「再拍下一段」，實際 enforcement 在 1.7。[Source: docs/PRD-multi-page-receipt-roadmap.md §5]

### Previous Story Intelligence（Story 1.2，done — 必讀，勿重蹈/勿重造）

- **既有可重用模組（直接呼叫，勿重寫）：** `compressToCanvas`/`canvasToJpegBlob`（`compress.ts`）、`burnMasksIntoCanvas`/`applyMaskAndEncode`（`mask.ts`）、`computeResizedDimensions`/`clampMaskRect`/`hasUsableMaskOrSkip`（`geometry.ts`）。多頁＝對每頁重跑這條,外加 `pages.ts` 清單邏輯。
- **1.2 post-review 修正＝現行 baseline，不得回退：**
  - `geometry.clampMaskRect`：非有限值→零面積、向外取整（floor 近邊/ceil 遠邊，隱私安全）；對應 node 測試已存在。
  - `MaskEditor`：單一 active pointerId（忽略多指）、`onPointerCancel`/`onLostPointerCapture` 重置、`toImageCoords` 未排版回 `null`、**儲存前 `clampMaskRect`**（閘門跑在 clamp 後 rects）。
  - `CaptureFlow.onConfirmMask`：await 前同步把 phase 切離 `editing`（防雙擊重入二次燒罩）。多頁每頁 confirm 同樣需此鎖。
  - file input：**無 `capture` 屬性**（iOS Safari 會強制相機、移除相簿；違反「可改選相簿」）、用 **`sr-only`** 非 `display:none`（iOS 對 display:none input 的 `.click()` 會被忽略）。多頁「再拍下一段」沿用同一顆 input 模式。
- **測試策略（沿用，勿改全域 env）：** `vitest.config.ts` = node env、co-located `*.test.ts`、`@`→`src`。canvas/`toBlob`/pointer 在 node 無原生，**不**為單測它裝 jsdom+canvas；可測邏輯（`pages.ts`）抽純函式全測，canvas/pointer 膠合靠手動/瀏覽器（與 1.2 一致，記入 deferred-work 若有手動待辦）。
- **dev 環境注意：** 實機/LAN 測試需 `next.config.ts` 的 `allowedDevOrigins`（Next 16 預設擋 LAN `/_next/*`，否則不 hydrate）；目前已含 `192.168.1.8`，換網段要更新。[Source: 1-2-capture-compress-mask.md（全檔）、deferred-work.md#W-1-2-1（RESOLVED）]

### Git Intelligence（近期 commit 模式 — 沿用）

近期 commit 鏈（`8b588f1`→`7b0f5e9`）建立的慣例：Conventional Commits、**每 story / 每邏輯單元一 commit**、**claim 完成前必跑 lint/typecheck/test/build 並貼證據**（verification-before-completion）、NFR-S3 以靜態掃描佐證、deferred / by-design 一律登記 `deferred-work.md` 非 silent。本 story 沿用：dev 完成後跑閘門 → per 驗證協定做 code-review → 每邏輯單元 commit。[Source: git log；MEMORY.md verification-protocol]

### 最新技術資訊

無新增函式庫（零相依政策延續）。瀏覽器原生 `createImageBitmap`/`<canvas>`/`toBlob`/Pointer Events 已於 1.2 實證可用於 iOS Safari（含 `imageOrientation:"from-image"`）。Next 16 client component 行為已於 1.2 Debug Log 記錄；本 story 純 client 延伸,預期無新 Next API（仍依 Task 1 確認）。

### Project Structure Notes

- 與架構一致：擷取/壓縮/遮罩屬 FR1-7 → `src/features/parsing/components/`（擴充 `CaptureFlow`，視需要新增極簡頁面清單元件）；純清單邏輯下沉 `src/lib/image/pages.ts`（對齊 1.2 的 `geometry.ts` 純函式下沉慣例、node 可測）。[Source: architecture.md L533-548；Story 1.2 File List]
- 變異/衝突：架構未規定多頁互動手法（多頁本身為 CIP 後新增）→ 本 story 以「手動多拍/多選 + 上移下移 + 基本去重 + 有序 blob 陣列契約」決斷並記錄理由（見上 範圍鐵則）。後續 server 端如何消費屬 1.3/1.4，不在此。

### References

- [Source: epics.md#Story 1.2b]（AC 來源、FR1 擴充、與 1.2/1.3 邊界）
- [Source: docs/PRD-multi-page-receipt-roadmap.md]（CIP 決策、風險、鎖定決策、輸出契約）
- [Source: prd.md FR1（已改寫為「一或多張」）、FR43/NFR-S3]
- [Source: architecture.md#Implementation-Sequence L311-320 / #Project-Structure L533-554 / L247-250（NFR-S3 前端遮蔽）/ L283（~1600px 壓縮）]
- [Source: 1-2-capture-compress-mask.md（全檔，含 Dev Agent Record / Review Findings / On-device 驗證）]
- [Source: deferred-work.md#W-CR-5（多頁解析準確率 n=0，回歸測資待 1.4/1.5）、#W-1-2-1（RESOLVED，1.2 實機紀錄）]
- [Source: 專案根 AGENTS.md（寫碼前讀 Next 16 文件）]

## Dev Agent Record

### Agent Model Used

（dev-story 時填入）

### Debug Log References

### Completion Notes List

### File List
