import { type AlertLine, type AlertSaid, alertWords } from "./alert-words";
import { footerLine, heading, mailPage, note, panel } from "./design";
import type { Mail } from "./index";

// The mail an alert sends: decision 031, "What is sent, and how". No image, nothing loaded from
// elsewhere, no link that counts who followed it.

// What an alert has to say, and the words it is said in, are a push's as much as a mail's.
export { type AlertMoment, type AlertUnits as MailUnits, STARTING_UNITS } from "./alert-words";

/** What an alert mail says, as the notification it is of said it. */
export type AlertMailContent = Omit<AlertSaid, "lines"> & {
  to: string;
  // Off, the subject says that an alert has news and names nothing.
  namesInSubject: boolean;
  // Each spot with its page in the web app.
  lines: (AlertLine & { spotUrl: string })[];
  // Who the forecast is credited to.
  forecastCredit: string;
  // The page of the web app where the account sets its alerts.
  settingsUrl: string;
  // The page with the one button that switches alert mails off, and the address a mail program
  // posts to for the same.
  offUrl: string;
  offPostUrl: string;
};

/**
 * The mail of an alert's notification, in the account's language and time zone, with the two
 * headers that let a mail program switch alert mails off in one press.
 */
export function alertMail(content: AlertMailContent): Mail {
  const { locale, moment } = content;
  const { words, colon, headline, blocks: said } = alertWords(content);
  const subject = content.namesInSubject || moment === "evening" ? headline : words.generic;

  // Each spot: its name, its hours, what the forecast or a station says, and its page.
  const blocks = said.map((block, index) => {
    const rows = [...block.hours];
    if (block.forecast) {
      rows.push(`${block.forecast}${block.fetched ? ` (${block.fetched})` : ""}`);
    } else if (block.fetched) {
      rows.push(block.fetched.replace(/^./, (first) => first.toUpperCase()));
    }
    if (block.station) rows.push(block.station);
    return { title: block.title, rows, url: content.lines[index]?.spotUrl ?? "" };
  });
  // Who the forecast and the readings are credited to.
  const credits = [`${words.forecast}${colon} ${content.forecastCredit} ${words.rounded}`];
  const measured = [
    ...new Set(
      content.lines.flatMap((line) =>
        line.station?.significantHeightMeters != null && line.station.attribution
          ? [line.station.attribution]
          : [],
      ),
    ),
  ];
  if (measured.length > 0) credits.push(`${words.readings}${colon} ${measured.join(" ; ")}`);

  const text = [
    headline,
    "",
    ...blocks.flatMap((block) => [
      block.title,
      ...block.rows.map((row) => `  ${row}`),
      `  ${words.open}${colon} ${block.url}`,
      "",
    ]),
    ...credits,
    `${words.settings}${colon} ${content.settingsUrl}`,
    `${words.off}${colon} ${content.offUrl}`,
    "",
  ].join("\n");
  const html = mailPage({
    locale,
    content: [
      heading(headline),
      ...blocks.map((block) =>
        panel({
          title: block.title,
          rows: block.rows,
          link: { label: words.open, href: block.url },
        }),
      ),
      ...credits.map(note),
    ],
    footer: [
      footerLine([
        { label: words.settings, href: content.settingsUrl },
        { label: words.off, href: content.offUrl },
      ]),
    ],
  });

  return {
    to: content.to,
    subject,
    text,
    html,
    headers: [
      { name: "List-Unsubscribe", value: `<${content.offPostUrl}>` },
      { name: "List-Unsubscribe-Post", value: "List-Unsubscribe=One-Click" },
    ],
  };
}
