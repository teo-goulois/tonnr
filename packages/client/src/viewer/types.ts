import type { AppRouterClient } from "@repo/api/routers/index";

type V1 = AppRouterClient["v1"];
type Answer<Procedure extends (...input: never[]) => unknown> = Awaited<ReturnType<Procedure>>;

export type Station = Answer<V1["stations"]["list"]>["stations"][number];
export type Reading = NonNullable<Station["latestReading"]>;
export type StationReadings = Answer<V1["stations"]["readings"]>;
export type Forecast = Answer<V1["forecasts"]["get"]>;
export type TideTimeline = Answer<V1["tides"]["timeline"]>;
export type TideExtremes = Answer<V1["tides"]["extremes"]>;
export type SurfBreak = Answer<V1["breaks"]["get"]>;
// How big a break's waves run against the forecast, from the sessions surfed there: decision 062.
export type SizeFactor = Answer<V1["breaks"]["sizeFactor"]>;
export type SavedList = Answer<V1["lists"]["list"]>["lists"][number];
/** What a list holds: a station, a surf break or a spot of the user's own, each named by its id. */
export type SavedItem = { stationId: string } | { breakId: string } | { spotId: string };
/** What a list shows of a surf break it holds. */
export type SavedBreak = Pick<SurfBreak, "id" | "name" | "latitude" | "longitude">;
/** A list of someone else's that the account opened by its link and kept. */
export type JoinedList = Answer<V1["lists"]["list"]>["joined"][number];
/** One list alone, with its spots: its owner's, one that was kept, or one opened by its link. */
export type ListView = Answer<V1["lists"]["view"]>;
export type AlertNotification = Answer<V1["notifications"]["list"]>["notifications"][number];
/** What an account was told of the reports at a break it keeps: decision 068. */
export type ReportNotice = Answer<V1["reportNotices"]["list"]>["notices"][number];
/** A spot of the user's own: a place they named. */
export type Spot = Answer<V1["spots"]["list"]>["spots"][number];
/** An alert of the user's: the conditions that make one or several of their spots work. */
export type Alert = Answer<V1["alerts"]["list"]>["alerts"][number];
export type AlertCriteria = Alert["criteria"];
/** How the user wants to be told, for all their alerts. */
export type AlertSettings = Answer<V1["alerts"]["getSettings"]>;
/** What conditions give at spots, before they are saved. */
export type AlertPreview = Answer<V1["alerts"]["preview"]>;

/** The guide of a surf break: what is written of it, line by line. Decision 041. */
export type Guide = Answer<V1["guides"]["get"]>;
export type GuideLine = Guide["lines"][number];
/** What the signed-in account wrote of a break, and what it may do there. */
export type GuideOwn = Answer<V1["guides"]["mine"]>;
/** What the signed-in account wrote in the guides, and where it stands. */
export type Standing = Answer<V1["contributions"]["mine"]>;
/** An assistant an account signed in to read it through the MCP server. Decision 047. */
export type ConnectedAgent = Answer<V1["agents"]["list"]>["agents"][number];
/** The assistants of an account, and what takes back what it allowed one. */
export type ConnectedAgents = {
  // Undefined while the API has not said, and for a visitor.
  list: ConnectedAgent[] | undefined;
  // The assistant that is being disconnected, while it is.
  disconnecting: string | undefined;
  onDisconnect: (clientId: string) => void;
};
export type Contribution = Standing["contributions"][number];
export type Rank = NonNullable<Standing["rank"]>;

/** A friend of the signed-in account: what it reads of it. */
export type Friend = Answer<V1["friends"]["list"]>["friends"][number];
/** A friend, with what they wrote in the guides and that was confirmed. */
export type FriendDetail = Answer<V1["friends"]["get"]>;
/** Whose link an invitation is. */
export type Inviter = Answer<V1["friends"]["open"]>;

/** A session of the account's log, as a list gives it: with its figures. Decision 043. */
export type Session = Answer<V1["sessions"]["list"]>["sessions"][number];
/** One session, with the conditions kept with it. */
export type SessionDetail = Answer<V1["sessions"]["get"]>;
/** What the account's log comes to. */
export type SessionRecap = Answer<V1["sessions"]["recap"]>;
/** A photo or a video of a session, with addresses that read its files. Decision 066. */
export type MediaItem = Answer<V1["media"]["sessions"]>["sessions"][string][number];
/** Whether the instance takes photos and videos, and how much the account keeps. */
export type MediaStatus = Answer<V1["media"]["status"]>;

/** What the account said of itself as a surfer. Decision 063. */
export type SurferProfile = NonNullable<Answer<V1["profile"]["get"]>>;
/** The answers the account gives, all at once. */
export type ProfileAnswers = Pick<
  SurferProfile,
  "level" | "smallestWave" | "biggestWave" | "reading" | "boards"
>;
/** The account's profile as a surfer, and what the screens do with it. */
export type Profiling = {
  // Null for an account that was never asked, and undefined while the API has not said or for
  // a visitor.
  profile: SurferProfile | null | undefined;
  // Whether the questions are put to the account now: it was never asked, and nothing else
  // stands over the map.
  isAsking: boolean;
  isSaving: boolean;
  // Keeps the answers, and says whether they were kept.
  onSave: (answers: ProfileAnswers) => Promise<boolean>;
  // The account leaves the questions without answering: it is not asked them again.
  onPutOff: () => void;
};

/** What a screen knows of something the route is loading for it. */
export type Loadable<Data> = {
  data: Data | undefined;
  isPending: boolean;
  isError: boolean;
  // True when the answer could not be had. An error without it can also be the API saying that
  // there is nothing to give, as for the forecast of a point on land.
  isUnavailable?: boolean;
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
