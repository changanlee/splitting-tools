"use client";

/**
 * Story 4.2 — identity entry (FR21/FR22).
 *
 * Client island: the device-token from localStorage must ride in the
 * form payload. A fresh visitor just types their OWN name — the
 * "pick a name I used before" re-bind path (for a returning user who
 * lost their device binding, e.g. switched browser) is tucked behind a
 * toggle. Newcomers are never shown — nor tempted to tap — other
 * people's identities, including the owner's.
 */
import { useState, useSyncExternalStore } from "react";

import { getOrCreateDeviceToken } from "@/features/identity/deviceToken";
import { pickOrCreateIdentityAction } from "@/features/identity/server/actions";

interface ExistingIdentity {
  id: string;
  name: string;
}

interface Props {
  linkId: string;
  existing: ExistingIdentity[];
}

/**
 * Read the device token from localStorage via useSyncExternalStore so
 * we don't fall into the React-Compiler-flagged setState-in-effect
 * antipattern. The "store" never updates after first read (the token
 * is mint-once), so `subscribe` is a no-op.
 */
function subscribeNoop(): () => void {
  return () => {};
}

function getTokenSnapshot(): string | null {
  return getOrCreateDeviceToken();
}

function getServerTokenSnapshot(): string | null {
  return null;
}

export function IdentityPicker({ linkId, existing }: Props) {
  const token = useSyncExternalStore(
    subscribeNoop,
    getTokenSnapshot,
    getServerTokenSnapshot,
  );
  const [showRebind, setShowRebind] = useState(false);

  // The only error path is localStorage refusing to set/read (private
  // mode etc.). `getOrCreateDeviceToken` swallows the error and returns
  // null; surface a friendly hint when that happens.
  const localStorageBlocked =
    token === null && typeof window !== "undefined";

  const bound = pickOrCreateIdentityAction.bind(null, linkId);

  if (localStorageBlocked) {
    return (
      <p role="status" className="text-sm text-destructive">
        無法在這個瀏覽器產生裝置識別。請關閉無痕模式或允許 localStorage。
      </p>
    );
  }
  if (!token) {
    return (
      <p className="text-sm text-muted-foreground">正在準備裝置識別…</p>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Primary path — every fresh visitor just names themselves. */}
      <section aria-label="輸入你的名字" className="flex flex-col gap-2">
        <h2 className="text-sm font-semibold">請輸入你的名字</h2>
        <p className="text-xs text-muted-foreground">
          這是你在這次分帳裡的名字，你認領的品項會記在這個名字下。
        </p>
        <form action={bound} className="flex flex-col gap-2">
          <input type="hidden" name="mode" value="create" />
          <input type="hidden" name="deviceToken" value={token} />
          <label className="flex flex-col gap-1">
            <span className="text-xs text-muted-foreground">名字</span>
            <input
              name="name"
              maxLength={30}
              required
              placeholder="例：阿美"
              className="rounded border border-input bg-background px-2 py-1.5 text-sm"
            />
          </label>
          <button
            type="submit"
            className="self-start rounded bg-primary text-primary-foreground px-3 py-1.5 text-sm font-medium hover:opacity-90"
          >
            開始認領
          </button>
        </form>
      </section>

      {/* Re-bind path — only for someone who joined before on another
          browser. Hidden by default so newcomers never see, or
          mis-tap, other people's names. */}
      {existing.length > 0 ? (
        <section
          aria-label="選回之前用過的名字"
          className="flex flex-col gap-2 border-t border-border pt-4"
        >
          {showRebind ? (
            <>
              <h2 className="text-sm font-semibold">選回你之前用過的名字</h2>
              <p className="text-xs text-muted-foreground">
                只有你「之前加入過、後來換了瀏覽器」才需要這個。選錯人會把品項記到對方名下。
              </p>
              <ul className="flex flex-col gap-2">
                {existing.map((i) => (
                  <li key={i.id}>
                    <form action={bound}>
                      <input type="hidden" name="mode" value="pick" />
                      <input type="hidden" name="identityId" value={i.id} />
                      <input
                        type="hidden"
                        name="deviceToken"
                        value={token}
                      />
                      <button
                        type="submit"
                        className="w-full rounded border border-input bg-background px-3 py-2 text-sm text-left hover:bg-accent"
                      >
                        我是 <span className="font-medium">{i.name}</span>
                      </button>
                    </form>
                  </li>
                ))}
              </ul>
            </>
          ) : (
            <button
              type="button"
              onClick={() => setShowRebind(true)}
              className="self-start text-xs text-muted-foreground underline underline-offset-2 hover:no-underline"
            >
              我之前已經加入過、要選回原本的名字
            </button>
          )}
        </section>
      ) : null}
    </div>
  );
}
