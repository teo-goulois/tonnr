import { APP_NAME } from "@repo/config/app";
import type { Locale } from "@repo/config/locales";

import { footerLine, heading, mailPage, note, panel, paragraph } from "./design";
import type { Mail } from "./index";

// The mail that tells the instance's address what accounts flagged and contested since the last
// one, so that an operator reads it within the hour: decision 067. It names each report and each
// line of a guide with its reason, and of the account that flagged it no more than whether its
// flag counts among those that hide a report.

/** Why an account says a report should not be shown, as the API takes it. */
export type FlagReason = "not_here" | "not_now" | "not_sea" | "offensive" | "other";

/** Where a report stands now, as `surf_report` keeps it. */
export type FlaggedState = "checking" | "published" | "review" | "refused" | "hidden" | "removed";

/** A report that was flagged since the last mail, with each of those flags. */
export type FlaggedReport = {
  breakName: string;
  // Its author's few words, when it has some.
  note: string | null;
  state: FlaggedState;
  flags: { reason: FlagReason | null; counts: boolean }[];
};

/** A line of a guide that was contested since the last mail. */
export type ContestedLine = {
  // Null once the break has left the catalogue.
  breakName: string | null;
  // What the line says: its text, or its words.
  value: string;
  // Why it was contested, in the words of the account that did.
  reason: string;
};

export type ModerationMailContent = {
  to: string;
  locale: Locale;
  reports: FlaggedReport[];
  contests: ContestedLine[];
  // Whether more wait than the mail names: the admin holds them, and the next mail names them.
  more: boolean;
  // The admin's pages of the moderation, on an instance that has an admin app.
  links: { reports: string; guides: string } | null;
};

type Words = {
  subject: string;
  heading: string;
  intro: string;
  reports: string;
  contests: string;
  reasons: Record<FlagReason, string>;
  // A flag given with no reason, which an older version allowed.
  noReason: string;
  counts: string;
  doesNotCount: string;
  states: Record<FlaggedState, string>;
  contested: string;
  gone: string;
  open: string;
  more: string;
  footer: string;
};

const WORDS = {
  en: {
    subject: `To moderate on ${APP_NAME}`,
    heading: "What accounts flagged since the last mail",
    intro:
      "Each of these waits for you in the admin's moderation. This mail comes once an hour at most, and only when something is new.",
    reports: "Reports of the waves",
    contests: "Lines of the guides",
    reasons: {
      not_here: "Not this spot",
      not_now: "Not today's waves",
      not_sea: "Not the waves",
      offensive: "Offensive",
      other: "Something else",
    },
    noReason: "No reason given",
    counts: "counts toward hiding it",
    doesNotCount: "hides nothing: an account with no username, or under a day old",
    states: {
      checking: "Being checked.",
      published: "Still shown.",
      review: "Left to you by its checks.",
      refused: "Refused by its checks.",
      hidden: "Hidden until you decide.",
      removed: "Removed.",
    },
    contested: "Contested",
    gone: "A break that left the catalogue",
    open: "Open the moderation",
    more: "More wait in the admin than this mail names: the next mail names them.",
    footer: "This mail names no account that flagged or contested.",
  },
  fr: {
    subject: `À modérer sur ${APP_NAME}`,
    heading: "Ce que les comptes ont signalé depuis le dernier message",
    intro:
      "Chacun t’attend dans la modération de l’admin. Ce message part une fois par heure au plus, et seulement quand il y a du nouveau.",
    reports: "Reports des vagues",
    contests: "Lignes des guides",
    reasons: {
      not_here: "Pas ce spot",
      not_now: "Pas les vagues du jour",
      not_sea: "Pas les vagues",
      offensive: "Choquant",
      other: "Autre chose",
    },
    noReason: "Sans raison donnée",
    counts: "compte pour le masquer",
    doesNotCount: "ne masque rien : un compte sans pseudo, ou de moins d’un jour",
    states: {
      checking: "En cours de vérification.",
      published: "Toujours affiché.",
      review: "Laissé à ta décision par ses vérifications.",
      refused: "Refusé par ses vérifications.",
      hidden: "Masqué jusqu’à ta décision.",
      removed: "Retiré.",
    },
    contested: "Contesté",
    gone: "Un spot sorti du catalogue",
    open: "Ouvrir la modération",
    more: "D’autres attendent dans l’admin : le prochain message les nomme.",
    footer: "Ce message ne nomme aucun compte qui a signalé ou contesté.",
  },
  es: {
    subject: `Para moderar en ${APP_NAME}`,
    heading: "Lo que las cuentas han denunciado desde el último correo",
    intro:
      "Cada uno te espera en la moderación del admin. Este correo llega una vez por hora como mucho, y solo cuando hay algo nuevo.",
    reports: "Reportes de las olas",
    contests: "Líneas de las guías",
    reasons: {
      not_here: "No es este spot",
      not_now: "No son las olas de hoy",
      not_sea: "No son las olas",
      offensive: "Ofensivo",
      other: "Otra cosa",
    },
    noReason: "Sin motivo",
    counts: "cuenta para ocultarlo",
    doesNotCount: "no oculta nada: una cuenta sin nombre de usuario, o de menos de un día",
    states: {
      checking: "En comprobación.",
      published: "Sigue visible.",
      review: "Sus comprobaciones lo dejan en tus manos.",
      refused: "Rechazado por sus comprobaciones.",
      hidden: "Oculto hasta que decidas.",
      removed: "Retirado.",
    },
    contested: "Rebatido",
    gone: "Un spot que salió del catálogo",
    open: "Abrir la moderación",
    more: "Hay más esperando en el admin: el próximo correo los nombra.",
    footer: "Este correo no nombra ninguna cuenta que haya denunciado o rebatido.",
  },
  pt: {
    subject: `Para moderar no ${APP_NAME}`,
    heading: "O que as contas denunciaram desde o último email",
    intro:
      "Cada um espera por ti na moderação do admin. Este email chega uma vez por hora no máximo, e só quando há algo novo.",
    reports: "Reports das ondas",
    contests: "Linhas dos guias",
    reasons: {
      not_here: "Não é este spot",
      not_now: "Não são as ondas de hoje",
      not_sea: "Não são as ondas",
      offensive: "Ofensivo",
      other: "Outra coisa",
    },
    noReason: "Sem motivo",
    counts: "conta para o esconder",
    doesNotCount: "não esconde nada: uma conta sem nome de utilizador, ou com menos de um dia",
    states: {
      checking: "Em verificação.",
      published: "Continua visível.",
      review: "As verificações deixam-no à tua decisão.",
      refused: "Recusado pelas verificações.",
      hidden: "Escondido até decidires.",
      removed: "Retirado.",
    },
    contested: "Contestado",
    gone: "Um spot que saiu do catálogo",
    open: "Abrir a moderação",
    more: "Há mais à espera no admin: o próximo email nomeia-os.",
    footer: "Este email não nomeia nenhuma conta que tenha denunciado ou contestado.",
  },
} satisfies Record<Locale, Words>;

