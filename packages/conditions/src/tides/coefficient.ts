import { near } from "@neaps/tide-database";
import { createTidePredictor } from "@neaps/tide-predictor";

/*
 * The coefficient of a tide, as the tide tables of France and Spain print it: how strong the
 * semi-diurnal tide at Brest is, from 20 at the weakest neap tides to 120 at the strongest
 * spring tides. It is the amplitude of the semi-diurnal tide at Brest over its unit of height,
 * 3.05 m, times 100. Brest's harmonic constants come from the tide database, and only its
 * semi-diurnal constituents are summed, as the definition says. On 1 to 9 October 2026 this gave
 * the published coefficients within 2.
 */

const BREST = { latitude: 48.383, longitude: -4.495 };
const UNIT_OF_HEIGHT_METERS = 3.05;
// Room for the Brest high water nearest to a local one at either end of a period.
const MARGIN_MS = 13 * 60 * 60 * 1000;

let semiDiurnal: ReturnType<typeof createTidePredictor> | undefined;

function brestPredictor() {
  if (semiDiurnal) return semiDiurnal;
  const [match] = near({ ...BREST, maxDistance: 5, maxResults: 1 });
  if (!match) throw new Error("The tide database has no station at Brest");
  // A semi-diurnal constituent is named for its two tides a day: M2, S2, N2, K2, MU2...
  const constituents = match[0].harmonic_constituents.filter((c) => c.name.endsWith("2"));
  semiDiurnal = createTidePredictor(constituents, { offset: 0 });
  return semiDiurnal;
}

/** The coefficient of each semi-diurnal high water at Brest between two moments. */
export function brestCoefficients({ start, end }: { start: Date; end: Date }) {
  return brestPredictor()
    .getExtremesPrediction({ start, end })
    .filter((extreme) => extreme.high)
    .map((extreme) => ({
      time: extreme.time,
      coefficient: Math.round((extreme.level / UNIT_OF_HEIGHT_METERS) * 100),
    }));
}

/**
 * The coefficient of each high water in a list: that of the Brest high water nearest in time.
 * A coefficient moves by a few points from one tide to the next, so a port whose tide comes
 * hours after Brest's reads its own within that.
 */
export function coefficientsOf(highs: Date[]) {
  if (highs.length === 0) return [];
  const times = highs.map((time) => time.getTime());
  const brest = brestCoefficients({
    start: new Date(Math.min(...times) - MARGIN_MS),
    end: new Date(Math.max(...times) + MARGIN_MS),
  });
  return times.map((time) => {
    let nearest = brest[0];
    for (const tide of brest) {
      const distance = Math.abs(tide.time.getTime() - time);
      if (!nearest || distance < Math.abs(nearest.time.getTime() - time)) nearest = tide;
    }
    return nearest?.coefficient ?? null;
  });
}

/**
 * Whether the tables of a coast print coefficients: the Atlantic and the Channel of France and
 * Spain. The Mediterranean has next to no tide, and other countries do not use them.
 */
export function usesCoefficients(station: {
  country: string;
  latitude: number;
  longitude: number;
}) {
  if (station.country !== "France" && station.country !== "Spain") return false;
  const { latitude, longitude } = station;
  // The Gulf of Lion, Corsica and the east of Spain, then the south of Spain past Gibraltar.
  const mediterranean =
    (latitude < 44.5 && longitude > -1) || (latitude < 37.5 && longitude > -5.6);
  return !mediterranean;
}
