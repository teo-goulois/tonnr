import { failingAdapter, memoryAdapter } from "@opencoredev/email-sdk/testing";
import { unosend } from "@opencoredev/email-sdk/unosend";
import { afterEach, describe, expect, it, vi } from "vitest";

import { createMailer, readSender, readSmtp } from "./index";
import { localeOf, verificationMail } from "./verification";

// No test sends a mail: the library's adapter in memory stands for the way out.
const settings = { UNOSEND_API_KEY: "made-up", EMAIL_FROM: "Tonnr <hello@example.org>" };
const mail = { to: "ana@example.org", subject: "A subject", text: "Text", html: "<p>Text</p>" };

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("the mailer of an instance", () => {
  it("is none when the settings name no way out", () => {
    expect(createMailer({})).toBeNull();
    expect(createMailer({ EMAIL_FROM: "hello@example.org" })).toBeNull();
  });

  it("is not made of settings that cannot be right", () => {
    expect(() => createMailer({ UNOSEND_API_KEY: "made-up" })).toThrow("EMAIL_FROM");
    expect(() => createMailer({ ...settings, SMTP_URL: "smtps://mail.example.org" })).toThrow(
      "not both",
    );
    for (const from of [
      "no address",
      "Tonnr <hello@example.org>\r\nBcc: someone@example.org",
      // Two senders, in each of the ways two can be written.
      "one@example.org, two@example.org",
      "one@example.org,Team <other@example.org>",
      "Surf, team <hello@example.org>",
      // A name that would have to be quoted is not taken: it is written without the signs.
      '"Surf, team" <hello@example.org>',
      "Tonnr: <hello@example.org>",
      "<hello@example.org>",
      "Tonnr <hello@example>",
    ]) {
      expect(() => createMailer({ ...settings, EMAIL_FROM: from }), from).toThrow("EMAIL_FROM");
    }
    expect(createMailer({ ...settings, EMAIL_FROM: "hello@example.org" })?.via).toBe("unosend");
    expect(
      createMailer({ SMTP_URL: "smtp://mail.example.org", EMAIL_FROM: "a@example.org" })?.via,
    ).toBe("smtp");
  });

  it("reads one sender, with a name or without", () => {
    expect(readSender("Tonnr <hello@example.org>")).toEqual({
      email: "hello@example.org",
      name: "Tonnr",
    });
    expect(readSender("Côte & Vagues 29 <hello@sub.example.org>")).toEqual({
      email: "hello@sub.example.org",
      name: "Côte & Vagues 29",
    });
    expect(readSender("hello@example.org")).toEqual({ email: "hello@example.org" });
  });

  it("asks nothing of anyone when it is made, the library's authors included", () => {
    const asked = vi.fn(() => Promise.reject(new Error("no network in a test")));
    vi.stubGlobal("fetch", asked);

    createMailer(settings);
    createMailer({ SMTP_URL: "smtps://mail.example.org", EMAIL_FROM: "a@example.org" });

    expect(asked).not.toHaveBeenCalled();
  });

  it("sends a mail once, from the instance's sender, to the address alone", async () => {
    const out = memoryAdapter("unosend");
    const mailer = createMailer(settings, out);

    expect(await mailer?.send(mail)).toBe("accepted");

    expect(out.raw?.sent).toHaveLength(1);
    expect(out.raw?.sent[0]?.message).toEqual({
      from: { email: "hello@example.org", name: "Tonnr" },
      ...mail,
    });
  });

  it("says that a mail was not taken, tries it once, and logs how it failed and nothing of it", async () => {
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});
    const refusing = failingAdapter("unosend", new Error("ana@example.org is not welcome here"));
    const tried = vi.spyOn(refusing, "send");

    expect(await createMailer(settings, refusing)?.send(mail)).toBe("failed");

    expect(tried).toHaveBeenCalledTimes(1);
    const said = logged.mock.calls.flat().join(" ");
    expect(said).toContain("mail: not accepted by unosend");
    expect(said).not.toContain("ana@example.org");
    expect(said).not.toContain("welcome");
  });
});

