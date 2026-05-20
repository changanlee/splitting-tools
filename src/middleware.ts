/**
 * Story 6.2 — middleware that stamps `X-Robots-Tag: noindex, nofollow,
 * noarchive` on every response. The meta tag in layout.tsx handles
 * HTML; this header covers JSON / images / anything else (and a
 * misconfigured CDN cache that strips meta). The triple of
 * (metadata.robots + robots.txt + this header) is the architecture
 * L262 'noindex 三重保險' (NFR-S6).
 */
import { NextResponse } from "next/server";

export function middleware(): NextResponse {
  const res = NextResponse.next();
  res.headers.set("X-Robots-Tag", "noindex, nofollow, noarchive");
  return res;
}

export const config = {
  // Run on every route — page, API, even static assets.
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
