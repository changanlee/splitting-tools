# Story 1.2: 收據拍照/相簿擷取、前端壓縮與卡號遮蔽

Status: review

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a 付款人，
I want 用相機或相簿選一張收據，並在上傳前於裝置端壓縮、把會員卡號塗掉，
so that 控制傳輸量、且會員卡號絕不離開我的裝置（FR1、FR2、FR43、NFR-S3）。

## Acceptance Criteria

> 來源：`epics.md#Story 1.2`（GWT 逐字）＋ 為防 LLM 模糊化補上可驗證門檻。

1. **AC1（擷取入口）** Given 付款人在首頁，When 點「拍收據」，Then 觸發 `<input type="file" accept="image/*">`（**不寫死 `capture`**：`capture="environment"` 在 iOS Safari 會強制相機並移除「相簿/檔案」選項，違反「可改選相簿」；移除後由 OS 原生選單提供「拍照／相簿／檔案」，相機仍一鍵可達、亦可上傳既有圖片）；未選/取消不報錯、回到可再點狀態。〔2026-05-19 修：原 AC 文字自相矛盾（同時要 `capture` 又要可選相簿），經使用者拍板採「拿掉 capture」〕
2. **AC2（前端壓縮）** Given 已選一張影像，When 進入處理，Then 於**裝置端**將長邊縮至 ~1600px（等比、不放大小於 1600px 的圖）、重新編碼為 JPEG（品質 ~0.8）、**移除 EXIF**；典型收據輸出 < ~500KB。
3. **AC3（卡號遮蔽 — 強制決斷）** Given 壓縮後預覽，When 上傳前，Then 付款人必須二擇一才能繼續：(a) 於影像上拉出 ≥1 個**不透明實心**遮罩矩形覆蓋會員卡號區並套用，或 (b) 明確勾選「此收據無會員卡號」；遮罩像素**燒進**輸出影像（非 CSS overlay、非可逆模糊）。
4. **AC4（NFR-S3 單向保證）** Given 任一時點，Then **只有**已遮蔽＋已壓縮的影像存在於可外送狀態；未遮原圖（原始 `File`/`ImageBitmap`/原始 canvas）僅短暫存在記憶體、用後即釋放，**永不**寫入 `localStorage`/`sessionStorage`/`IndexedDB`、**永不**進入任何網路請求、**永不**進 log。本 story 不發送任何網路請求（上傳屬 Story 1.3）。
5. **AC5（純函式可測 + 綠燈）** Given `pnpm test`，Then `src/lib/image/geometry.ts` 的純函式（縮放尺寸計算、遮罩矩形正規化/夾擠）有 node 環境單元測試且全綠；canvas/DOM 膠合層不在 node 單元測試內跑（避免引入重相依）。
6. **AC6（友善失敗 + 重試）** Given 影像解碼或壓縮失敗（如不支援格式），When 發生，Then 顯示友善訊息（不外洩原始錯誤）+ 可重試；可重試次數不設上限（解析階段的 N 次上限屬 Story 1.4，非此處）。
7. **AC7（行動優先 + 基本無障礙）** Given 行動單欄版面，Then 「拍收據」鍵實心 accent、滿寬、≥48px；所有可動作元素 Tab 可達、Enter 可觸發；狀態以「文字＋圖示＋顏色」三重編碼（非僅顏色）；對比 ≥4.5:1。明確**不**追 WCAG AA（NFR-A2/UX-DR16）。
8. **AC8（隱私安心訊息）** Given 遮蔽步驟，Then 明示「卡號只留在你裝置，只有遮好的影像會上傳」之類保證文案（先卸重擔再談功能）。
9. **AC9（既有不回歸）** Given 改動，Then `pnpm lint && pnpm typecheck && pnpm test` 全綠；Story 1.1 既有檔（schema/worker/visionAdapter 空殼/CI harness）不被更動；不觸碰 `src/lib/llm/visionAdapter.ts`、不建任何 API route、不入 pg-boss job。

## Tasks / Subtasks

