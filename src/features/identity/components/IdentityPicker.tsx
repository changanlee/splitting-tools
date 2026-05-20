"use client";

/**
 * Story 4.2 — "是不是你" identity picker (FR21/FR22).
 *
 * Client island because we need the device-token from localStorage
 * in the form payload. Loads the token on mount and stamps it into
 * a hidden field on every submit. If there are existing identities,
 * the picker shows them as "pick me" buttons; either way the user
 * can also create a new name.
 */
import { useSyncExternalStore } from "react";

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
  // Note: the only error path is localStorage refusing to set/read
  // (private mode etc.). `getOrCreateDeviceToken` swallows the error
  // and returns null; we surface a friendly hint when that happens.
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
      {existing.length > 0 ? (
        <section
          aria-label="是不是你？"
          className="flex flex-col gap-2 border-b border-border pb-4"
        >
          <h2 className="text-sm font-semibold">是不是你？</h2>
          <p className="text-xs text-muted-foreground">
            選取你之前用過的名字（會綁到這個裝置）。
          </p>
          <ul className="flex flex-col gap-2">
            {existing.map((i) => (
              <li key={i.id}>
                <form action={bound}>
                  <input type="hidden" name="mode" value="pick" />
                  <input type="hidden" name="identityId" value={i.id} />
                  <input type="hidden" name="deviceToken" value={token} />
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
        </section>
      ) : null}
      <section
        aria-label="第一次認領"
        className="flex flex-col gap-2"
      >
        <h2 className="text-sm font-semibold">
          {existing.length > 0 ? "或：第一次來" : "請告訴我們你的名字"}
        </h2>
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
    </div>
  );
}
