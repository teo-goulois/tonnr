import { readAppLink } from "@repo/config/links";
import { describe, expect, it } from "vitest";

import { inviteAddress, inviteRefusalOf, isBlockedRefusal, qrPath } from "./friend-words";

const SITE = "https://tonnr.app";

describe("an account's link (decision 041)", () => {
  it("is written in the sender's language, and opens the invitation in the app (decision 073)", () => {
    expect(inviteAddress("abc_123", SITE, "en")).toBe("https://tonnr.app/i/abc_123");
    expect(inviteAddress("abc_123", SITE, "fr")).toBe("https://tonnr.app/fr/i/abc_123");

    const read = readAppLink(inviteAddress("abc_123", SITE, "pt"), SITE);
    expect(read).toMatchObject({ screen: "map", search: { invite: "abc_123" } });
  });

  it("is drawn as a square code with its quiet zone, dark squares only", () => {
    const { size, path } = qrPath("https://tonnr.app/i/abc_123");
    // Version 2 or 3 at level M, with a border of 2 on each side.
    expect(size).toBeGreaterThanOrEqual(25 + 4);
    expect(path.startsWith("M")).toBe(true);
    // The finder of the top left corner starts past the border.
    expect(path).toContain("M2 2h1v1h-1z");
    expect(path).not.toContain("M0 0h1v1h-1z");
  });

  it("reads why accepting a link was refused", () => {
    expect(inviteRefusalOf({ code: "CONFLICT" })).toBe("own");
    expect(inviteRefusalOf({ code: "FORBIDDEN", data: { blocked: true } })).toBe("blocked");
    expect(inviteRefusalOf({ code: "FORBIDDEN" })).toBe("ended");
    expect(inviteRefusalOf({ code: "NOT_FOUND" })).toBe("gone");
    expect(inviteRefusalOf(new Error("offline"))).toBe("failed");
    expect(inviteRefusalOf(null)).toBe("failed");
    expect(isBlockedRefusal({ code: "NOT_FOUND", data: { blocked: true } })).toBe(true);
    expect(isBlockedRefusal({ code: "NOT_FOUND" })).toBe(false);
  });
});