- [x] **Task 1：先讀 Next 16 文件（防過時 API；專案 AGENTS.md 強制）（AC1, AC2）**
  - [x] 讀 `node_modules/next/dist/docs/01-app/01-getting-started/05-server-and-client-components.md`、`03-api-reference/01-directives/use-client.md`、`01-getting-started/03-layouts-and-pages.md`
  - [x] 已確認並記於 Debug Log：`'use client'` 須在檔首（imports 之前）即客戶端邊界、page/layout 預設 Server Component、Server→Client props 須可序列化（本 story 全 client、Blob 不跨 RSC）、Next 16 `params` 為 Promise（`/` 無 params 不影響）、僅 `NEXT_PUBLIC_*` 入 client、`<input type=file>` 為原生 DOM 無 Next API、`next/image` 與本 story 無關
- [x] **Task 2：純影像邏輯（無 DOM、可單測）（AC2, AC3, AC5）**
  - [x] `src/lib/image/geometry.ts`：`computeResizedDimensions`（等比、不放大、非正/非有限 throw RangeError）、`clampMaskRect`（負寬高正規化、超界夾擠、整數像素、全外→零面積）、`hasUsableMaskOrSkip`（≥1 正面積 rect 或明確 skip 才放行）；型別 `Dimensions`/`Rect`
  - [x] `src/lib/image/geometry.test.ts`（co-located，vitest node env）：橫/直/方/不放大/恰 1600/自訂上限/極薄/非法輸入/rect 各邊界/zero-area gate — **19/19 綠**；全套 21 pass + 2 todo（Story 1.1 harness 無回歸）
- [x] **Task 3：canvas 壓縮 + EXIF 移除（裝置端）（AC2, AC4）**
  - [x] `src/lib/image/compress.ts`：`compressToCanvas(file,maxLongEdge=1600)`（`createImageBitmap` `imageOrientation:"from-image"` → 依 `computeResizedDimensions` 畫至 canvas）+ `canvasToJpegBlob(canvas,quality=0.8)`（唯一 toBlob 點，須傳已遮 canvas）；re-encode 天然丟 EXIF（含 GPS），註解標明
  - [x] `ImageDecodeError`/`ImageEncodeError` 具型別（UI 轉友善訊息不外洩原文）；`bitmap.close()` 於 `finally`、不用 object URL（直接顯示 canvas）、無原圖殘留參考（AC4）；typecheck 綠
  - [x] HEIC：`compressToCanvas` 交瀏覽器 `createImageBitmap` 解碼，失敗 throw `ImageDecodeError` → UI 走 AC6 友善失敗（註解記 iOS HEIC 風險）
- [x] **Task 4：遮罩燒入（不可逆、像素級）（AC3, AC4）**
  - [x] `src/lib/image/mask.ts`：`burnMasksIntoCanvas`（`globalAlpha=1`、`source-over`、`#000` 實心 `fillRect`，座標經 `clampMaskRect`，zero-area 跳過）+ `applyMaskAndEncode`（燒入後 `canvasToJpegBlob` 回唯一 masked Blob）；typecheck+lint 綠
  - [x] 註解明禁 CSS overlay / blur（可逆）；`applyMaskAndEncode` 回傳之 Blob 為唯一可離開裝置物，呼叫端用後棄 canvas 參考（Task 6 落實）
- [x] **Task 5：擷取 + 遮罩編輯 UI（client component）（AC1, AC3, AC6, AC7, AC8）**
  - [x] `src/features/parsing/components/CaptureFlow.tsx`（`'use client'`）：隱藏 `<input type="file" accept="image/*">`（**無 `capture`**，見 AC1 修正）+ ≥56px「拍收據」CTA → `compressToCanvas` → 狀態機 idle/compressing/editing/ready/error；`input.value=""` 重置（取消/重選不卡，AC1）
  - [x] `src/features/parsing/components/MaskEditor.tsx`（`'use client'`）：display canvas 畫未遮像素（僅顯示、不輸出）、pointer 拖拉產生影像座標矩形（百分比 overlay 隨 RWD 縮放、可逐一移除）、shadcn `Checkbox`「此收據沒有會員卡號」；`hasUsableMaskOrSkip` 未滿足時「下一步」`disabled`
  - [x] `yes | pnpm dlx shadcn@latest add checkbox`（radix-nova，用既有 `radix-ui`+`lucide-react`，**零新增 npm 相依**）；未自造 overlay 的可聚焦元件改用 Radix Checkbox
  - [x] 友善錯誤映射 `ImageDecodeError`→不外洩原文 + 重試（AC6）；隱私文案於 idle/編輯/ready（AC8）；行動單欄 `max-w-md`、CTA h-14、按鈕 h-12、狀態 icon+文字+語意色三重編碼（AC7）；**驗證**：typecheck/lint/build 綠、dev smoke HOME 200 含「拍收據/分帳小工具」（拖拉互動為瀏覽器手動驗證，其 gating 邏輯已於 Task 2 node 全測）
