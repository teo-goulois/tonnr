import { describe, expect, it } from "vitest";

import { isListToken, linkAuthorizationOf, listLinkOf, placeLinkOf } from "./links";

describe("the addresses a list and a place are sent by", () => {
  it("writes a list's short address in the sender's language, English with no prefix", () => {
    expect(listLinkOf("https://tonnr.app/", "en", "abc_DEF-123")).toBe(
      "https://tonnr.app/l/abc_DEF-123",
    );
    expect(listLinkOf("https://tonnr.app", "fr", "abc")).toBe("https://tonnr.app/fr/l/abc");
  });

  it("sends a break and a station by their short address, and a spot by none", () => {
    expect(placeLinkOf("https://tonnr.app", "pt", { kind: "break", id: "42" })).toBe(
      "https://tonnr.app/pt/b/42",
    );
    expect(placeLinkOf("https://tonnr.app", "en", { kind: "station", id: "ndbc:41001" })).toBe(
      "https://tonnr.app/s/ndbc%3A41001",
    );
    expect(placeLinkOf("https://tonnr.app", "en", { kind: "spot", id: "s" })).toBeNull();
  });

  it("tells the API of a link with what stands for its password, and of one that asks none", () => {
    expect(linkAuthorizationOf("tok", "f00d")).toBe("List tok.f00d");
    expect(linkAuthorizationOf("tok", null)).toBe("List tok");
    expect(linkAuthorizationOf("tok", "")).toBe("List tok");
  });

  it("keeps nothing under a link's end that no list could have", () => {
    expect(isListToken("Ab9_-Ab9_-Ab9_-Ab9_-Ab")).toBe(true);
    expect(isListToken("../secret")).toBe(false);
    expect(isListToken("")).toBe(false);
    expect(isListToken(undefined)).toBe(false);
  });
});
