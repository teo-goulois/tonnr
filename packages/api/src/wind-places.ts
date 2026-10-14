// One wind station for each place, for a map that would otherwise draw several on top of each
// other where networks meet: decision 048. Functions that read no clock and no database.

/** Two stations closer than this stand at one place. */
export const APART_KM = 2;
// A wind measured longer ago than this is not the wind now, as the web app reads it too.
export const LIVE_WIND_MS = 2 * 60 * 60 * 1000;

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
};

const EARTH_KM = 6371;
const KM_PER_DEGREE = 111.2;

function distanceKm(one: WindPlace, other: WindPlace) {
  const radians = (degrees: number) => (degrees * Math.PI) / 180;
  const a =
    Math.sin(radians(other.latitude - one.latitude) / 2) ** 2 +
    Math.cos(radians(one.latitude)) *
      Math.cos(radians(other.latitude)) *
      Math.sin(radians(other.longitude - one.longitude) / 2) ** 2;
  return 2 * EARTH_KM * Math.asin(Math.sqrt(a));
}

/**
 * Orders two stations by which speaks better for a place: one that measured lately, then one
 * that gives the gusts, then one that measures more often, then an official one, then the id.
 */
export function better(one: WindPlace, other: WindPlace, now: Date) {
  const live = (station: WindPlace) =>
    station.measuredAt !== null && now.getTime() - station.measuredAt.getTime() <= LIVE_WIND_MS;
  const minutes = (station: WindPlace) => MINUTES_BETWEEN[station.provider] ?? HOURLY;
  const official = (station: WindPlace) => !COMMUNITY.has(station.provider);

  return (
    Number(live(other)) - Number(live(one)) ||
    Number(other.gust) - Number(one.gust) ||
    minutes(one) - minutes(other) ||
    Number(official(other)) - Number(official(one)) ||
    (one.id < other.id ? -1 : one.id > other.id ? 1 : 0)
  );
}

/**
 * The stations to draw, one for each place: of the stations within `APART_KM` of each other,
 * the better one, and the others where it stands alone. When the one kept stops measuring, its
 * neighbour takes its place at the next answer. The order is that of `better`.
 */
export function oneByPlace<Station extends WindPlace>(
  stations: readonly Station[],
  now: Date,
): Station[] {
  // Cells of the size of the distance in latitude: a station near one kept is in its cell or in
  // a neighbour, further in longitude where the meridians close in.
  const cellDegrees = APART_KM / KM_PER_DEGREE;
  const cells = new Map<string, Station[]>();
  const kept: Station[] = [];

  for (const station of [...stations].sort((one, other) => better(one, other, now))) {
    const row = Math.floor(station.latitude / cellDegrees);
    const column = Math.floor(station.longitude / cellDegrees);
    const cos = Math.max(Math.cos((station.latitude * Math.PI) / 180), 0.01);
    const reach = Math.ceil(1 / cos);

    let near = false;
    for (let rowStep = -1; rowStep <= 1 && !near; rowStep += 1) {
      for (let step = -reach; step <= reach && !near; step += 1) {
        const there = cells.get(`${row + rowStep} ${column + step}`) ?? [];
        near = there.some((other) => distanceKm(station, other) < APART_KM);
      }
    }
    if (near) continue;

    kept.push(station);
    const key = `${row} ${column}`;
    cells.set(key, [...(cells.get(key) ?? []), station]);
  }
  return kept;
}