- [x] **Task 6：保留產物的狀態（client-only，無網路）（AC4）**
  - [x] masked Blob 存於 `CaptureFlow` 之 `phase={k:'ready';blob}` React 狀態；轉 ready 即丟棄未遮 canvas 參考；**靜態掃描證實零** `localStorage`/`sessionStorage`/`indexedDB`/`caches`/`fetch`/`XHR`/`sendBeacon`/`createObjectURL` 真實呼叫（僅文件註解命中）
  - [x] 檔頭註解標明 NFR-S3/AC4 邊界：原 File 不存、不持久化、不 log；下一步 POST 屬 Story 1.3；無 `visionAdapter` import、無 API route
- [x] **Task 7：驗收自查（AC5, AC9）**
  - [x] `pnpm lint`(exit 0) && `pnpm typecheck`(exit 0) && `pnpm test`(2 files, 21 pass + 2 todo) 全綠；`pnpm build` 亦綠
  - [x] 程式碼掃描：零 `localStorage`/`sessionStorage`/`indexedDB`/`caches`/`fetch`/`XHR`/`sendBeacon`/`createObjectURL` 真實呼叫（僅註解命中）；無 `@/lib/llm/visionAdapter` import；`src/app/api` 不存在
  - [x] Story 1.1 邊界檔內容確認未變：`visionAdapter` 仍 NotImplemented stub、`schema.ts` 仍 4 表、`regression-invariants.test.ts` harness 完好（2 pass+2 todo 未動，無回歸）；無 commit baseline 故以內容核對取代 git diff

## Dev Notes

### 範圍鐵則（防 scope creep / 防回歸 — 最高優先）

