/**
 * Deterministic per-identity colour. The same person reads the same
 * colour everywhere (claim board, settlement breakdown) so you can
 * scan "who claimed what" at a glance.
 *
 * Tailwind only keeps class strings it sees literally, so the palette
 * is a fixed list and an identity is mapped onto it by hashing its id.
 */
export interface IdentityColor {
  /** Small filled circle (a bg-* class). */
  dot: string;
  /** Text colour for the person's name. */
  text: string;
}

const PALETTE: IdentityColor[] = [
  { dot: "bg-rose-500", text: "text-rose-700 dark:text-rose-300" },
  { dot: "bg-amber-500", text: "text-amber-700 dark:text-amber-300" },
  { dot: "bg-emerald-500", text: "text-emerald-700 dark:text-emerald-300" },
  { dot: "bg-sky-500", text: "text-sky-700 dark:text-sky-300" },
  { dot: "bg-violet-500", text: "text-violet-700 dark:text-violet-300" },
  { dot: "bg-pink-500", text: "text-pink-700 dark:text-pink-300" },
  { dot: "bg-teal-500", text: "text-teal-700 dark:text-teal-300" },
  { dot: "bg-orange-500", text: "text-orange-700 dark:text-orange-300" },
];

function hashString(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = (h * 31 + s.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}

/** Stable colour for an identity id. */
export function identityColor(identityId: string): IdentityColor {
  return PALETTE[hashString(identityId) % PALETTE.length];
}
