"use client";

/**
 * Epic 7 — one row in the access-code list. Client component so the code
 * can be copied to the clipboard with one tap (the owner hands codes to
 * people off-platform). Toggle + delete are server-action forms.
 */
import { useState } from "react";

import {
  deleteAccessCodeAction,
  toggleAccessCodeAction,
} from "@/features/access/server/actions";

export function CodeRow({
  code,
  label,
  enabled,
}: {
  code: string;
  label: string;
  enabled: boolean;
}) {
  const [copied, setCopied] = useState(false);

  async function copyCode() {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard API blocked — the code stays select-all below so the
      // owner can still long-press to copy it manually.
    }
  }

  const actionLink =
    "text-xs underline underline-offset-2 hover:no-underline";

  return (
    <li className="flex flex-col gap-2 py-3">
      <div className="flex items-center justify-between gap-3">
        <code className="select-all rounded bg-muted px-2 py-1 text-sm font-mono">
          {code}
        </code>
        <span
          className={
            enabled
              ? "text-xs font-medium text-emerald-600 dark:text-emerald-400"
              : "text-xs font-medium text-muted-foreground"
          }
        >
          {enabled ? "啟用中" : "已停用"}
        </span>
      </div>
      <div className="flex items-center justify-between gap-3">
        <span className="text-sm text-muted-foreground">
          {label || "（未命名）"}
        </span>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={copyCode}
            className={`${actionLink} text-primary`}
          >
            {copied ? "已複製 ✓" : "複製"}
          </button>
          <form action={toggleAccessCodeAction}>
            <input type="hidden" name="code" value={code} />
            <input type="hidden" name="enabled" value={String(!enabled)} />
            <button type="submit" className={`${actionLink} text-primary`}>
              {enabled ? "停用" : "啟用"}
            </button>
          </form>
          <form
            action={deleteAccessCodeAction}
            onSubmit={(e) => {
              if (
                !window.confirm(
                  `刪除存取碼「${label || code}」？此動作無法復原。`,
                )
              ) {
                e.preventDefault();
              }
            }}
          >
            <input type="hidden" name="code" value={code} />
            <button
              type="submit"
              className={`${actionLink} text-red-600 dark:text-red-400`}
            >
              刪除
            </button>
          </form>
        </div>
      </div>
    </li>
  );
}
