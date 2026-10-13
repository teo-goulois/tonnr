import { describe, expect, it } from "vitest";

import { EXAMPLE_STATION, llmsText } from "./llms";

describe("llmsText", () => {
  const text = llmsText({ site: "https://site.example", api: "https://api.example" });

  it("names the two addresses it is given, and no other of its own", () => {
    expect(text).toContain("https://site.example/app");
    expect(text).toContain("https://api.example/v1/openapi.json");
    expect(text).toContain(`https://api.example/v1/stations/${EXAMPLE_STATION}`);
    expect(text).not.toContain("localhost");
  });

  it("says how a program calls", () => {
    expect(text).toContain("Authorization: Bearer");
  });
});
