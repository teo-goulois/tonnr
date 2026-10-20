import { COUNTS_KEY, createReportCounter } from "@repo/client/report-counts";

import { client } from "@/utils/orpc";

// What this phone counts of the reports it saw and of those whose photos it opened, each once,
// kept a week in the app's own storage and told to the API, which keeps a number and nothing of
// who: decision 068. The rules are the web's, in packages/client.

let counter: ReturnType<typeof createReportCounter> | null = null;

/** The counter of this phone, made once it is asked for. */
export function reportCounter() {
  counter ??= createReportCounter(
    {
      get: () => localStorage.getItem(COUNTS_KEY),
      set: (value) => localStorage.setItem(COUNTS_KEY, value),
    },
    {
      seen: (ids) => client.v1.reports.seen({ ids }),
      opened: (id) => client.v1.reports.opened({ id }),
    },
  );
  return counter;
}
