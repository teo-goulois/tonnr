// What came of a call, as the API counts it. The order is the one the charts stack them in.
export const OUTCOMES = ["answered", "invalid", "refused", "limited", "failed"] as const;
export type Outcome = (typeof OUTCOMES)[number];
export type Counts = Record<Outcome, number>;
export type UsagePoint = Counts & { at: Date };

export const NO_CALLS: Counts = { answered: 0, invalid: 0, refused: 0, limited: 0, failed: 0 };

const HOUR_MS = 60 * 60 * 1000;
// The counts are kept thirteen months.
const MOST_DAYS = 400;

/** How far back a screen looks, and whether it adds the calls up by the hour or by the day. */
export const RANGES = {
  day: { hours: 24, step: "hour" },
  week: { hours: 7 * 24, step: "hour" },
  month: { days: 30, step: "day" },
  year: { days: 365, step: "day" },
} as const;
export type RangeName = keyof typeof RANGES;
export type Step = "hour" | "day";
export type Range = { from: Date; to: Date; step: Step };

// The start of a day of the reader's calendar. It is built from the date, not from the day
// before: where the clock is moved at midnight, a day does not start at the hour the last did.
function dayStart(year: number, month: number, day: number) {
  return new Date(year, month, day);
}

/**
 * The range that ends with the hour or the day under way. A day is the reader's: it starts at
 * their midnight, so a range by the day starts and ends there.
 */
export function rangeOf(name: RangeName, now: Date): Range {
  const range = RANGES[name];

  if (range.step === "hour") {
    // The counts are kept by UTC's hour, which is not the reader's where the clock is half an
    // hour from UTC: the hours drawn start where the counts do.
    const to = new Date(now);
    to.setUTCMinutes(0, 0, 0);
    to.setTime(to.getTime() + HOUR_MS);
    return { from: new Date(to.getTime() - range.hours * HOUR_MS), to, step: "hour" };
  }
  const [year, month, day] = [now.getFullYear(), now.getMonth(), now.getDate()];
  return {
    from: dayStart(year, month, day + 1 - range.days),
    to: dayStart(year, month, day + 1),
    step: "day",
  };
}

// A day of the reader's calendar, as a word to find it by.
function dayOf(moment: Date) {
  return `${moment.getFullYear()}-${moment.getMonth()}-${moment.getDate()}`;
}

/** Every hour or day of a range, with no call where the API counted none. */
export function fillSeries(points: UsagePoint[], range: Range): UsagePoint[] {
  const filled: UsagePoint[] = [];

  if (range.step === "hour") {
    const counted = new Map(points.map((point) => [point.at.getTime(), point]));
    for (let time = range.from.getTime(); time < range.to.getTime(); time += HOUR_MS) {
      filled.push(counted.get(time) ?? { at: new Date(time), ...NO_CALLS });
    }
    return filled;
  }
  // A day is found by its date, not by the moment it starts at: where the clock goes back at
  // midnight, midnight comes twice, and the API and the browser do not choose the same one.
  const counted = new Map(points.map((point) => [dayOf(point.at), point]));
  // A day is not always 24 hours long: the calendar says when each one starts.
  const [year, month, first] = [
    range.from.getFullYear(),
    range.from.getMonth(),
    range.from.getDate(),
  ];
  // Never more days than the counts are kept: a span that is no span must not draw for ever.
  for (let day = first; filled.length < MOST_DAYS; day += 1) {
    const start = dayStart(year, month, day);
    if (!(start < range.to)) break;
    // The day is drawn where the calendar starts it, with what the API counted for it.
    filled.push({ ...NO_CALLS, ...counted.get(dayOf(start)), at: start });
  }
  return filled;
}

/** The calls of every outcome together. */
export function totalOf(counts: Counts) {
  return OUTCOMES.reduce((sum, outcome) => sum + counts[outcome], 0);
}

/** The counts of several rows, added up outcome by outcome. */
export function sumOf(rows: Counts[]): Counts {
  const sum = { ...NO_CALLS };
  for (const row of rows) for (const outcome of OUTCOMES) sum[outcome] += row[outcome];
  return sum;
}

export const RANGE_NAMES = Object.keys(RANGES) as RangeName[];

export function isRangeName(value: unknown): value is RangeName {
  // One of the four names, and nothing an object has without being given it.
  return typeof value === "string" && Object.hasOwn(RANGES, value);
}

/**
 * The span of time an address asks for, and the day for an address that asks for none it
 * knows. A screen reads its span through this: the router also hands down what an address
 * holds that no route has checked.
 */
export function rangeNameOf(value: unknown): RangeName {
  return isRangeName(value) ? value : "day";
}
