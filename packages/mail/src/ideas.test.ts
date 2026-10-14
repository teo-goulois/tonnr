import { describe, expect, it } from "vitest";

import { ideaMail } from "./ideas";

describe("the mail of an idea", () => {
  it("names its sender in the subject, on one line, and is answered to them", () => {
    const mail = ideaMail(
      { name: " Léa \t Martin ", email: "lea@example.org", idea: "Swell", locale: "en" },
      "maker@example.org",
    );

    expect(mail).toMatchObject({
      to: "maker@example.org",
      subject: "Feature from landing: Léa Martin",
      replyTo: "lea@example.org",
    });
    expect(mail.text).toContain("in English");
  });

  it("writes what was typed as text, in its mail of HTML too", () => {
    const mail = ideaMail({
      name: "<b>Léa</b>",
      email: "lea@example.org",
      idea: '<img src="x">\nline two',
      locale: "fr",
    });

    expect(mail.html).not.toContain("<img");
    expect(mail.html).not.toContain("<b>");
    expect(mail.html).toContain("&lt;img src=&quot;x&quot;&gt;\nline two");
    expect(mail.text).toContain('<img src="x">\nline two');
  });
});
