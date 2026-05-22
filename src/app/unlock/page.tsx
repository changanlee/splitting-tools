/**
 * Epic 7 — access-code entry. A paying user enters the code they were
 * given; redeemAccessCodeAction sets the cookie and sends them to the
 * upload home page. Already-unlocked visitors skip straight through.
 */
import { redirect } from "next/navigation";

import { hasValidAccess } from "@/features/access/server/accessGate";
import { redeemAccessCodeAction } from "@/features/access/server/actions";

export default async function UnlockPage() {
  if (await hasValidAccess()) redirect("/");

  return (
    <main className="flex min-h-dvh flex-col">
      <header className="px-4 pt-8 pb-2">
        <h1 className="text-xl font-semibold tracking-tight">分帳小工具</h1>
      </header>
      <div className="mx-auto flex w-full max-w-md flex-col gap-4 p-4">
        <p className="text-sm text-muted-foreground">
          這是邀請制工具。請輸入你拿到的存取碼開始使用。
        </p>
        <form action={redeemAccessCodeAction} className="flex flex-col gap-3">
          <label className="flex flex-col gap-1">
            <span className="text-sm font-medium">存取碼</span>
            <input
              name="code"
              required
              autoComplete="off"
              autoCapitalize="off"
              spellCheck={false}
              placeholder="貼上你拿到的碼"
              className="h-11 rounded-md border border-input bg-background px-3 text-base"
            />
          </label>
          <button
            type="submit"
            className="h-12 w-full rounded-md bg-primary text-base font-semibold text-primary-foreground hover:opacity-90"
          >
            解鎖
          </button>
        </form>
        <p className="text-xs text-muted-foreground">
          沒有存取碼？向提供分帳工具的人索取。
        </p>
      </div>
    </main>
  );
}
