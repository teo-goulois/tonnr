import { describe, expect, it } from "vitest";

import {
  button,
  footerLine,
  heading,
  linkAsText,
  MAIL_THEME,
  mailPage,
  note,
  panel,
  paragraph,
} from "./design";

describe("the pieces a mail is drawn with", () => {
  const page = mailPage({
    locale: "fr",
    content: [
      heading("Un titre"),
      paragraph("Une ligne"),
      button("Ouvrir", "https://app.example.org/?a=1&b=2"),
      linkAsText("https://app.example.org/?a=1&b=2"),
      panel({ title: "Un spot", rows: ["7 h – 10 h"], link: { label: "Voir", href: "https://x" } }),
      note("Une note"),
    ],
    footer: [footerLine(["Tonnr", { label: "Réglages", href: "https://app.example.org/s" }])],
  });

  it("make a page in the reader's language, in the theme's colors, that loads nothing", () => {
    expect(page).toMatch(/^<!doctype html><html lang="fr">/);
    expect(page).toContain(MAIL_THEME.accent);
    expect(page).toContain('href="https://app.example.org/?a=1&amp;b=2"');
    expect(page).toContain('href="https://app.example.org/s"');
    // No image, no script, no style sheet, no font from elsewhere.
    expect(page).not.toMatch(/<img|<script|<link|<style|url\(|@import/i);
  });

  it("write what they are given as text, whatever it holds", () => {
    const written = [
      heading("<b>x</b>"),
      paragraph("<b>x</b>"),
      note("<b>x</b>"),
      button("<b>x</b>", '"><script>'),
      panel({ title: "<b>x</b>", rows: ["<b>x</b>"] }),
      footerLine(["<b>x</b>"]),
    ].join("");

    expect(written).not.toContain("<b>");
    expect(written).not.toContain("<script>");
    expect(written).toContain("&lt;b&gt;x&lt;/b&gt;");
  });
});