describe("a mail through Unosend, with a function in place of the network", () => {
  // What the adapter asks, and what it is answered.
  function network(answer: (signal: AbortSignal | null | undefined) => Promise<Response>) {
    const asked: { url: string; headers: Headers; body: Record<string, unknown> }[] = [];
    const fetching = (async (input: RequestInfo | URL, init?: RequestInit) => {
      asked.push({
        url: String(input),
        headers: new Headers(init?.headers),
        body: JSON.parse(String(init?.body)) as Record<string, unknown>,
      });
      return answer(init?.signal);
    }) as typeof fetch;
    return { asked, out: unosend({ apiKey: "made-up-key", fetch: fetching }) };
  }

  it("leaves once, with its text and its page, to the address alone", async () => {
    const { asked, out } = network(async () =>
      Response.json({ success: true, data: { id: "m1" } }),
    );

    expect(await createMailer(settings, out)?.send(mail)).toBe("accepted");

    expect(asked).toHaveLength(1);
    expect(new URL(asked[0]?.url ?? "").hostname).toContain("unosend");
    expect(asked[0]?.headers.get("authorization")).toBe("Bearer made-up-key");
    const sent = JSON.stringify(asked[0]?.body);
    for (const part of [
      "hello@example.org",
      "ana@example.org",
      "A subject",
      "Text",
      "<p>Text</p>",
    ]) {
      expect(sent).toContain(part);
    }
  });

  it("is not tried again when the provider fails, and the log keeps nothing of its answer", async () => {
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});
    const { asked, out } = network(
      async () => new Response("ana@example.org bounced before", { status: 500 }),
    );

    expect(await createMailer(settings, out)?.send(mail)).toBe("failed");

    expect(asked).toHaveLength(1);
    const said = logged.mock.calls.flat().join(" ");
    expect(said).toContain("500");
    expect(said).not.toContain("ana@example.org");
    expect(said).not.toContain("bounced");
  });

  it("is given up when the provider does not answer in time, and the request is ended", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    let ended = false;
    const { out } = network(
      (signal) =>
        new Promise((_, reject) => {
          signal?.addEventListener("abort", () => {
            ended = true;
            reject(signal.reason);
          });
        }),
    );

    const began = performance.now();
    expect(await createMailer(settings, out, 150)?.send(mail)).toBe("failed");

    expect(performance.now() - began).toBeLessThan(2000);
    expect(ended).toBe(true);
  });
});

describe("an SMTP server's address", () => {
  it("is read with its port, its way of speaking TLS, and who signs in", () => {
    expect(readSmtp("smtp://relay%40example.org:p%40ss%2Fword@mail.example.org:2525")).toEqual({
      host: "mail.example.org",
      port: 2525,
      secure: false,
      requireTLS: true,
      timeoutMs: 10_000,
      auth: { user: "relay@example.org", pass: "p@ss/word" },
    });
    expect(readSmtp("smtps://mail.example.org")).toEqual({
      host: "mail.example.org",
      port: 465,
      secure: true,
      requireTLS: false,
      timeoutMs: 10_000,
    });
    expect(readSmtp("smtp://mail.example.org")).toMatchObject({ port: 587, requireTLS: true });
    // An address of the network written in full, as the library takes it: without brackets.
    expect(readSmtp("smtps://[::1]:465")).toMatchObject({ host: "::1", port: 465 });
    expect(readSmtp("smtp://mail.example.org/")).toMatchObject({ host: "mail.example.org" });
  });

  it("is refused when it is not one, or says more than a server takes", () => {
    for (const address of [
      "mail.example.org",
      "https://mail.example.org",
      "smtp://",
      "smtp://mail.example.org:0",
      "smtp://mail.example.org/inbox",
      "smtp://mail.example.org?tls=no",
      "smtp://mail.example.org#later",
    ]) {
      expect(() => readSmtp(address), address).toThrow("SMTP_URL");
    }
  });
});

describe("the mail that asks an account to check its address", () => {
  const link =
    "https://api.example.org/api/auth/verify-email?token=a.b-c_d&callbackURL=https%3A%2F%2Fapp.example.org%2Fverified";

  it("is in the language asked for, with the link in its text and in its page", () => {
    const english = verificationMail("ana@example.org", link, "en");
    const french = verificationMail("ana@example.org", link, "fr");

    expect(english.to).toBe("ana@example.org");
    expect(english.subject).toContain("Check your address");
    expect(french.subject).toContain("Vérifie ton adresse");
    for (const written of [english, french]) {
      expect(written.text).toContain(link);
      expect(written.html).toContain(link.replaceAll("&", "&amp;"));
      // Nothing is loaded from elsewhere: no image, no script, no style sheet.
      expect(written.html).not.toMatch(/<img|<script|<link|url\(/i);
    }
  });

  it("writes a link as text, whatever it holds", () => {
    const written = verificationMail(
      "ana@example.org",
      'https://x.example/?a="><script>1</script>',
      "en",
    );

    expect(written.html).not.toContain("<script>");
    expect(written.html).toContain("&quot;&gt;&lt;script&gt;");
  });

  it("is in the language a request likes best of the two, and in English otherwise", () => {
    expect(localeOf("fr-FR,fr;q=0.9,en;q=0.8")).toBe("fr");
    expect(localeOf("fr")).toBe("fr");
    expect(localeOf("fr;q=1.0,en;q=0.5")).toBe("fr");
    expect(localeOf("en;q=0.5, fr;q=0.8")).toBe("fr");
    expect(localeOf("de, fr-CA;q=0.7, en;q=0.2")).toBe("fr");
    expect(localeOf("en-GB,fr;q=0.5")).toBe("en");
    // A weight of zero says that the language is not wanted.
    expect(localeOf("fr;q=0, en")).toBe("en");
    expect(localeOf("fr-FR;q=0")).toBe("en");
    // A weight that is none is not weighed.
    expect(localeOf("en;q=1,fr;q=2")).toBe("en");
    expect(localeOf("fr;q=abc")).toBe("en");
    expect(localeOf("de")).toBe("en");
    expect(localeOf(null)).toBe("en");
    expect(localeOf("")).toBe("en");
  });
});
