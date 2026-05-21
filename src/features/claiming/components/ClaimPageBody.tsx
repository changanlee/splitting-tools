"use client";

/**
 * Client entry for the claim page. Owns the device-token-based
 * identity resolution and the picker-vs-board conditional render in
 * one place, so the Server Component (`/splits/[linkId]/claim/page`)
 * only has to pass plain serialisable props — no render-prop function
 * crossing the RSC boundary (Next 16 forbids that).
 */
import { useEffect, useReducer, useSyncExternalStore } from "react";

import { ClaimBoardBody } from "@/features/claiming/components/ClaimBoardBody";
import { IdentityPicker } from "@/features/identity/components/IdentityPicker";
import { getOrCreateDeviceToken } from "@/features/identity/deviceToken";
import { resolveMyIdentityAction } from "@/features/identity/server/actions";

function subscribeNoop(): () => void {
  return () => {};
}
function getServerSnap(): string | null {
  return null;
}
function getTokenSnap(): string | null {
  return getOrCreateDeviceToken();
}

interface ClaimerForBoard {
  receiptLineId: string;
  identityId: string;
  identityName: string;
  weight: number;
}

interface LineForBoard {
  id: string;
  lineNo: number;
  description: string;
  netCents: number;
}

interface Existing {
  id: string;
  name: string;
}

interface Props {
  linkId: string;
  /** Server-rendered list — used by IdentityPicker for the "是不是你" path. */
  existing: Existing[];
  lines: LineForBoard[];
  claims: ClaimerForBoard[];
  unverified: boolean;
  currency: string | null;
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

export function ClaimPageBody({
  linkId,
  existing,
  lines,
  claims,
  unverified,
  currency,
}: Props) {
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
      try {
        // Resolve via a server action — node's `createHash` works in
        // any context, unlike `crypto.subtle` which iOS Safari hides on
        // plain-HTTP origins (LAN dev). The raw token only crosses the
        // wire here as it already does for create/pick; the server
        // hashes and never persists raw.
        const match = await resolveMyIdentityAction(linkId, token);
        if (cancelled) return;
        if (match) {
          dispatch({ type: "match", id: match.id, name: match.name });
        } else {
          dispatch({ type: "noMatch" });
        }
      } catch (e) {
        if (cancelled) return;
        console.error(
          "[ClaimPageBody] identity resolve failed:",
          e instanceof Error ? e.message : String(e),
        );
        dispatch({ type: "noMatch" });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [linkId, token]);

  if (state.status === "pending") {
    return <p className="text-sm text-muted-foreground">正在確認你的身份…</p>;
  }
  if (state.id === null) {
    return <IdentityPicker linkId={linkId} existing={existing} />;
  }
  return (
    <ClaimBoardBody
      linkId={linkId}
      myIdentityId={state.id}
      myName={state.name}
      lines={lines}
      claims={claims}
      unverified={unverified}
      currency={currency}
    />
  );
}