// How each language quotes what someone wrote, and writes a colon: French with a space before
// it, as the alerts' mails do, and between its guillemets.
const QUOTES = {
  en: ["“", "”"],
  fr: ["« ", " »"],
  es: ["«", "»"],
  pt: ["«", "»"],
} satisfies Record<Locale, [string, string]>;

// What a mail quotes of what someone wrote: one line, and not all of a long one.
const QUOTED_MOST = 200;

/** The mail of what accounts flagged and contested, in the language of the instance's operator. */
export function moderationMail(content: ModerationMailContent): Mail {
  const words: Words = WORDS[content.locale];
  const [opening, closing] = QUOTES[content.locale];
  const colon = content.locale === "fr" ? " :" : ":";
  const quoted = (text: string) => {
    const line = text.replace(/\s+/g, " ").trim();
    const short = line.length > QUOTED_MOST ? `${line.slice(0, QUOTED_MOST - 1)}…` : line;
    return `${opening}${short}${closing}`;
  };
  const reports = content.reports.map((report) => ({
    title: report.breakName,
    rows: [
      ...(report.note ? [quoted(report.note)] : []),
      ...report.flags.map(
        (flag) =>
          `${flag.reason ? words.reasons[flag.reason] : words.noReason} · ${flag.counts ? words.counts : words.doesNotCount}`,
      ),
      words.states[report.state],
    ],
  }));
  const contests = content.contests.map((contest) => ({
    title: contest.breakName ?? words.gone,
    rows: [quoted(contest.value), `${words.contested}${colon} ${quoted(contest.reason)}`],
  }));
  const parts = [
    { title: words.reports, items: reports, link: content.links?.reports },
    { title: words.contests, items: contests, link: content.links?.guides },
  ].filter((part) => part.items.length > 0);

  const text = [
    words.heading,
    "",
    words.intro,
    "",
    ...parts.flatMap((part) => [
      part.title,
      ...(part.link ? [`${words.open}${colon} ${part.link}`] : []),
      "",
      ...part.items.flatMap((item) => [item.title, ...item.rows.map((row) => `  ${row}`), ""]),
    ]),
    ...(content.more ? [words.more, ""] : []),
    words.footer,
    "",
  ].join("\n");
  const html = mailPage({
    locale: content.locale,
    content: [
      heading(words.heading),
      paragraph(words.intro),
      ...parts.flatMap((part) => [
        paragraph(part.title),
        ...part.items.map((item, index) =>
          panel({
            title: item.title,
            rows: item.rows,
            // The page of the moderation under the last of its part.
            ...(part.link && index === part.items.length - 1
              ? { link: { label: words.open, href: part.link } }
              : {}),
          }),
        ),
      ]),
      ...(content.more ? [note(words.more)] : []),
    ],
    footer: [footerLine([words.footer])],
  });
  return { to: content.to, subject: words.subject, text, html };
}
