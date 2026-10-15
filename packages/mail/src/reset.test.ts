import { LOCALES } from "@repo/config/locales";
import { describe, expect, it } from "vitest";

import { resetMail } from "./reset";

describe("the mail that lets an account choose a new password", () => {
  const link = "https://app.example.org/fr/reset-password?token=a1B2c3D4e5F6g7H8i9J0k1L2";

  it("is in each language of the product, with the link in its text and in its page", () => {
    const subjects = {
      en: "Choose a new password",
      fr: "Choisis un nouveau mot de passe",
      es: "Elige una nueva contraseña",
      pt: "Escolhe uma nova palavra-passe",
    };
    // What each says of the link: that it works once, for an hour.
    const once = { en: "once", fr: "qu’une fois", es: "una sola vez", pt: "uma só vez" };
    for (const locale of LOCALES) {
      const written = resetMail("ana@example.org", link, locale);

      expect(written.to).toBe("ana@example.org");
      expect(written.subject).toContain(subjects[locale]);
      expect(written.text).toContain(once[locale]);
      expect(written.text).toContain(link);
      expect(written.html).toContain(`<html lang="${locale}">`);
      expect(written.html).toContain(link);
      // Nothing is loaded from elsewhere: no image, no script, no style sheet.
      expect(written.html).not.toMatch(/<img|<script|<link|url\(/i);
    }
  });

  it("writes a link as text, whatever it holds", () => {
    const written = resetMail("ana@example.org", 'https://x.example/?a="><script>1</script>', "es");

    expect(written.html).not.toContain("<script>");
    expect(written.html).toContain("&quot;&gt;&lt;script&gt;");
  });
});
