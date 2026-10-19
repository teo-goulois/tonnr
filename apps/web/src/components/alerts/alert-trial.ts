import { formatClock, formatDay, formatDayAndClock } from "@/lib/format";
import { m } from "@/paraglide/messages.js";

// How the editor judges conditions over the preview lives in packages/client, which the app for
// phones reads too. Here are the words this app writes of it.
export * from "@repo/client/alerts/trial";

type Stretch = { start: Date; end: Date };

/** A stretch of hours in words, in a time zone: "Mon 08:00 to 12:00". */
export function stretchWords(piece: Stretch, zone: string | undefined) {
  // The day of its last minute: hours that end at midnight end that evening.
  const endsLater =
    formatDay(piece.start, zone) !== formatDay(new Date(piece.end.getTime() - 60_000), zone);
  return m.alerts_window({
    start: formatDayAndClock(piece.start, zone),
    end: endsLater ? formatDayAndClock(piece.end, zone) : formatClock(piece.end, zone),
  });
}
