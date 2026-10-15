import { createHash } from "node:crypto";

import { type AlertLine, type AlertSaid, alertWords } from "@repo/mail/alert-words";

import type { Push } from "./index";

// The push an alert sends: decision 031, "Push". It says what the alert's mail says, in the
// same words, and differs by its size: a title, a line or two, the page to open, and a tag.

/** What an alert push says: what the alert has to say, and where its spots are. */
export type AlertPushContent = Omit<AlertSaid, "lines"> & {
  // The alert it is of. Null for the evening before, which lists every alert.
  alertId: string | null;
  lines: (AlertLine & {
    spotId: string;
    // What names the windows it speaks of at the spot, from one push to the next: a window
    // keeps its name when it moves, so that what is said of it is shown in one place.
    windows: string[];
  })[];
  // The web app's address, with the part that names the language: where its pages are.
  page: string;
};

// The spots a push gives the hours of. It says how many more there are.
const SPOTS = 2;
// How long a title and a line may be, in characters. A screen shows less of them, and a push
// holds no more than `PUSH_BYTES`: three lines of these and a title are well under it, whatever
// the alert and its spots are called.
const TITLE_CHARACTERS = 80;
const LINE_CHARACTERS = 120;
// A name is cut shorter than the line it is in, so that the moment and the hours follow it.
const TITLE_NAME_CHARACTERS = 40;
const NAME_CHARACTERS = 32;

const MORE = {
  en: (count: number) => `and ${count} more`,
  fr: (count: number) => (count === 1 ? "et 1 autre" : `et ${count} autres`),
  es: (count: number) => (count === 1 ? "y 1 más" : `y ${count} más`),
  pt: (count: number) => (count === 1 ? "e mais 1" : `e mais ${count}`),
};

const letters = new Intl.Segmenter(undefined, { granularity: "grapheme" });

/**
 * A text as one line of at most so many characters: what would break the line becomes a space,
 * and a text that is longer ends with "…". A letter with its accents, or a sign made of
 * several, is kept whole or left out.
 */
function line(text: string, characters: number) {
  const flat = text.replace(/[\s\p{Cc}]+/gu, " ").trim();
  if ([...flat].length <= characters) return flat;
  let kept = "";
  let count = 0;
  for (const { segment } of letters.segment(flat)) {
    count += [...segment].length;
    if (count > characters - 1) break;
    kept += segment;
  }
  return `${kept.trimEnd()}…`;
}

/**
 * What a notification is shown under, so that a newer word on the same windows takes the older
 * one's place and no other's: the alert, its spots in the order they are shown, and the names
 * of the windows it speaks of at each. A window that moved, or went, is told under the name it
 * was first told with, and "it is on" under the name of the window that begins. A push of other
 * spots or of other windows of the alert stands beside it. An evening is told under its day.
 */
function tagOf(content: AlertPushContent) {
  const thing =
    content.moment === "evening"
      ? ["evening", content.day]
      : [content.alertId, content.lines.map((one) => [one.spotId, one.windows.toSorted()])];
  return createHash("sha256").update(JSON.stringify(thing)).digest("base64url").slice(0, 22);
}

/**
 * The push of an alert's notification, in the account's language, time zone and units: the
 * moment as its title, then the hours of the first spots and how many more there are. A push
 * of one spot says what the mail says of the sea there, and opens that spot. A push of several
 * opens what the alerts told.
 */
export function alertPush(content: AlertPushContent): Push {
  const lines = content.lines.map((one) => ({
    ...one,
    spotName: line(one.spotName, NAME_CHARACTERS),
    ...(one.alertName ? { alertName: line(one.alertName, NAME_CHARACTERS) } : {}),
    ...(one.station
      ? { station: { ...one.station, name: line(one.station.name, NAME_CHARACTERS) } }
      : {}),
  }));
  const { colon, headline, blocks } = alertWords({
    ...content,
    alertName: content.alertName === null ? null : line(content.alertName, TITLE_NAME_CHARACTERS),
    lines,
  });
  // A spot has one row, whatever the alerts an evening lists it under: the first spots are
  // the first that are told, and those that are counted after them are other spots.
  const spots = [
    ...Map.groupBy(
      blocks.map((block, index) => ({ block, said: lines[index] })),
      (one) => one.said?.spotId,
    ).values(),
  ];
  const rows = spots.slice(0, SPOTS).map((listed) => {
    const [first] = listed;
    const row =
      listed.length === 1
        ? `${first?.block.title}${colon} ${first?.block.hours.join(" · ")}`
        : // Under several alerts: each alert's name before its hours.
          `${first?.said?.spotName}${colon} ${listed
            .map((one) => `(${one.said?.alertName ?? ""}) ${one.block.hours.join(" · ")}`)
            .join(" · ")}`;
    return line(row, LINE_CHARACTERS);
  });
  const [first] = blocks;
  if (first && spots.length === 1) {
    // What a station measured as the window began, or what the forecast gave for the hour:
    // for the first of its hours, when an evening lists the spot under several alerts.
    const sea = first.station ?? first.forecast;
    if (sea) rows.push(line(sea, LINE_CHARACTERS));
  }
  if (spots.length > SPOTS) rows.push(MORE[content.locale](spots.length - SPOTS));

  const [spotId] = lines.map((one) => one.spotId);
  return {
    title: line(headline, TITLE_CHARACTERS),
    body: rows.join("\n"),
    url:
      spotId !== undefined && spots.length === 1
        ? `${content.page}/app?spot=${encodeURIComponent(spotId)}`
        : `${content.page}/app?panel=alerts`,
    tag: tagOf(content),
  };
}
