"use client";

/**
 * Story 8.1 — photo-assisted claim entry on the claim board.
 *
 * Client island: the user photographs the physical products they took;
 * we reuse the capture/compress pipeline (1.2) to produce masked-free
 * compressed JPEGs, POST them with the device token to
 * `/api/splits/[linkId]/claim-photos`, and the worker seeds preliminary
 * claims. Fire-and-forget (v1): on success we tell the user to refresh in
 * a few seconds — there is no live job-status poll yet (Phase 2).
 *
 * Only rendered when the user has a bound identity (self-claim only).
 */
import { useState } from "react";

import { getOrCreateDeviceToken } from "@/features/identity/deviceToken";
import { MAX_PARSE_PAGES } from "@/features/parsing/schema";
import { canvasToJpegBlob, compressToCanvas } from "@/lib/image/compress";

type Status = "idle" | "working" | "queued" | "error";

export function PhotoClaimButton({ linkId }: { linkId: string }) {
  const [status, setStatus] = useState<Status>("idle");
  const [msg, setMsg] = useState("");

  async function onChange(e: React.ChangeEvent<HTMLInputElement>) {
    const input = e.currentTarget;
    const files = Array.from(input.files ?? []).slice(0, MAX_PARSE_PAGES);
    input.value = ""; // allow re-selecting the same file
    if (files.length === 0) return;

    setStatus("working");
    setMsg("");
    try {
      const token = getOrCreateDeviceToken();
      if (!token) {
        setStatus("error");
        setMsg("無法取得裝置識別，請關閉無痕模式或允許 localStorage。");
        return;
      }
      const fd = new FormData();
      let n = 0;
      for (const f of files) {
        const { canvas } = await compressToCanvas(f);
        const blob = await canvasToJpegBlob(canvas);
        fd.append("pages", blob, `claim-${n}.jpg`);
        n += 1;
      }
      fd.append("pageCount", String(n));
      fd.append("deviceToken", token);

      const res = await fetch(`/api/splits/${linkId}/claim-photos`, {
        method: "POST",
        body: fd,
      });
      if (res.status === 202) {
        setStatus("queued");
        setMsg("照片已收到，正在辨識…約 10–20 秒後重新整理頁面，就會看到系統幫你初步勾選的品項（記得再核對一下）。");
      } else {
        const body = (await res.json().catch(() => null)) as
          | { error?: { message?: string } }
          | null;
        setStatus("error");
        setMsg(body?.error?.message ?? "上傳失敗，請稍後再試。");
      }
    } catch {
      setStatus("error");
      setMsg("照片處理失敗，請換一張清楚的照片再試。");
    }
  }

  return (
    <div className="px-4 py-3 border-b border-border">
      <label className="inline-flex cursor-pointer items-center gap-2 rounded bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:opacity-90">
        📷 拍照認領
        <input
          type="file"
          accept="image/*"
          capture="environment"
          multiple
          disabled={status === "working"}
          onChange={onChange}
          className="hidden"
        />
      </label>
      <p className="mt-1 text-xs text-muted-foreground">
        拍下你拿走的商品，系統會初步幫你勾選（草稿，仍可手動調整）。
      </p>
      {status === "working" ? (
        <p className="mt-1 text-xs text-muted-foreground">處理中…</p>
      ) : null}
      {msg ? (
        <p
          className={`mt-1 text-xs ${status === "error" ? "text-destructive" : "text-emerald-700 dark:text-emerald-300"}`}
        >
          {msg}
        </p>
      ) : null}
    </div>
  );
}
