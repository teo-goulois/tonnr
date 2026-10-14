// One wind station for each place, for a map that would otherwise draw several on top of each
// other where networks meet, and stations spread over a wide view with the sea's first:
// decision 048. Functions that read no clock and no database.

/** Two stations closer than this stand at one place. */
export const APART_KM = 2;
// A wind measured longer ago than this is not the wind now, as the web app reads it too.
export const LIVE_WIND_MS = 2 * 60 * 60 * 1000;
/** A station at sea, or on land within this of the shore, is one of the sea's. */
export const BY_THE_SEA_KM = 10;

// How often each network measures, in minutes. A network not named here is taken to measure
// every hour, as the buoys do.
const MINUTES_BETWEEN: Readonly<Record<string, number>> = {
  coops: 6,
  meteofrance: 6,
  dmi: 10,
  jma: 10,
  openwindmap: 10,
  rijkswaterstaat: 10,
};
const HOURLY = 60;
// The networks of people who set a beacon up themselves. An official station stands before them.
const COMMUNITY: ReadonlySet<string> = new Set(["openwindmap"]);

export type WindPlace = {
  id: string;
  provider: string;
  latitude: number;
  longitude: number;
  // When the station last measured the wind, and whether it gave a gust then.
  measuredAt: Date | null;
  gust: boolean;
  // How far it stands from the shore: positive on land, negative at sea, null when not known.
  shoreKm: number | null;
};

const EARTH_KM = 6371;
const KM_PER_DEGREE = (Math.PI * EARTH_KM) / 180;

function distanceKm(one: WindPlace, other: WindPlace) {
  const radians = (degrees: number) => (degrees * Math.PI) / 180;
  const a =
    Math.sin(radians(other.latitude - one.latitude) / 2) ** 2 +
    Math.cos(radians(one.latitude)) *
      Math.cos(radians(other.latitude)) *
      Math.sin(radians(other.longitude - one.longitude) / 2) ** 2;
  return 2 * EARTH_KM * Math.asin(Math.sqrt(Math.min(1, a)));
}

/** Whether a station is at sea, or near enough the shore to say what the sea's wind does. */
export function isByTheSea(station: WindPlace) {
  return station.shoreKm !== null && station.shoreKm <= BY_THE_SEA_KM;
}

/**
 * Orders two stations by which speaks better for a place: one that measured lately, then, when
 * `sea` is asked for, one by the sea, then one that gives the gusts, then one that measures more
 * often, then an official one, then the id. A station whose shore is not known gets no
 * preference.
 */
export function better(one: WindPlace, other: WindPlace, now: Date, sea = false) {
  const live = (station: WindPlace) =>
    station.measuredAt !== null && now.getTime() - station.measuredAt.getTime() <= LIVE_WIND_MS;
  const minutes = (station: WindPlace) => MINUTES_BETWEEN[station.provider] ?? HOURLY;
  const official = (station: WindPlace) => !COMMUNITY.has(station.provider);

  return (
    Number(live(other)) - Number(live(one)) ||
    (sea ? Number(isByTheSea(other)) - Number(isByTheSea(one)) : 0) ||
    Number(other.gust) - Number(one.gust) ||
    minutes(one) - minutes(other) ||
    Number(official(other)) - Number(official(one)) ||
    (one.id < other.id ? -1 : one.id > other.id ? 1 : 0)
  );
}

/**
 * Keeps, of stations already in the order of `better`, each one that stands `apartKm` or more
 * from every station kept before it. Every station left out then has a better one within that
 * distance.
 */
function keepApart<Station extends WindPlace>(ordered: readonly Station[], apartKm: number) {
  // Cells as tall as the distance. A station near one kept is in the row of its cell or the
  // rows on either side, and as many columns away as that distance covers at the most poleward
  // latitude of those rows. Columns go round the earth.
  const cellDegrees = Math.min(apartKm / KM_PER_DEGREE, 180);
  // Columns all of one width, so that the last one meets the first across the antimeridian.
  const columns = Math.ceil(360 / cellDegrees);
  const columnDegrees = 360 / columns;
  const cells = new Map<string, Station[]>();
  const kept: Station[] = [];

  for (const station of ordered) {
    const row = Math.floor(station.latitude / cellDegrees);
    const column = Math.min(
      Math.floor(((((station.longitude + 180) % 360) + 360) % 360) / columnDegrees),
      columns - 1,
    );
    const poleward = Math.min(Math.abs(station.latitude) + 2 * cellDegrees, 90);
    const cos = Math.cos((poleward * Math.PI) / 180);
    const reach = cos <= 0 ? columns : Math.ceil(apartKm / (KM_PER_DEGREE * cos) / columnDegrees);
    // Near a pole the reach can go round the earth: every column is looked at once.
    const steps =
      2 * reach + 1 >= columns
        ? Array.from({ length: columns }, (_, index) => index - column)
        : Array.from({ length: 2 * reach + 1 }, (_, index) => index - reach);

    let near = false;
    for (let rowStep = -1; rowStep <= 1 && !near; rowStep += 1) {
      for (const step of steps) {
        const there = cells.get(
          `${row + rowStep} ${(((column + step) % columns) + columns) % columns}`,
        );
        if (there?.some((other) => distanceKm(station, other) < apartKm)) {
          near = true;
          break;
        }
      }
    }
    if (near) continue;

    kept.push(station);
    const key = `${row} ${column}`;
    const listed = cells.get(key);
    if (listed) listed.push(station);
    else cells.set(key, [station]);
  }
  return kept;
}

/**
 * The stations to draw, one for each place: of the stations within `APART_KM` of each other,
 * the better one, and the others where it stands alone. When the one kept stops measuring, its
 * neighbour takes its place at the next answer. The order is that of `better`.
 */
export function oneByPlace<Station extends WindPlace>(stations: readonly Station[], now: Date) {
  return keepApart(
    [...stations].sort((one, other) => better(one, other, now)),
    APART_KM,
  );
}

/**
 * At most `most` stations, spread over the whole box: one for each place within `APART_KM`, and
 * when that leaves too many, one within twice the distance, and so on, each time from every
 * station of the box. A map that shows a country then draws the better station of each area all
 * over it, rather than the first ones of a list. Once the stations are kept further apart than
 * `APART_KM`, `sea` puts the stations by the sea before the others, after the ones that measured
 * lately: an area inland keeps its own station when no station by the sea stands within the
 * distance. Gives the distance it kept them apart by.
 */
export function spreadOut<Station extends WindPlace>(
  stations: readonly Station[],
  now: Date,
  most: number,
  { sea = false }: { sea?: boolean } = {},
) {
  let apartKm = APART_KM;
  let kept = oneByPlace(stations, now);
  if (kept.length <= most) return { stations: kept, apartKm };

  const ordered = [...stations].sort((one, other) => better(one, other, now, sea));
  while (kept.length > most) {
    apartKm *= 2;
    kept = keepApart(ordered, apartKm);
  }
  return { stations: kept, apartKm };
}
