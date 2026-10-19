// What a browser counts of the reports it saw and of those whose photos it opened: decision 068.
// A report is counted once a browser: the browser keeps, a week, which reports it counted, and
// tells the API, which keeps a number and nothing of who. A report is seen once its card has been
// in view a second.

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
// What the browser keeps them under.
export const COUNTS_KEY = "report-counts";
// How long the views of a page wait to be told together, and how many go at once.
const GATHER_MS = 1500;
const AT_ONCE = 20;

type Kept = { seen: Record<string, number>; opened: Record<string, number> };

/** Where the browser keeps what it counted: its own storage, which may refuse. */
export type CountStore = { get: () => string | null; set: (value: string) => void };
/** What tells the API. */
export type CountSender = {
  seen: (ids: string[]) => Promise<unknown>;
  opened: (id: string) => Promise<unknown>;
};

/** Counts the reports a browser saw and opened, each once, from what `store` keeps. */
export function createReportCounter(
  store: CountStore,
  send: CountSender,
  clock: { now: () => number; later: (run: () => void, ms: number) => void } = {
    now: Date.now,
    later: (run, ms) => void setTimeout(run, ms),
  },
) {
  const read = (): Kept => {
    try {
      const raw = store.get();
      const parsed = raw ? (JSON.parse(raw) as Partial<Kept>) : {};
      const since = clock.now() - WEEK_MS;
      // A report is shown a week: what is older is forgotten.
      const recent = (counted: Record<string, number> | undefined) =>
        Object.fromEntries(
          Object.entries(counted ?? {}).filter(([, at]) => typeof at === "number" && at > since),
        );
      return { seen: recent(parsed.seen), opened: recent(parsed.opened) };
    } catch {
      return { seen: {}, opened: {} };
    }
  };
  const write = (kept: Kept) => {
    try {
      store.set(JSON.stringify(kept));
    } catch {
      // A browser that keeps nothing counts again on its next visit.
    }
  };

  let waiting: string[] = [];
  let isGathering = false;
  const flush = () => {
    isGathering = false;
    const ids = waiting.slice(0, AT_ONCE);
    waiting = waiting.slice(AT_ONCE);
    if (ids.length > 0) {
      // Kept as counted before it is told: one the API did not hear of is not counted, rather
      // than counted twice.
      const kept = read();
      for (const id of ids) kept.seen[id] = clock.now();
      write(kept);
      void send.seen(ids).catch(() => undefined);
    }
    if (waiting.length > 0) gather();
  };
  const gather = () => {
    if (isGathering) return;
    isGathering = true;
    clock.later(flush, GATHER_MS);
  };

  return {
    seen(id: string) {
      if (read().seen[id] || waiting.includes(id)) return;
      waiting.push(id);
      gather();
    },
    opened(id: string) {
      const kept = read();
      if (kept.opened[id]) return;
      kept.opened[id] = clock.now();
      write(kept);
      void send.opened(id).catch(() => undefined);
    },
  };
}
