import { LOCALES } from "@repo/config/locales";
import { describe, expect, it } from "vitest";

import { type ModerationMailContent, moderationMail } from "./moderation";

const ADMIN = "https://admin.example.org";
const content: ModerationMailContent = {
  to: "hello@example.org",
  locale: "en",
  reports: [
    {
      breakName: "The point",
      note: "Clean sets",
      state: "hidden",
      flags: [
        { reason: "offensive", counts: true },
        { reason: "not_sea", counts: false },
      ],
    },
  ],
  contests: [{ breakName: null, value: "Park by the church", reason: "There is no church" }],
  more: false,
  links: {
    reports: `${ADMIN}/moderation?kind=reports&state=flagged`,
    guides: `${ADMIN}/moderation?kind=guides&queue=contested`,
  },
};

// What accounts flagged and contested, told to the instance's address: decision 067.
describe("the mail of what accounts flagged", () => {
  it("names each report and line with its reason, whether each flag counts, and where to decide", () => {
    const mail = moderationMail(content);

    expect(mail).toMatchObject({ to: "hello@example.org", subject: "To moderate on Tonnr" });
    expect(mail.text).toContain("The point");
    expect(mail.text).toContain("“Clean sets”");
    expect(mail.text).toContain("Offensive · counts toward hiding it");
    expect(mail.text).toContain("Not the waves · hides nothing");
    expect(mail.text).toContain("Hidden until you decide.");
    expect(mail.text).toContain("A break that left the catalogue");
    expect(mail.text).toContain("Contested: “There is no church”");
    expect(mail.text).toContain(
      `Open the moderation: ${ADMIN}/moderation?kind=reports&state=flagged`,
    );
    expect(mail.html).toContain(`href="${ADMIN}/moderation?kind=guides&amp;queue=contested"`);
    expect(mail.text).not.toContain("More wait");
  });

  it("leaves out a part with nothing in it, the links of an instance with no admin app, and says when more wait", () => {
    const mail = moderationMail({ ...content, contests: [], links: null, more: true });

    expect(mail.text).not.toContain("Lines of the guides");
    expect(mail.text).not.toContain("moderation?");
    expect(mail.html).not.toContain("href=");
    expect(mail.text).toContain("More wait in the admin");
  });

  it("is written in every language, with what someone typed kept as text", () => {
    for (const locale of LOCALES) {
      const mail = moderationMail({
        ...content,
        locale,
        contests: [{ breakName: "<b>Reef</b>", value: "x".repeat(400), reason: '<img src="x">' }],
      });
      expect(mail.html).toContain(`<html lang="${locale}">`);
      expect(mail.html).not.toContain("<img");
      expect(mail.html).toContain("&lt;b&gt;Reef&lt;/b&gt;");
      // A long text is cut to one short line.
      expect(mail.text).not.toContain("x".repeat(200));
    }
    const french = moderationMail({ ...content, locale: "fr" });
    expect(french.subject).toBe("À modérer sur Tonnr");
    // French quotes between guillemets, and puts a space before a colon.
    expect(french.text).toContain("Contesté : « There is no church »");
  });
});