- **本 story 100% client-side。** 不建任何 API route、不發任何網路請求、不入 pg-boss、不碰 `src/lib/llm/visionAdapter.ts`（Story 1.4 才實作，且永遠單一邊界）。上傳/job/輪詢＝**Story 1.3**；視覺 LLM＝**Story 1.4**；IRC/結構硬鎖＝後續；VPS 影像儲存＝伺服器側後續。 [Source: architecture.md#Project-Structure-&-Boundaries L314,525,554,579；epics.md#Story 1.2/1.3]
- **不要建 `ParseProgress`。** UX spec 的 ParseProgress 是 Story 1.3 的 job 輪詢進度元件；本 story 的「壓縮中」回饋只是同步式 inline 狀態，勿越界做 job 進度框。 [Source: ux-design-specification.md L540-542；epics.md#Story 1.3]
- **不要碰 `ReceiptLineRow`/tabular-nums/結算**——皆下游（解析出逐行後才有）。 [Source: ux-design-specification.md L506-515]
- **零新增 npm 相依為目標。** 用瀏覽器原生 `createImageBitmap` + `<canvas>`/`OffscreenCanvas` + `toBlob` 完成壓縮/遮罩/EXIF 移除。理由：(1) 架構未指定壓縮庫、(2) Side Project 標準「不過度工程化」、(3) Story 1.1 已親歷供應鏈 `minimumReleaseAge` 卡關，少一個相依少一份風險。若團隊日後要庫，慣例選 `browser-image-compression`，但**預設不引入**。 [Source: architecture.md L283-284；Story 1.1 Debug Log]

### NFR-S3 — 單向保證（本 story 的靈魂，違反即資安事故）

只有「已遮蔽＋已壓縮」的影像可進入可外送狀態。未遮原圖（原始 `File`、`ImageBitmap`、未遮 canvas/blob）：

- 僅短暫存在記憶體，產出最終 blob 後立即釋放（`ImageBitmap.close()`、`URL.revokeObjectURL`、丟參考）
- **永不**寫 `localStorage`/`sessionStorage`/`IndexedDB`/Cache API
- **永不**進任何網路請求（本 story 根本不發網路請求）
- **永不**進 console/log/Sentry breadcrumb
- 遮罩必須**燒進像素**（canvas 實心填色再 `toBlob`），CSS overlay / `filter: blur` 不算遮蔽（可逆、原像素仍在）

[Source: architecture.md L247-250, L43-44；epics.md#Story 1.2 AC2；prd.md FR43/NFR-S3]

### 遮罩互動方式（規格 GAP → 已由使用者 2026-05-19 拍板，DECIDED，照此實作勿再問）

architecture 與 ux-design-specification **皆只規定結果**（上傳前遮卡號、只有遮好的離開裝置），**未規定互動手法**。**使用者已確認**採以下方式（非開放問題，dev 直接實作）：

> **手動拖拉不透明實心矩形**（行動單欄、單手、小工具、NFR-A1 務實級）。預設置中一個可拖移/縮放矩形，使用者對準卡號套用；可加多個。若該收據確無卡號 → 必須**明確勾選**「此收據無會員卡號」才可繼續（不放任空遮直接過，確保 NFR-S3 有意識決斷）。實心純色、非模糊（不可逆＝最安全且最省）。

明確 OUT：自動 OCR 偵測卡號（過度工程化、增相依與失誤面，違小工具定位）。

### 目錄與檔案（對齊架構 `features/parsing` ＝ FR1-7）

| 路徑 | 類型 | 用途 |
|---|---|---|
| `src/lib/image/geometry.ts` | NEW | 純函式：縮放尺寸、遮罩矩形正規化（無 DOM、可 node 單測） |
| `src/lib/image/geometry.test.ts` | NEW | vitest（node env，co-located；沿用 Story 1.1 設定） |
| `src/lib/image/compress.ts` | NEW | canvas 壓縮 + EXIF 移除（client-only 膠合） |
| `src/lib/image/mask.ts` | NEW | 遮罩像素燒入 + 最終 blob 產出（client-only 膠合） |
| `src/features/parsing/components/CaptureFlow.tsx` | NEW | `'use client'` 擷取入口 + 預覽 + 流程串接 |
| `src/features/parsing/components/MaskEditor.tsx` | NEW | `'use client'` 遮罩矩形編輯 / 無卡號勾選 |
| `src/app/page.tsx` | UPDATE | 首頁加「拍收據」入口，掛載 CaptureFlow（取代 scaffold 預設樣板頁；維持極簡，完整首頁設計屬後續） |
| `src/components/ui/*` | ADD（按需） | 經既有 radix-nova shadcn 管線 `add`（button 已存在） |

`src/features/parsing/` 為新建（Story 1.1 只留 `src/features/.gitkeep`）；建立後該 `.gitkeep` 可移除。 [Source: architecture.md#Project-Structure（解析 FR1-7 → features/parsing）；Story 1.1 File List]

### 測試策略（沿用 Story 1.1 既裝 vitest，勿引入重相依）

- Story 1.1 已設 `vitest.config.ts`：`environment: "node"`、`include: src/**/*.test.ts`、`@`→`src` alias、co-located `*.test.ts`。**沿用，勿改全域 env。**
- canvas/`createImageBitmap`/`toBlob` 在 node 無原生實作；**不要**為了單測它而裝 jsdom+canvas（重、增供應鏈面）。做法：把可測邏輯抽到 `geometry.ts` 純函式全測；`compress.ts`/`mask.ts` 的 canvas 膠合保持極薄、靠手動/瀏覽器驗證（AC5）。
- 不得破壞 Story 1.1 的 CI 雙不變量 harness（`regression-invariants.test.ts` 的 2 pass + 2 todo 維持）。 [Source: Story 1.1 Task 6 / File List]

### Story 1.1 學習帶入（previous story intelligence）

- **AGENTS.md 鐵則**：寫碼前讀 `node_modules/next/dist/docs/`，Next 16.2.x 與訓練資料有出入（Task 1 已列）。
- shadcn 為 **radix-nova base**（非 Base UI）；新增元件用 `yes | pnpm dlx shadcn@latest add <name>`（互動 prompt 用 `yes |` 餵；Story 1.1 已驗此法）。元件落 `src/components/ui/`。
- 尚**未**安裝 Zod / TanStack Query（Story 1.1 刻意最小）。本 story client-only、無 server 契約 → **不需** Zod；無 server 輪詢 → **不需** TanStack。維持零新增相依目標。
- TS `strict: true`、`@/*` alias、Turbopack、`output:'standalone'` 已就緒；`pnpm typecheck`=`tsc --noEmit`、`pnpm test`=`vitest run`、`pnpm lint`=`eslint`。
- 供應鏈：新增任何 npm 套件前先 `pnpm view <pkg> version` 並評估 `minimumReleaseAge`（Story 1.1 因日齡<24h transitive 卡 Docker build）；本 story 預設零新增相依即可規避。

### Project Structure Notes

- 與架構一致：擷取/壓縮/遮罩屬 FR1-7 → `src/features/parsing/`；純邏輯下沉 `src/lib/image/`（對齊 `src/lib/*` 工具慣例）。
- 變異/衝突：架構/UX 未指定壓縮庫與遮罩互動 → 本 story 以「零相依 Canvas + 手動矩形」決斷並記錄理由（見上）；如後續 story 需 server 端再壓一次，屬 Story 1.3+，不在此。

### References

- [Source: epics.md#Epic 1 / Story 1.2]（AC GWT 來源、FR1/FR2/FR43、與 1.1/1.3 邊界）
- [Source: epics.md#FR Coverage Map L193,199,202]（FR1-7、FR43 屬 Epic 1）
- [Source: architecture.md#Project-Structure-&-Boundaries L247-250,283-284,314,525,554,579]（NFR-S3 單向、壓縮 ~1600px+EXIF、client/server 邊界、visionAdapter 禁碰）
- [Source: architecture.md#Implementation-Sequence L311-320]（解析管線：壓縮/遮卡號＝1.2；上傳/job＝1.3）
- [Source: ux-design-specification.md#Experience-Mechanics L312-321 / #Design-System L495-498,576-577 / #Accessibility L645-653 / #Visual L344-358]（拍收據 CTA、行動單欄、shadcn、NFR-A1 務實級、友善錯誤、隱私文案）
- [Source: prd.md FR1/FR2/FR43、NFR-S3]（功能與隱私需求）
- [Source: 1-1-project-scaffold-ci.md（Dev Agent Record / File List / Debug Log）]（vitest 設定、shadcn radix-nova、零相依方針、供應鏈注意）
- [Source: 專案根 AGENTS.md]（先讀 Next 16 文件再寫碼）

## Story Author Questions（分析中產生之澄清 — 已於 2026-05-19 解決，記錄供追溯）

1. **遮罩互動方式 — ✅ RESOLVED**：使用者確認採「手動拖拉不透明實心矩形 + 無卡號需明確勾選」（非自動 OCR）。已併入 Dev Notes「遮罩互動方式（DECIDED）」，dev 照此實作，**勿再當開放問題**。
2. **首頁範圍 — ✅ 採預設**：`src/app/page.tsx` 由 scaffold 樣板改為極簡「拍收據」入口即止（完整首頁/品牌/導覽屬後續），未有反對，照此進行。

## Dev Agent Record

### Agent Model Used

claude-opus-4-7[1m]（dev-story，2026-05-19）

### Debug Log References

- Task 1（Next 16.2.x 文件複核 vs 訓練資料）：`'use client'` 必在檔首 imports 之前、定義 client/server 邊界（其 imports 與 children 全進 client bundle）；`app/page.tsx`/`layout.tsx` 預設 Server Component；Server→Client props 須可序列化（本 story 全程 client-side，最終 Blob 留在 client state、不跨 RSC，安全）；Next 16 `params`/`searchParams` 為 `Promise`（`/` 首頁無 params，不影響本 story，記錄供後續 dynamic route story）；僅 `NEXT_PUBLIC_*` 前綴 env 進 client bundle（本 story client 端不用 env）；`<input type="file">` 為純原生 DOM、無 Next 專屬 API；`next/image` 為 next 最佳化影像，與本 story 原始 File→canvas→Blob 流程無關，不使用。

### Completion Notes List

- Ultimate context engine analysis completed - comprehensive developer guide created（create-story，2026-05-19）
- ✅ Task 1（AC1/AC2 前置）：依 AGENTS.md 讀 Next 16.2.x App Router/Client Components/use-client/layouts 文件，關鍵差異記於 Debug Log；確認本 story UI 元件須 `'use client'`、首頁 page.tsx 維持 Server Component 並渲染 client 子元件。
- ✅ Task 2（AC2/AC3/AC5）：`geometry.ts` 純函式（resize/clamp/gate）+ 19 node 單測全綠。
- ✅ Task 3（AC2/AC4）：`compress.ts` `createImageBitmap`(orientation baked)→resized canvas→`canvasToJpegBlob`；typed decode/encode error；`bitmap.close()` finally；EXIF re-encode 移除。
- ✅ Task 4（AC3/AC4）：`mask.ts` 不透明實心 `fillRect`（經 `clampMaskRect`）+ `applyMaskAndEncode` 單一輸出路徑；禁 CSS/blur，不可逆。
- ✅ Task 5（AC1/AC3/AC6/AC7/AC8）：`CaptureFlow`（狀態機 + capture input + 友善錯誤/重試 + 隱私文案 + 行動 CTA）、`MaskEditor`（拖拉矩形/無卡號 Checkbox/下一步 gating）；shadcn `checkbox` 加入（零新增 npm 相依）；typecheck/lint/build 綠、dev smoke HOME 200。
- ✅ Task 6（AC4）：masked Blob 僅存 React state、轉 ready 丟未遮 canvas；靜態掃描零持久化/網路/objectURL。
- ✅ Task 7（AC5/AC9）：lint/typecheck/test/build 全綠；無 API route、無 visionAdapter import；Story 1.1 邊界檔（visionAdapter/schema/CI harness）內容未變、無回歸。
- 決策實作：遮罩互動＝使用者拍板之「手動拖拉不透明矩形 + 無卡號明確勾選」；零新增 npm 相依（原生 Canvas + 既有 radix-ui）；NFR-S3 以「未遮永不 toBlob/網路/持久化、遮罩像素燒入不可逆」落實。
- ⚠️ 手動驗證待辦（瀏覽器）：實機 iOS Safari / Android Chrome 測相機擷取、拖拉遮罩、HEIC 解碼失敗走友善錯誤；canvas 拖拉互動本機 node 無法自動測（AC5 既定，其數學 gating 已 node 全測）。
- 📋 **驗證協定回溯（CIP，2026-05-19 採 Plutus 比例化子集）**：
  - **AC↔測試映射**：AC2（resize/EXIF）/AC3（mask gate）/AC5（純函式）→ `geometry.test.ts` 19 具名 node 測試（`computeResizedDimensions`/`clampMaskRect`/`hasUsableMaskOrSkip` 邊界全覆蓋）；AC1/AC6/AC7/AC8 為瀏覽器互動＝**manual**（→ W-1-2-1）；AC4 → 靜態掃描證據（零持久化/網路/objectURL）；AC9 → lint/typecheck/test/build 全綠 + 1.1 邊界內容核對。
  - **LLM Compliance**：本 story 純 client、**無 LLM 呼叫 → N/A**（`docs/llm-compliance-checklist.md` 規則：非 LLM story 記 N/A 跳過分節）。
  - **Deferred-work**：手動瀏覽器驗證登記為 `deferred-work.md#W-1-2-1`（P1，OPEN）。

### File List

> 全 untracked（greenfield repo 無 commit）。A=新增 M=改 D=刪。

- `src/lib/image/geometry.ts`（A：純函式 resize/clamp/gate）
- `src/lib/image/geometry.test.ts`（A：19 vitest node 單測）
- `src/lib/image/compress.ts`（A：canvas 壓縮 + EXIF 移除 + typed errors）
- `src/lib/image/mask.ts`（A：不可逆遮罩燒入 + 單一輸出）
- `src/features/parsing/components/CaptureFlow.tsx`（A：`'use client'` 擷取狀態機）
- `src/features/parsing/components/MaskEditor.tsx`（A：`'use client'` 遮罩編輯）
- `src/components/ui/checkbox.tsx`（A：shadcn radix-nova，0 新增 npm 相依）
- `src/app/page.tsx`（M：scaffold 樣板 → 極簡「拍收據」入口渲染 CaptureFlow）
- `src/features/.gitkeep`（D：目錄已有內容）
- `_bmad-output/implementation-artifacts/1-2-capture-compress-mask.md`（M：本 story 檔 dev 記錄）
- `_bmad-output/implementation-artifacts/sprint-status.yaml`（M：1-2 狀態流轉）

## Review Findings（code review 2026-05-19，commit 8dfcb87，no-spec 模式）

> no-spec 模式跳過 Acceptance Auditor，故 spec↔code 矛盾不在 hunter 射程；
> 其中 AC1 矛盾由使用者於 review 後對話中發現補上（非 silent）。

- [x] [Review][Patch] geometry.clampMaskRect 非有限值→零面積 + 向外取整（隱私安全）— 已修 + 3 node 測試（commit d1d879f）
- [x] [Review][Patch] MaskEditor 多指/pointercancel/未排版幻影座標 + 儲存前 clamp（堵 NFR-S3 閘門洞）— 已修（d1d879f）
- [x] [Review][Patch] CaptureFlow 連點雙重 burn — await 前同步鎖 phase — 已修（d1d879f）
- [x] [Review][Patch] compress.ts toBlob timeout / 0×0 bitmap / ctx→decode-error — 已修（d1d879f）
- [x] [Review][Patch] worker shutdown 重入+timeout / DB-wait 記錄真實錯誤 — 已修（8b588f1）
- [x] [Review][Patch] drizzle.config 缺 env throw / Sentry 取樣率 / client DSN fallback / layout metadata — 已修（8b588f1）
- [x] [Review][Patch] **AC1 違規（post-review，使用者發現）**：`capture="environment"` 在 iOS Safari 強制相機、移除相簿選項，違反 AC1「可改選相簿」。修：拿掉 `capture`（使用者拍板）；AC1 矛盾文字一併修正。
- [x] [Review][Defer] W-CR-1..4 已登記 `deferred-work.md`（by-design / scale-stage）
- [x] [Review][Patch] **on-device 驗證發現（2026-05-19，使用者實機）**：
  - (a) 首頁渲染但「拍收據」點了沒反應 → 根因 Next 16 dev 阻擋 LAN 來源 `/_next/*`（cross-origin 安全預設），client bundle 未載入→未 hydrate→onClick 沒掛。修：`next.config.ts` 加 `allowedDevOrigins`（dev-only，prod 無影響）。
  - (b) 連帶修 iOS WebKit 雷：file input 由 `hidden`(display:none) 改 `sr-only`——iOS Safari 對 display:none input 的 `.click()` 會被忽略。
- 狀態：所有 patch 已修並通過閘門（lint/typecheck/test 23 pass+2 todo/build），維持 `done`。

## On-device 驗證結果（W-1-2-1，2026-05-19，使用者實機 iOS Safari）

**✅ 手動實證通過（截圖為證）：** 擷取入口點擊有反應 → iOS 原生選單（拍照/相簿/檔案）→ 從相簿上傳 → 前端壓縮（真實 Costco #5564，輸出 ~482KB < 500KB，AC2）→ 拖拉畫遮罩框 → 卡號（MB 89501062600）實際蓋住 → 閘門 `下一步` 正確由灰轉亮 → ready 畫面。AC1/AC2/AC3/AC7/AC8 行動路徑實機 OK。

**⚠️ 非手動可測、改由 code/unit 覆蓋（誠實標記，未假裝測過）：**

- **出界框→閘門維持灰（NFR-S3）**：iOS 觸控手指移出元素即斷追蹤，「拖到圖外」手勢人為無法可靠重現。保護由 **P2 修正**保證：`onPointerUp` 存 `clampMaskRect(draft,imgW,imgH)` 且僅 clamp 後面積>0 才存，閘門跑在已 clamp rects；`geometry.test.ts` 具名測試 `returns a zero-area rect when fully outside the image` 證出界=零面積=不存=灰。判定：邏輯恆成立、單元覆蓋，**manual N/A**。
- **解碼錯誤友善訊息（AC6）**：iOS Safari 原生可解 HEIC（非失敗源），且 `accept="image/*"` 在相簿選不到非圖片檔 → 此路徑在 iOS 正常操作幾乎不可觸發。`ImageDecodeError`→friendlyError 為 trivial 映射，code-level 已覆蓋。判定：iOS 正常操作 **manual N/A by platform**，原 Test B 設計失誤已撤。

**結論：** W-1-2-1 核心手動路徑通過；兩子項以 code/unit 覆蓋並誠實標記。`deferred-work.md#W-1-2-1` → RESOLVED。
