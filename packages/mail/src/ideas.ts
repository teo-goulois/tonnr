import { APP_NAME, CONTACT_EMAIL } from "@repo/config/app";

import type { Mail } from "./index";

// The mail that brings whoever makes the product an idea that someone sent from the landing, or a
// message from the page that contacts them: decision 026. It is written to its maker, in English,
// and answered to the one who sent it.

export type Idea = {
  // The first name the sender gave.
  name: string;
  // Their address, where an answer goes. The API checked that it is one.
  email: string;
  // What they would like, or what they say, in their own words.
  idea: string;
  // An idea for the product, from the landing, or a message of any kind, from the contact page.
  about?: "idea" | "message";
  // The language of the page they sent it from.
  locale: "en" | "fr";
};

const ESCAPES: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};
const escape = (text: string) => text.replace(/[&<>"']/g, (character) => ESCAPES[character] ?? "");

const LANGUAGES = { en: "English", fr: "French" } satisfies Record<Idea["locale"], string>;

// What the mail says it is, and where it was sent from.
const ABOUT = {
  idea: { subject: "Feature from landing", sent: "an idea from the landing" },
  message: { subject: "Message from contact", sent: "a message from the contact page" },
} satisfies Record<NonNullable<Idea["about"]>, { subject: string; sent: string }>;

/** The mail of an idea, to `to`: the subject names the sender, so that two ideas are two threads. */
export function ideaMail(
  { name, email, idea, locale, about = "idea" }: Idea,
  to = CONTACT_EMAIL,
): Mail {
  // A subject is one line.
  const who = name.replace(/\s+/g, " ").trim();
  const intro = `${who} <${email}> sent ${ABOUT[about].sent} of ${APP_NAME}, in ${LANGUAGES[locale]}.`;
  const after = "Answer this mail to answer them.";
  const text = `${intro}\n\n${idea}\n\n${after}\n`;
  const html = [
    `<!doctype html><html lang="en"><body style="font-family: sans-serif; line-height: 1.5;">`,
    `<p>${escape(intro)}</p>`,
    `<p style="white-space: pre-wrap;">${escape(idea)}</p>`,
    `<p style="color: #555; font-size: 0.9em;">${escape(after)}</p>`,
    "</body></html>",
  ].join("\n");
  return { to, subject: `${ABOUT[about].subject}: ${who}`, text, html, replyTo: email };
}
