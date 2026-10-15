import { APP_NAME } from "@repo/config/app";

// How a mail of the instance looks: a few pieces, drawn in the light theme of the web app
// (`packages/ui/src/styles/globals.css`), that every mail is written with. A mail program keeps
// no style sheet and loads nothing: each piece carries its style, and a table holds the page.
// Nothing is loaded from elsewhere, no font, no image. Decision 026, "How a mail looks".

/** The theme's values, as a mail can hold them. */
export const MAIL_THEME = {
  canvas: "#fafafa",
  surface: "#ffffff",
  panel: "#fafafa",
  border: "#dedede",
  text: "#000000",
  muted: "#6c6c6c",
  accent: "#262626",
  accentText: "#fafafa",
  // The theme's font is Geist, which a mail does not load: the reader's own sans serif stands in.
  font: "Geist, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
  radius: "28px",
  panelRadius: "18px",
} as const;

const ESCAPES: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};
/** Text as a mail's page shows it, whatever it holds. */
export const escape = (text: string) =>
  text.replace(/[&<>"']/g, (character) => ESCAPES[character] ?? "");

const T = MAIL_THEME;
const TEXT = `font-family: ${T.font}; font-size: 15px; line-height: 23px; color: ${T.text};`;
const SMALL = `font-family: ${T.font}; font-size: 13px; line-height: 20px; color: ${T.muted};`;

/** The title of a mail, at the top of its card. */
export const heading = (text: string) =>
  `<h1 style="margin: 0 0 16px; font-family: ${T.font}; font-size: 22px; line-height: 28px; font-weight: 600; color: ${T.text};">${escape(text)}</h1>`;

/** A paragraph. `preWrap` keeps the lines of what someone typed. */
export const paragraph = (text: string, { preWrap = false } = {}) =>
  `<p style="margin: 0 0 16px; ${TEXT}${preWrap ? " white-space: pre-wrap;" : ""}">${escape(text)}</p>`;

/** What a reader may want to know and need not read: a small line in the muted color. */
export const note = (text: string) => `<p style="margin: 0 0 12px; ${SMALL}">${escape(text)}</p>`;

/** The one thing a mail asks: a button in the theme's accent, which is a link. */
export const button = (label: string, href: string) =>
  [
    `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin: 8px 0 20px;"><tr>`,
    `<td style="border-radius: 9999px; background: ${T.accent};">`,
    `<a href="${escape(href)}" style="display: inline-block; padding: 12px 24px; border-radius: 9999px; font-family: ${T.font}; font-size: 15px; line-height: 20px; font-weight: 600; color: ${T.accentText}; text-decoration: none;">${escape(label)}</a>`,
    `</td></tr></table>`,
  ].join("");

/** A link written out in full, under its button, for a mail program that shows no button. */
export const linkAsText = (href: string) =>
  `<p style="margin: 0 0 16px; ${SMALL} word-break: break-all;">${escape(href)}</p>`;

/** A part of a mail set apart, such as one spot of an alert: a title, its lines, and a link. */
export const panel = ({
  title,
  rows,
  link,
  preWrap = false,
}: {
  title?: string;
  rows: string[];
  link?: { label: string; href: string };
  preWrap?: boolean;
}) =>
  [
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin: 0 0 12px; border-collapse: separate;"><tr>`,
    `<td style="padding: 16px 20px; background: ${T.panel}; border: 1px solid ${T.border}; border-radius: ${T.panelRadius};">`,
    title ? `<p style="margin: 0 0 4px; ${TEXT} font-weight: 600;">${escape(title)}</p>` : "",
    ...rows.map(
      (row) =>
        `<p style="margin: 0; ${TEXT}${preWrap ? " white-space: pre-wrap;" : ""}">${escape(row)}</p>`,
    ),
    link
      ? `<p style="margin: 10px 0 0; ${TEXT}"><a href="${escape(link.href)}" style="color: ${T.text}; font-weight: 600;">${escape(link.label)} →</a></p>`
      : "",
    `</td></tr></table>`,
  ].join("");

/** A line under the card: words, and links, one after the other. */
export const footerLine = (parts: (string | { label: string; href: string })[]) =>
  `<p style="margin: 0 0 8px; ${SMALL}">${parts
    .map((part) =>
      typeof part === "string"
        ? escape(part)
        : `<a href="${escape(part.href)}" style="color: ${T.muted};">${escape(part.label)}</a>`,
    )
    .join(" · ")}</p>`;

/**
 * A mail's page: the product's name, a card that holds what the mail says, and the lines under
 * it. `content` and `footer` are pieces of this file.
 */
export function mailPage({
  locale,
  content,
  footer = [],
}: {
  locale: string;
  content: string[];
  footer?: string[];
}) {
  return [
    `<!doctype html><html lang="${escape(locale)}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="color-scheme" content="light"><meta name="supported-color-schemes" content="light"></head>`,
    `<body style="margin: 0; padding: 0; background: ${T.canvas};">`,
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background: ${T.canvas};"><tr><td align="center" style="padding: 32px 16px;">`,
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width: 560px;">`,
    `<tr><td style="padding: 0 8px 16px; font-family: ${T.font}; font-size: 17px; line-height: 24px; font-weight: 700; letter-spacing: -0.02em; color: ${T.text};">${escape(APP_NAME)}</td></tr>`,
    `<tr><td style="padding: 32px 28px 16px; background: ${T.surface}; border: 1px solid ${T.border}; border-radius: ${T.radius};">`,
    ...content,
    `</td></tr>`,
    footer.length > 0 ? `<tr><td style="padding: 20px 8px 0;">${footer.join("")}</td></tr>` : "",
    `</table>`,
    `</td></tr></table>`,
    `</body></html>`,
  ].join("\n");
}
