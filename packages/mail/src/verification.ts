import { APP_NAME } from "@repo/config/app";

import type { Mail } from "./index";

export type Locale = "en" | "fr";

const ESCAPES: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};
const escape = (text: string) => text.replace(/[&<>"']/g, (character) => ESCAPES[character] ?? "");

const WORDS = {
  en: {
    subject: `Check your address for ${APP_NAME}`,
    intro: `Someone signed up to ${APP_NAME} with this address. If it was you, follow this link to say that the address is yours:`,
    button: "This address is mine",
    after:
      "The link is good for a day. If you did not sign up, ignore this mail: nothing happens without the link.",
  },
  fr: {
    subject: `Vérifie ton adresse pour ${APP_NAME}`,
    intro: `Quelqu’un s’est inscrit sur ${APP_NAME} avec cette adresse. Si c’est toi, suis ce lien pour dire que l’adresse est la tienne :`,
    button: "Cette adresse est la mienne",
    after:
      "Le lien est valable un jour. Si tu ne t’es pas inscrit, ignore ce message : rien ne se passe sans le lien.",
  },
} satisfies Record<Locale, Record<string, string>>;

/**
 * The language a request asks for, from its `Accept-Language`: the one it likes best of French
 * and English, and English when it names neither or says nothing.
 */
export function localeOf(acceptLanguage: string | null | undefined): Locale {
  const wanted = (acceptLanguage ?? "")
    .split(",")
    .map((range, index) => {
      const [tag = "", ...parameters] = range.trim().toLowerCase().split(";");
      const quality = parameters
        .map((given) => given.trim())
        .find((given) => given.startsWith("q="));
      const weight = quality === undefined ? 1 : Number(quality.slice(2));
      return { language: tag.trim().split("-")[0] ?? "", weight, index };
    })
    // A weight of zero says "not this one".
    .filter(({ language, weight }) => (language === "fr" || language === "en") && weight > 0)
    .sort((a, b) => b.weight - a.weight || a.index - b.index);
  return wanted[0]?.language === "fr" ? "fr" : "en";
}

/**
 * The mail that asks an account to check its address: plain, in one language, with the link and
 * nothing that is loaded from elsewhere. `link` is the instance's own, made by the API.
 */
export function verificationMail(to: string, link: string, locale: Locale): Mail {
  const words = WORDS[locale];
  const text = `${words.intro}\n\n${link}\n\n${words.after}\n`;
  const html = [
    `<!doctype html><html lang="${locale}"><body style="font-family: sans-serif; line-height: 1.5;">`,
    `<p>${escape(words.intro)}</p>`,
    `<p><a href="${escape(link)}">${escape(words.button)}</a></p>`,
    `<p style="color: #555; font-size: 0.9em;">${escape(link)}</p>`,
    `<p>${escape(words.after)}</p>`,
    "</body></html>",
  ].join("\n");
  return { to, subject: words.subject, text, html };
}
