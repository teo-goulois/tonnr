import { type Locale, localePrefix } from "@repo/config/locales";
import { encode } from "uqr";

// What the friends of an account are read by, and what draws its link (decision 041): a module
// that draws nothing, so that a test reads it.

/**
 * The address a link is sent by, on the web app's site and in the language of whoever sends it,
 * as the web's `inviteAddress` writes it: `/i/<token>`, which opens the app where it is
 * installed (decision 073) and the web where it is not.
 */
export function inviteAddress(token: string, site: string, locale: Locale) {
  return new URL(`${localePrefix(locale)}/i/${encodeURIComponent(token)}`, site).href;
}

/**
 * A text as a code that a camera reads, as one path of squares on a grid of `size`, as the web's
 * `QrCode` draws it. The quiet zone around the code is part of what a camera needs.
 */
export function qrPath(text: string) {
  const code = encode(text, { ecc: "M", border: 2 });
  let path = "";
  code.data.forEach((row, y) => {
    row.forEach((isDark, x) => {
      if (isDark) path += `M${x} ${y}h1v1h-1z`;
    });
  });
  return { size: code.size, path };
}

/** What an answer of the API to a link says, as the invitation reads it. */
export type InviteRefusal = "own" | "blocked" | "ended" | "gone" | "failed";

/** Why accepting a link was refused, from the API's answer: decisions 041 and 071. */
export function inviteRefusalOf(error: unknown): InviteRefusal {
  const { code, data } = (error ?? {}) as { code?: unknown; data?: { blocked?: unknown } };
  if (code === "CONFLICT") return "own";
  if (code === "FORBIDDEN" && data?.blocked === true) return "blocked";
  if (code === "FORBIDDEN") return "ended";
  if (code === "NOT_FOUND") return "gone";
  return "failed";
}

/** Whether the refusal of `friends.open` says the reader blocked the link's owner. */
export function isBlockedRefusal(error: unknown) {
  return (error as { data?: { blocked?: unknown } } | null)?.data?.blocked === true;
}
