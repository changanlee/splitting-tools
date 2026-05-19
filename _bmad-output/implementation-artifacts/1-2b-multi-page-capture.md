# Story 1.2b: 多頁長收據擷取（依序組成單一邏輯收據）

Status: review

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

- [x] **Task 1：先讀 Next 16 文件（AGENTS.md 鐵則；防過時 API）（AC1, AC9）**
  - [x] 確認本 story 純 client 延伸、無新 Next API（沿用 1.2 已驗證 client component 模式：`'use client'`、useState/useRef、原生 canvas/pointer/Blob/objectURL）；記於 Debug Log。無需深讀新 doc。
- [x] **Task 2：頁面清單純邏輯（無 DOM、可 node 單測）（AC4, AC5, AC7）**
  - [x] `src/lib/image/pages.ts`：`Page` 型別 + 純函式 `addPage`/`removePage`/`movePage`（邊界回原參考 no-op）/`dedupePages`（首見保序）/`allPagesDecided`/`orderedPageIds` + `nextPageId`（非 crypto，secure-context-free）+ `computeSignature`（FNV-1a，非密碼學）。
  - [x] `src/lib/image/pages.test.ts`：21 具名 node 測試（append 不可變、remove 缺 id no-op、move 中間/頂/底邊界/缺 id no-op/不變更原陣列、dedupe 首見保序/空/全異、allPagesDecided 空=false/全決斷/任一未決斷、orderedPageIds、nextPageId 唯一、computeSignature 確定性/size 敏感/byte 敏感/空/Uint8Array）——全綠（RED→GREEN 確認）。
- [x] **Task 3：頁面內容簽章（client 膠合，極薄）（AC4）**
  - [x] 純 hash＝`computeSignature`（pages.ts，已測，非密碼學、無 crypto 相依）；blob 取樣為 CaptureFlow 內極薄 async glue：`blob.slice(0,1024).arrayBuffer()` → `computeSignature(blob.size, Uint8Array)`。
- [x] **Task 4：擴充 CaptureFlow 狀態機支援多頁（AC1, AC2, AC3, AC6）（UPDATE 既有檔）**
  - [x] `CaptureFlow.tsx` phase 擴為 `idle|compressing|editing|review|ready{blobs}|error`；`editing` confirm（已遮 blob 產出）後才 `addPage`（decided-by-construction）→ `review`；`ready` 持有序去重 `Blob[]`；單頁路徑語意與 1.2 等價（Blob[] 長度 1）。
  - [x] 保留 1.2 全部 post-review 修正：無 `capture`、`sr-only` input、await 前同步鎖 phase（每頁 confirm 同樣鎖定）。**設計澄清**：遮罩不可逆（NFR-S3），故「重編已遮頁」＝移除＋再拍（非 in-place 重遮）；spec「重編」以 remove+recapture 滿足，見 Completion Notes。
- [x] **Task 5：頁面清單 UI（review 階段，client component）（AC3, AC8）**
  - [x] 新增 `src/features/parsing/components/PageList.tsx`：每頁已遮縮圖 + 上移/下移/移除（`size-12`=48px、`aria-label`、Tab/Enter、文字「第 N 頁」+icon+語意色三重編碼）；CaptureFlow review 區「再拍下一段」「完成（allPagesDecided 才 enable）」「全部重拍」；不做拖曳排序/自動拼接。
  - [x] 縮圖只用**已遮 blob** 的 object URL（AC2 例外）；未遮 canvas 僅存 `phase.editing` 過渡、轉 review 即丟（NFR-S3）。
- [x] **Task 6：輸出契約落地（AC4, AC6）**
  - [x] 「完成」：`dedupePages` → 依頁序 `Blob[]` 存 `ready{blobs}`（client-only、無網路）；dedupe 丟棄頁同步 revoke thumb URL。檔頭/型別註解標明此 `Blob[]` ＝ Story 1.3 上傳輸入契約、單頁長度 1（相容 1.2）、「下一步＝上傳屬 1.3」。
- [x] **Task 7：驗收自查（AC6, AC7, AC9）**
  - [x] `pnpm typecheck`(0) && `pnpm lint`(0) && `pnpm test`（3 files，44 pass + 2 todo；既有 geometry/regression 0 回歸）&& `pnpm build`（綠）。
  - [x] 靜態掃描：`createObjectURL` 僅 1 處作用於**已遮 blob**（CaptureFlow:124），revoke 完整配對（remove:139 / dedupe:151 / resetAll:160 / unmount:81）；未遮原圖零持久化/網路/objectURL（其餘命中皆註解）；無 `visionAdapter` import；`src/app/api` 不存在；無新增 `package.json` 相依。
  - [x] Story 1.1/1.2 邊界檔內容未變（schema/worker/visionAdapter/compress/mask/geometry/CI harness）；單頁路徑語意與 1.2 等價（dev server 背景運行中，待瀏覽器手動 smoke→W 登記）。

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

claude-opus-4-7[1m]（dev-story，2026-05-19）

### Debug Log References

