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

interface IdentityForResolve {
  id: string;
  name: string;
  deviceTokenHash: string;
}

interface Existing {
  id: string;
  name: string;
}

interface Props {
  linkId: string;
  identities: IdentityForResolve[];
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
  identities,
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
