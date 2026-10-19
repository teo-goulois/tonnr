import { formatting } from "@repo/client/format";

import { m } from "@/paraglide/messages";
import { getLocale } from "@/paraglide/runtime";

// How a figure, a bearing, a moment and a length of time are written lives in packages/client,
// which the web app reads too. The language is read each time, through the runtime: the app sets
// it as it starts and when it is chosen again (src/lib/i18n.ts).
export { type Freshness, STALE_MS, freshnessOf, toKnots } from "@repo/client/format";

export const {
  formatNumber,
  formatSeconds,
  compassPoint,
  compassName,
  formatClock,
  formatDayAndClock,
  formatDay,
  formatDate,
  formatMonth,
  formatDuration,
  formatAgo,
} = formatting({
  locale: () => getLocale(),
  m: {
    unit_seconds: m.unit_seconds,
    unit_minutes: m.unit_minutes,
    unit_hours: m.unit_hours,
    unit_hours_minutes: m.unit_hours_minutes,
    compass_points: m.compass_points,
    compass_names: m.compass_names,
  },
});
