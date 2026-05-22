/**
 * Epic 7 — admin: manage access codes. Gated by ADMIN_SECRET (entered
 * once → admin cookie). Lists codes, issues new ones, toggles each
 * on/off. Payment is off-platform — disabling a code is how the owner
 * cuts a non-paying user.
 */
import { isAdmin } from "@/features/access/server/accessGate";
import { listAccessCodes } from "@/features/access/server/accessCodeRepo";
import {
  adminLoginAction,
  createAccessCodeAction,
  toggleAccessCodeAction,
} from "@/features/access/server/actions";

export default async function AdminPage() {
  if (!(await isAdmin())) {
    return (
      <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col gap-4 p-4 pt-10">
        <h1 className="text-xl font-semibold">管理登入</h1>
        <form action={adminLoginAction} className="flex flex-col gap-3">
          <label className="flex flex-col gap-1">
            <span className="text-sm font-medium">管理密鑰</span>
            <input
              name="secret"
              type="password"
              required
              autoComplete="off"
              className="h-11 rounded-md border border-input bg-background px-3 text-base"
            />
          </label>
          <button
            type="submit"
            className="h-12 rounded-md bg-primary text-base font-semibold text-primary-foreground hover:opacity-90"
          >
            進入
          </button>
        </form>
      </main>
    );
  }

  const codes = await listAccessCodes();

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col gap-4 p-4 pt-8">
      <h1 className="text-xl font-semibold">存取碼管理</h1>

      <form
        action={createAccessCodeAction}
        className="flex items-end gap-2 border-b border-border pb-4"
      >
        <label className="flex flex-1 flex-col gap-1">
          <span className="text-sm font-medium">新增一組碼</span>
          <input
            name="label"
            maxLength={60}
            placeholder="給誰用（例：張三）"
            className="h-10 rounded-md border border-input bg-background px-3 text-sm"
          />
        </label>
        <button
          type="submit"
          className="h-10 rounded-md bg-primary px-4 text-sm font-semibold text-primary-foreground hover:opacity-90"
        >
          產生
        </button>
      </form>

      {codes.length === 0 ? (
        <p className="text-sm text-muted-foreground">還沒有任何存取碼。</p>
      ) : (
        <ul className="flex flex-col divide-y divide-border">
          {codes.map((c) => (
            <li key={c.code} className="flex flex-col gap-1 py-3">
              <div className="flex items-center justify-between gap-3">
                <code className="select-all rounded bg-muted px-2 py-1 text-sm font-mono">
                  {c.code}
                </code>
                <span
                  className={
                    c.enabled
                      ? "text-xs font-medium text-emerald-600 dark:text-emerald-400"
                      : "text-xs font-medium text-muted-foreground"
                  }
                >
                  {c.enabled ? "啟用中" : "已停用"}
                </span>
              </div>
              <div className="flex items-center justify-between gap-3">
                <span className="text-sm text-muted-foreground">
                  {c.label || "（未命名）"}
                </span>
                <form action={toggleAccessCodeAction}>
                  <input type="hidden" name="code" value={c.code} />
                  <input
                    type="hidden"
                    name="enabled"
                    value={String(!c.enabled)}
                  />
                  <button
                    type="submit"
                    className="text-xs text-primary underline underline-offset-2 hover:no-underline"
                  >
                    {c.enabled ? "停用" : "啟用"}
                  </button>
                </form>
              </div>
            </li>
          ))}
        </ul>
      )}

      <p className="text-xs text-muted-foreground">
        把「啟用中」的碼私下交給付款的人；對方在 /unlock 輸入即可使用。停繳就按「停用」。
      </p>
    </main>
  );
}
