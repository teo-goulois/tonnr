import type { AppRouterClient } from "@repo/api/routers/index";

type V1 = AppRouterClient["v1"];
type Answer<Procedure extends (...input: never[]) => unknown> = Awaited<ReturnType<Procedure>>;

export type Station = Answer<V1["stations"]["list"]>["stations"][number];
export type Reading = NonNullable<Station["latestReading"]>;
export type StationReadings = Answer<V1["stations"]["readings"]>;
export type Forecast = Answer<V1["forecasts"]["get"]>;
export type TideTimeline = Answer<V1["tides"]["timeline"]>;
export type TideExtremes = Answer<V1["tides"]["extremes"]>;
/** The day a tide chart shows, and how to show another. */
export type TideDay = {
  start: Date;
  isToday: boolean;
  onStep: (days: number) => void;
  onToday: () => void;
};
export type SurfBreak = Answer<V1["breaks"]["get"]>;
export type SavedList = Answer<V1["lists"]["list"]>["lists"][number];
export type AlertNotification = Answer<V1["notifications"]["list"]>["notifications"][number];

/** What a screen knows of something the route is loading for it. */
export type Loadable<Data> = {
  data: Data | undefined;
  isPending: boolean;
  isError: boolean;
};

/** The wave period a buoy gives: the peak one when it has it, then the significant, then the mean. */
export function periodOf(reading: Reading | null | undefined) {
  return (
    reading?.peakPeriodSeconds ??
    reading?.significantPeriodSeconds ??
    reading?.meanPeriodSeconds ??
    null
  );
}
