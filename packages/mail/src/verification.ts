import { APP_NAME } from "@repo/config/app";
import { isLocale } from "@repo/config/locales";
import type { Locale } from "@repo/config/locales";

import { button, heading, linkAsText, mailPage, note, paragraph } from "./design";
import type { Mail } from "./index";

export type { Locale };

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
  es: {
    subject: `Confirma tu dirección para ${APP_NAME}`,
    intro: `Alguien se ha registrado en ${APP_NAME} con esta dirección. Si has sido tú, sigue este enlace para confirmar que la dirección es tuya:`,
    button: "Esta dirección es mía",
    after:
      "El enlace vale durante un día. Si no te has registrado, ignora este correo: no pasa nada sin el enlace.",
  },
  pt: {
    subject: `Confirma o teu endereço para ${APP_NAME}`,
    intro: `Alguém se registou no ${APP_NAME} com este endereço. Se foste tu, segue esta ligação para confirmar que o endereço é teu:`,
    button: "Este endereço é meu",
    after:
      "A ligação é válida durante um dia. Se não te registaste, ignora este email: nada acontece sem a ligação.",
  },
} satisfies Record<Locale, Record<string, string>>;

/**
 * The language a request asks for, from its `Accept-Language`: the one it likes best of those
 * the product is written in, and English when it names none or says nothing.
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
    // A weight of zero says "not this one", and one that is no weight says nothing.
    .filter(({ language, weight }) => isLocale(language) && weight > 0 && weight <= 1)
    .sort((a, b) => b.weight - a.weight || a.index - b.index);
  const best = wanted[0]?.language;
  return best !== undefined && isLocale(best) ? best : "en";
}

/**
 * The mail that asks an account to check its address: plain, in one language, with the link and
 * nothing that is loaded from elsewhere. `link` is the instance's own, made by the API.
 */
export function verificationMail(to: string, link: string, locale: Locale): Mail {
  return linkMail(to, link, locale, WORDS[locale]);
}

/**
 * A mail with one link: what it is about, the link as a button and as text, and what follows.
 * The mails of an account's own address are written so.
 */
export function linkMail(
  to: string,
  link: string,
  locale: Locale,
  words: { subject: string; intro: string; button: string; after: string },
): Mail {
  const text = `${words.intro}\n\n${link}\n\n${words.after}\n`;
  const html = mailPage({
    locale,
    content: [
      heading(words.subject),
      paragraph(words.intro),
      button(words.button, link),
      linkAsText(link),
      note(words.after),
    ],
  });
  return { to, subject: words.subject, text, html };
}
