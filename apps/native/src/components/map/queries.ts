import { orpc } from "@/utils/orpc";

// What the map asks the API, as the web's route asks it, written once so that the map, the
// search and the new spot read one answer from the cache.

export const MINUTE_MS = 60 * 1000;
/** As many wind stations as the API gives in one answer, one for each place (decision 048). */
export const WIND_LIMIT = 500;
/** The distance under which the API keeps one wind station for each place. */
export const WIND_APART_KM = 2;
export const BREAK_LIMIT = 1000;
/** How many spots an account holds, as the API says when it refuses one more. */
export const SPOTS_MOST = 100;

/** Every buoy: they are few, and the map draws them all. */
export const wavesQuery = () =>
  orpc.v1.stations.list.queryOptions({
    input: { measures: "waves", limit: 500 },
    refetchInterval: 10 * MINUTE_MS,
    select: (answer) => answer.stations,
  });

/** The account's own spots. */
export const spotsQuery = (signedIn: boolean) =>
  orpc.v1.spots.list.queryOptions({
    enabled: signedIn,
    select: (answer) => answer.spots,
  });
