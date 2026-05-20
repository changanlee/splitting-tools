/**
 * Story 6.2 — robots.txt. Disallow EVERYTHING; we have no public
 * marketing pages, and split links are unguessable so there's
 * nothing for a crawler to even try to find (NFR-S6 anti-discovery).
 */
import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        disallow: "/",
      },
    ],
  };
}
