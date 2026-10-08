import { near, type Station } from "@neaps/tide-database";
import { useStation } from "@neaps/tide-predictor";

// Beyond this distance the nearest gauge says little about the tide at the point.
export const MAX_STATION_DISTANCE_KM = 100;

// Some stations derive their tides from a reference station, shifted by up to 12 hours 21 minutes.
// The predictor is asked for a wider period, so a shifted tide that lands in the request is found.
const SHIFT_MARGIN_MS = 13 * 60 * 60 * 1000;

type TideQuery = {
  latitude: number;
  longitude: number;
  start: Date;
  end: Date;
};

function findTideStation({ latitude, longitude }: Pick<TideQuery, "latitude" | "longitude">) {
  const [match] = near({
    latitude,
    longitude,
    maxDistance: MAX_STATION_DISTANCE_KM,
    maxResults: 1,
  });
  if (!match) return null;

  const [station, distanceKm] = match;
  return { station, distanceKm, predictor: useStation(station, distanceKm) };
}

function describeStation(station: Station, distanceKm: number) {
  return {
    id: station.id,
    name: station.name,
    latitude: station.latitude,
    longitude: station.longitude,
    distanceKm: Math.round(distanceKm * 10) / 10,
    source: { name: station.source.name, url: station.source.url },
    license: {
      type: station.license.type,
      url: station.license.url,
      commercialUse: station.license.commercial_use,
    },
  };
}

function roundToCentimeter(meters: number) {
  return Math.round(meters * 100) / 100;
}

// The predictor rounds the ends of the period, so its answer can spill outside the request.
function isWithin(query: TideQuery, time: Date) {
  return time >= query.start && time <= query.end;
}

/** High and low tides at the station nearest to a point, or null when none is close enough. */
export function predictTideExtremes(query: TideQuery) {
  const found = findTideStation(query);
  if (!found) return null;

  const prediction = found.predictor.getExtremesPrediction({
    start: new Date(query.start.getTime() - SHIFT_MARGIN_MS),
    end: new Date(query.end.getTime() + SHIFT_MARGIN_MS),
    units: "meters",
  });

  return {
    station: describeStation(found.station, found.distanceKm),
    datum: prediction.datum ?? found.station.chart_datum,
    extremes: prediction.extremes
      .filter((extreme) => isWithin(query, extreme.time))
      .map((extreme) => ({
        time: extreme.time,
        type: extreme.high ? ("high" as const) : ("low" as const),
        heightMeters: roundToCentimeter(extreme.level),
      })),
  };
}

/** Tide heights at regular steps at the station nearest to a point, or null when none is close enough. */
export function predictTideTimeline(query: TideQuery & { stepMinutes: number }) {
  const found = findTideStation(query);
  if (!found) return null;

  const prediction = found.predictor.getTimelinePrediction({
    start: query.start,
    end: query.end,
    timeFidelity: query.stepMinutes * 60,
    units: "meters",
  });

  return {
    station: describeStation(found.station, found.distanceKm),
    datum: prediction.datum ?? found.station.chart_datum,
    timeline: prediction.timeline
      .filter((point) => isWithin(query, point.time))
      .map((point) => ({
        time: point.time,
        heightMeters: roundToCentimeter(point.level),
      })),
  };
}