- Task 1（Next 16.2.x 複核 vs 訓練資料）：本 story 純 client 延伸，沿用 Story 1.2 已記錄之 Next 16 client component 行為（`'use client'` 必在檔首、`app/page.tsx` 維持 Server Component 渲染 client 子元件、僅 `NEXT_PUBLIC_*` 入 client、`<input type=file>`/canvas/Pointer/Blob/`URL.createObjectURL` 皆原生 DOM 無 Next 專屬 API）。未引入任何新 Next API 表面，無需深讀新 doc。
- 設計決策（NFR-S3 衍生）：遮罩為不可逆像素燒入，已遮頁無法「in-place 重遮」；故 review 階段不提供重編已遮頁，改以「移除＋再拍下一段」滿足 spec 之「重編」意圖。`allPagesDecided` 在 decided-by-construction 下恆為「清單非空」，仍保留為唯一 gating 判準（杜絕繞過）。
- `crypto.randomUUID` 規避：LAN dev 為 plain http（非 secure context），`randomUUID` 會 throw；改用 `nextPageId()`（monotonic，secure-context-free）。

### Completion Notes List

- ✅ Task 1（AC1/AC9）：Next 16 文件複核，確認無新 API（純 client 延伸）。
- ✅ Task 2（AC4/AC5/AC7）：`pages.ts` 純函式 + 21 具名 node 測試（RED→GREEN）；全套 3 files 44 pass + 2 todo，geometry/regression 零回歸。
- ✅ Task 3（AC4）：`computeSignature`（FNV-1a 純 hash，已測，無 crypto 相依）+ CaptureFlow 內 `blob.slice(0,1024).arrayBuffer()` 極薄 glue。
- ✅ Task 4（AC1/AC2/AC3/AC6）：CaptureFlow phase 擴 `idle|compressing|editing|review|ready{blobs}|error`；decided-by-construction；保留 1.2 全部 post-review 修正（無 capture、sr-only、await 前鎖 phase）；單頁＝Blob[] 長度 1 與 1.2 等價。
- ✅ Task 5（AC3/AC8）：`PageList.tsx`（已遮縮圖 + 上移/下移/移除，48px、aria、Tab/Enter、三重編碼）；極簡、無拖曳排序/自動拼接。
- ✅ Task 6（AC4/AC6）：`finish()` → `dedupePages` → 有序 `Blob[]` 存 ready；dedupe 丟棄頁同步 revoke；契約註解標明（Story 1.3 上傳輸入；單頁長度 1）。
- ✅ Task 7（AC6/AC7/AC9）：typecheck/lint/test(44+2)/build 全綠；AC9 靜態掃描——`createObjectURL` 僅 1 處作用於**已遮 blob**，revoke 四路徑配對（remove/dedupe/resetAll/unmount）；未遮原圖零洩漏；無 visionAdapter/api/新相依；1.1/1.2 邊界檔未變。
- 📋 **驗證協定回溯（CIP 比例化子集）**：
  - **AC↔測試映射**：AC4/AC5/AC7（清單/去重/gating/簽章）→ `pages.test.ts` 21 具名 node 測試；AC1/AC2/AC3/AC6/AC8（canvas/pointer/UI/objectURL 生命週期）＝瀏覽器互動，node 不可測（沿用 1.2 既定策略）→ **manual**（待 dev server 手動 smoke，登記 W）；AC9 → 靜態掃描證據 + 閘門全綠。
  - **LLM Compliance**：純 client、**無 LLM 呼叫 → N/A**（`docs/llm-compliance-checklist.md` 非 LLM story 跳過分節）。
  - **Deferred-work**：多頁手動瀏覽器驗證將登記 `deferred-work.md`（比照 W-1-2-1，P1）。

### Change Log

- 2026-05-19：Story 1.2b 多頁長收據擷取實作完成（CIP follow-up）。新增 `src/lib/image/pages.ts`(+test)、`PageList.tsx`；改寫 `CaptureFlow.tsx` 為多頁狀態機。輸出契約由單一 masked Blob → 有序去重 `Blob[]`（Story 1.3 上傳輸入）。閘門全綠（typecheck/lint/test 44+2/build），AC9 靜態掃描 clean。Status → review。

### File List

> A=新增 M=改。本 story 改動（接續 commit `a633d04` 之後）。

- `src/lib/image/pages.ts`（A：純多頁清單邏輯 + 簽章，node 可測）
- `src/lib/image/pages.test.ts`（A：21 vitest node 具名單測）
- `src/features/parsing/components/PageList.tsx`（A：`'use client'` review 頁面清單 UI）
- `src/features/parsing/components/CaptureFlow.tsx`（M：單頁 → 多頁狀態機 + 輸出 Blob[] 契約 + thumb objectURL 生命週期；保留 1.2 全部 post-review 修正）
- `_bmad-output/implementation-artifacts/1-2b-multi-page-capture.md`（M：Tasks/Dev Agent Record/Status）
- `_bmad-output/implementation-artifacts/sprint-status.yaml`（M：1-2b 狀態流轉）
