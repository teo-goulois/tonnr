import { describe, expect, it } from "vitest";

import { publicSourceUrl } from "./private-source-values";

describe("addresses found in private source exports", () => {
  it("offers only an explicit HTTP address without credentials or a local host", () => {
    expect(publicSourceUrl("https://www.example.org/source?id=7#version")).toBe(
      "https://www.example.org/source?id=7#version",
    );
    expect(publicSourceUrl("http://example.org/report")).toBe("http://example.org/report");
    for (const value of [
      "javascript:alert(1)",
      "data:text/html,<img src=x>",
      "file:///private/source.json",
      "//example.org/report",
      "https://user:password@example.org/report",
      "https://user@example.org/report",
      "https://localhost/report",
      "https://catalogue.internal/report",
      "http://127.0.0.1/report",
      "http://0x7f000001/report",
      "http://192.168.1.2/report",
      "http://[::1]/report",
      "https://example.org/\nreport",
      " https://example.org/report",
      "https://example.org\\@localhost/report",
      null,
    ])
      expect(publicSourceUrl(value), String(value)).toBeNull();
  });
});
