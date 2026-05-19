"use client";

/**
 * PageList — Story 1.2b review step. CLIENT-ONLY, no network.
 *
 * Shows the ordered list of captured pages so the payer can reorder /
 * remove before finishing. Thumbnails use an object URL of the
 * ALREADY-MASKED blob only (AC2 exception); the URL lifecycle (create /
 * revoke) is owned by CaptureFlow. State is triple-encoded
 * (text + icon + colour), every control ≥48px and keyboard-reachable
 * (AC8). Deliberately minimal: up/down + remove, NOT a heavy page
 * manager, NO drag-sort, NO auto-stitch (小工具 scope, AC3).
 */
import { ArrowDownIcon, ArrowUpIcon, Trash2Icon } from "lucide-react";

import { Button } from "@/components/ui/button";
import type { PageItem } from "@/features/parsing/components/CaptureFlow";

interface PageListProps {
  pages: PageItem[];
  onMove: (id: string, dir: "up" | "down") => void;
  onRemove: (id: string) => void;
}

export function PageList({ pages, onMove, onRemove }: PageListProps) {
  return (
    <ul className="flex flex-col gap-3" aria-label="已擷取的收據頁面">
      {pages.map((page, i) => (
        <li
          key={page.id}
          className="flex items-center gap-3 rounded-lg border p-2"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={page.thumbUrl}
            alt={`第 ${i + 1} 頁（已遮蔽）`}
            className="size-16 shrink-0 rounded object-cover"
          />
          <span className="flex-1 text-sm font-medium">第 {i + 1} 頁</span>

          <Button
            type="button"
            variant="outline"
            size="icon"
            className="size-12"
            disabled={i === 0}
            aria-label={`第 ${i + 1} 頁上移`}
            onClick={() => onMove(page.id, "up")}
          >
            <ArrowUpIcon className="size-5" aria-hidden />
          </Button>
          <Button
            type="button"
            variant="outline"
            size="icon"
            className="size-12"
            disabled={i === pages.length - 1}
            aria-label={`第 ${i + 1} 頁下移`}
            onClick={() => onMove(page.id, "down")}
          >
            <ArrowDownIcon className="size-5" aria-hidden />
          </Button>
          <Button
            type="button"
            variant="destructive"
            size="icon"
            className="size-12"
            aria-label={`移除第 ${i + 1} 頁`}
            onClick={() => onRemove(page.id)}
          >
            <Trash2Icon className="size-5" aria-hidden />
          </Button>
        </li>
      ))}
    </ul>
  );
}
