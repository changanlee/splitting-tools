"use client";

/**
 * Story 4.1/4.2/4.4 — resolves the current device's identity from
 * localStorage's token. Reads the prop list of (id, hash) and finds
 * the matching identity client-side. Token never goes back to the
 * server here; the identity ID is then threaded into ClaimRow as a
 * plain string. If no match → renders the children fallback (the
 * page passes an IdentityPicker for that branch).
 */
import { useEffect, useReducer, useSyncExternalStore, type ReactNode } from "react";

import { getOrCreateDeviceToken } from "@/features/identity/deviceToken";

function subscribeNoop(): () => void {
  return () => {};
}
function getServerSnap(): string | null {
  return null;
}
function getTokenSnap(): string | null {
  return getOrCreateDeviceToken();
}

async function hashHex(s: string): Promise<string> {
  const enc = new TextEncoder().encode(s);
  const digest = await crypto.subtle.digest("SHA-256", enc);
  return [...new Uint8Array(digest)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

interface Props {
  identities: { id: string; name: string; deviceTokenHash: string }[];
  fallback: ReactNode;
  children: (args: { id: string; name: string }) => ReactNode;
}

type ResolveState =
  | { status: "pending" }
  | { status: "resolved"; id: string | null; name: string };

type ResolveAction =
  | { type: "noToken" }
  | { type: "match"; id: string; name: string }
  | { type: "noMatch" };

function reducer(_state: ResolveState, action: ResolveAction): ResolveState {
  switch (action.type) {
    case "noToken":
    case "noMatch":
      return { status: "resolved", id: null, name: "" };
    case "match":
      return { status: "resolved", id: action.id, name: action.name };
  }
}

export function MyIdentityResolver({ identities, fallback, children }: Props) {
  const token = useSyncExternalStore(
    subscribeNoop,
    getTokenSnap,
    getServerSnap,
  );
  // useReducer's `dispatch` is the documented React-Compiler escape
  // for "I need to update state from inside an effect" — eslint
  // `react-hooks/set-state-in-effect` exempts dispatch by design.
  const [state, dispatch] = useReducer(reducer, { status: "pending" });

  useEffect(() => {
    if (!token) {
      dispatch({ type: "noToken" });
      return;
    }
    let cancelled = false;
    (async () => {
      const hash = await hashHex(token);
      if (cancelled) return;
      const match = identities.find((i) => i.deviceTokenHash === hash);
      if (match) {
        dispatch({ type: "match", id: match.id, name: match.name });
      } else {
        dispatch({ type: "noMatch" });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token, identities]);

  if (state.status === "pending") {
    return (
      <p className="text-sm text-muted-foreground">正在確認你的身份…</p>
    );
  }
  if (state.id === null) return <>{fallback}</>;
  return <>{children({ id: state.id, name: state.name })}</>;
}
