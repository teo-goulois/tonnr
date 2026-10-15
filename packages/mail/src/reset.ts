import { APP_NAME } from "@repo/config/app";
import type { Locale } from "@repo/config/locales";

import type { Mail } from "./index";
import { linkMail } from "./verification";

// The mail that lets an account choose a new password: decision 026.

const WORDS = {
  en: {
    subject: `Choose a new password for ${APP_NAME}`,
    intro: `Someone asked to choose a new password for the ${APP_NAME} account of this address. If it was you, follow this link:`,
    button: "Choose a new password",
    after:
      "The link works once, for an hour. Choosing a new password signs the account out everywhere. If you did not ask, ignore this mail: your password stays as it is.",
  },
  fr: {
    subject: `Choisis un nouveau mot de passe pour ${APP_NAME}`,
    intro: `Quelqu’un a demandé à choisir un nouveau mot de passe pour le compte ${APP_NAME} de cette adresse. Si c’est toi, suis ce lien :`,
    button: "Choisir un nouveau mot de passe",
    after:
      "Le lien ne marche qu’une fois, pendant une heure. Choisir un nouveau mot de passe déconnecte le compte partout. Si tu n’as rien demandé, ignore ce message : ton mot de passe reste le même.",
  },
  es: {
    subject: `Elige una nueva contraseña para ${APP_NAME}`,
    intro: `Alguien ha pedido elegir una nueva contraseña para la cuenta de ${APP_NAME} de esta dirección. Si has sido tú, sigue este enlace:`,
    button: "Elegir una nueva contraseña",
    after:
      "El enlace funciona una sola vez, durante una hora. Elegir una nueva contraseña cierra la sesión de la cuenta en todas partes. Si no lo has pedido, ignora este correo: tu contraseña sigue igual.",
  },
  pt: {
    subject: `Escolhe uma nova palavra-passe para o ${APP_NAME}`,
    intro: `Alguém pediu para escolher uma nova palavra-passe para a conta do ${APP_NAME} deste endereço. Se foste tu, segue esta ligação:`,
    button: "Escolher uma nova palavra-passe",
    after:
      "A ligação funciona uma só vez, durante uma hora. Escolher uma nova palavra-passe termina a sessão da conta em todo o lado. Se não pediste nada, ignora este email: a tua palavra-passe fica igual.",
  },
} satisfies Record<Locale, Record<string, string>>;

/**
 * The mail that lets an account choose a new password: plain, in one language, with the link and
 * nothing that is loaded from elsewhere. `link` is the instance's own, made by the API.
 */
export function resetMail(to: string, link: string, locale: Locale): Mail {
  return linkMail(to, link, locale, WORDS[locale]);
}
