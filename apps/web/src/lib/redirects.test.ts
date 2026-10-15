import { describe, expect, it } from "vitest";

import { permanentWhenSamePage } from "./redirects";

const redirect = (location: string, status = 307) =>
  new Response(null, { status, headers: { Location: location } });

const statusOf = (url: string, response: Response) =>
  permanentWhenSamePage(new Request(url), response).status;

describe("permanentWhenSamePage", () => {
  it("makes permanent a redirect that only adds or drops the last slash", () => {
    expect(statusOf("https://site.example/fr", redirect("/fr/"))).toBe(308);
    expect(statusOf("https://site.example/sources/", redirect("/sources"))).toBe(308);
    expect(statusOf("https://site.example/fr/sources/", redirect("/fr/sources"))).toBe(308);
    expect(statusOf("https://site.example/fr?a=1", redirect("https://site.example/fr/?a=1"))).toBe(
      308,
    );
  });

  it("keeps where it leads", () => {
    const settled = permanentWhenSamePage(new Request("https://site.example/fr"), redirect("/fr/"));
    expect(settled.headers.get("Location")).toBe("/fr/");
  });

  it("leaves a redirect to another page or language as it is", () => {
    expect(statusOf("https://site.example/l/abc", redirect("/app?shared=abc"))).toBe(307);
    expect(statusOf("https://site.example/", redirect("/fr/"))).toBe(307);
    expect(statusOf("https://site.example/fr", redirect("/fr/?a=1"))).toBe(307);
  });

  it("leaves alone what is no 307", () => {
    expect(statusOf("https://site.example/fr", redirect("/fr/", 302))).toBe(302);
    expect(statusOf("https://site.example/fr", new Response("ok"))).toBe(200);
  });
});
