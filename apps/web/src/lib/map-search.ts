import { z } from "zod";

/**
 * What the map of `/app` reads after its `?`. The apps for phones read the same parameters from
 * a link, through `readAppLink` in `@repo/config/links`, and a test fails when one reads a
 * parameter the other does not: decision 073.
 */
export const mapSearch = z.object({
  // The station, the surf break or the spot whose panel is open. One is selected, never two.
  station: z.string().optional(),
  break: z.string().optional(),
  spot: z.string().optional(),
  // "add" is the panel that adds a spot. The others are the tabs of a phone's bar.
  panel: z.enum(["saved", "alerts", "account", "add"]).optional(),
  // The part of the alerts panel in view: what was told when left out. "settings" is where
  // how to be told was before it was a part of the account's panel: a mail that was sent
  // then still leads there, and is taken to it.
  alerts: z.enum(["mine", "settings"]).optional(),
  // The part of the account's panel in view: its first screen when left out. "delete" is the
  // step that deletes the account, the address Google Play's form names: decision 071.
  settings: z
    .enum(["alerts", "contributions", "delete", "friends", "profile", "sessions"])
    .optional(),
  // What the link someone gave the reader ends with: whose it is and what it makes are said
  // over the map. Decision 041.
  invite: z.string().max(64).optional(),
  // The tab a break's panel opens on: its forecast when left out. "reports" is what a notice
  // of reports opens, with the notice it read: decision 068.
  tab: z.enum(["guide", "reports"]).optional(),
  notice: z.string().max(64).optional(),
  // What the page of a break asks the map to begin: an alert at the break, on a spot of the
  // account's own there, made first when it has none. Decision 059.
  create: z.enum(["alert"]).optional(),
  // The buoy opened from a surf break, over the break's panel.
  buoy: z.string().optional(),
  // The list the map shows alone: one of the account's or one it kept, by its id, or one that
  // is opened by its link, by what the link ends with. Decision 035.
  list: z.string().optional(),
  shared: z.string().optional(),
});
