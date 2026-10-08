import { Effect } from "effect";

import { fetchText } from "@repo/upstream";
import { FormatError } from "./format-error";
import { isPosition, plausible } from "./plausible";
import type { Provider, ReadingInput, StationInput } from "./provider";
import { utcDate } from "./utc-date";

const MAP_URL = "https://candhis.cerema.fr/_public_/cartes.php";
const LICENSE_URL = "https://www.etalab.gouv.fr/licence-ouverte-open-licence/";

// CANDHIS has no API. Its pages carry their data in JavaScript variables, which these parsers read.
function campaignUrl(campaignId: string) {
  return `https://candhis.cerema.fr/_public_/campagne.php?${btoa(`camp=${campaignId}`)}`;
}

function formatError(message: string) {
  return new FormatError({ provider: "candhis", message });
}

function parseJson(text: string | undefined): unknown {
  if (text === undefined) return undefined;
  try {
    // The pages escape apostrophes for JavaScript, which JSON does not accept.
    return JSON.parse(text.replaceAll("\\'", "'"));
  } catch {
    return undefined;
  }
}

type Campaign = { id: string; name: string; latitude: number; longitude: number };

/** Reads the map page and returns the campaigns that publish real-time data. */
export function parseRealTimeCampaigns(html: string): Campaign[] | FormatError {
  const status = parseJson(/sCampPHP\s*=\s*(\[\{.*?\}\]);/s.exec(html)?.[1]);
  const details = parseJson(/lCampBDDPHP\s*=\s*(\[\[.*?\]\]);/s.exec(html)?.[1]);
  if (!Array.isArray(status) || !Array.isArray(details)) {
    return formatError("the map page has no campaign list");
  }

  const realTimeIds = new Set(
    status
      .filter((entry) => typeof entry?.sTyp === "string" && entry.sTyp.includes("[TR]"))
      .map((entry) => String(entry.sNum)),
  );

  const campaigns: Campaign[] = [];
  for (const row of details) {
    if (!Array.isArray(row)) continue;
    // Each row starts with the campaign number and name. Latitude and longitude are fields 4 and 5.
    const [id, name, , , latitude, longitude] = row.map(String);
    if (!id || !name || !realTimeIds.has(id)) continue;
    if (!latitude || !longitude || Number.isNaN(+latitude) || Number.isNaN(+longitude)) continue;
    if (!isPosition(+latitude, +longitude)) continue;

    campaigns.push({ id, name, latitude: +latitude, longitude: +longitude });
  }
  return campaigns;
}

// The measurement behind each series label CANDHIS uses.
const MEASUREMENT_BY_LABEL = {
  "H1/3 (m)": "significantHeightM",
  // A spectral estimate of the same quantity.
  "Hm0 (m)": "significantHeightM",
  "Hmax (m)": "maxHeightM",
  "Th1/3 (s)": "significantPeriodS",
  "T02 (s)": "meanPeriodS",
  "T. au pic (s)": "peakPeriodS",
  "Dir. au pic (°)": "peakDirectionDeg",
  "Etal. au pic (°)": "directionalSpreadDeg",
  "Temp. mer (°C)": "waterTemperatureC",
} as const satisfies Record<string, keyof ReadingInput>;

type Measurement = (typeof MEASUREMENT_BY_LABEL)[keyof typeof MEASUREMENT_BY_LABEL];

function isKnownLabel(label: unknown): label is keyof typeof MEASUREMENT_BY_LABEL {
  return typeof label === "string" && Object.hasOwn(MEASUREMENT_BY_LABEL, label);
}

/** Reads a campaign page: the partners to credit and two days of readings. */
export function parseCampaignPage(
  html: string,
  campaignId: string,
): { partners: string | null; readings: ReadingInput[]; rejected: number } | FormatError {
  const format = Number(/fmtPHP\s*=\s*parseInt\(eval\('(\d+)'\)\)/.exec(html)?.[1]);
  const legends = parseJson(/arrLegNomPHP\s*=\s*JSON\.parse\('(.*?)'\);/s.exec(html)?.[1]);
  const labels: unknown = Array.isArray(legends) ? legends[format] : undefined;
  if (!Array.isArray(labels)) return formatError(`campaign ${campaignId} has no series labels`);

  const unknownLabel = labels.find((label) => !isKnownLabel(label));
  if (unknownLabel !== undefined) {
    return formatError(`campaign ${campaignId} has an unknown series "${String(unknownLabel)}"`);
  }
  const measurements = labels.filter(isKnownLabel).map((label) => MEASUREMENT_BY_LABEL[label]);

  // Series 0 holds the first two measurements, as [time, value, tooltip, value, tooltip].
  // Each later series holds one, as [time, value, tooltip]. A page always declares five series
  // and leaves the last one empty when it has fewer measurements.
  const byTime = new Map<string, Partial<Record<Measurement, number>>>();
  const seriesFound = new Set<number>();
  for (const [, index = "", json] of html.matchAll(
    /arrDataPHP\[(\d+)\]\s*=\s*eval\('(.*?)'\);/gs,
  )) {
    const series = parseJson(json);
    if (!Array.isArray(series)) return formatError(`campaign ${campaignId} has unreadable data`);

    const seriesIndex = Number(index);
    seriesFound.add(seriesIndex);
    for (const row of series) {
      if (!Array.isArray(row) || typeof row[0] !== "string") continue;
      const values = seriesIndex === 0 ? [row[1], row[3]] : [row[1]];
      const firstMeasurement = seriesIndex === 0 ? 0 : seriesIndex + 1;

      for (const [offset, value] of values.entries()) {
        if (typeof value !== "number" || !Number.isFinite(value)) continue;
        const measurement = measurements[firstMeasurement + offset];
        if (!measurement) {
          return formatError(`campaign ${campaignId} has data in a series without a label`);
        }
        // A value outside what the sea can do is treated as missing.
        const stored = plausible(measurement, value);
        if (stored === null) continue;
        byTime.set(row[0], { ...byTime.get(row[0]), [measurement]: stored });
      }
    }
  }

  // The first series holds two measurements, so the labels need one series fewer than their count.
  for (let index = 0; index < measurements.length - 1; index += 1) {
    if (!seriesFound.has(index)) {
      return formatError(`campaign ${campaignId} has no data series ${index}`);
    }
  }

  const readings: ReadingInput[] = [];
  let rejected = 0;
  for (const [time, values] of byTime) {
    // Times are printed in UTC, as "2026-10-08 07:00".
    const parts = /^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2})$/.exec(time)?.slice(1).map(Number);
    const [year, month, day, hour, minute] = parts ?? [];
    const observedAt =
      year === undefined ||
      month === undefined ||
      day === undefined ||
      hour === undefined ||
      minute === undefined
        ? null
        : utcDate(year, month, day, hour, minute);
    if (!observedAt) {
      rejected += 1;
      continue;
    }
    readings.push({ providerStationId: campaignId, observedAt, ...values });
  }

  const partners = parseJson(/titPartPHP\s*=\s*eval\('(".*?")'\);/s.exec(html)?.[1]);
  return {
    partners: typeof partners === "string" && partners ? partners : null,
    readings,
    rejected,
  };
}

export const candhis: Provider = {
  id: "candhis",
  // Buoys report on the hour and the half hour.
  schedule: "10,40 * * * *",
  fetchSnapshot: Effect.gen(function* () {
    const campaigns = parseRealTimeCampaigns(yield* fetchText(MAP_URL));
    if (campaigns instanceof FormatError) return yield* campaigns;

    // One page per campaign, two at a time, to stay light on a public site.
    const pages = yield* Effect.forEach(
      campaigns,
      (campaign) =>
        Effect.gen(function* () {
          const page = parseCampaignPage(yield* fetchText(campaignUrl(campaign.id)), campaign.id);
          if (page instanceof FormatError) return yield* page;
          return { campaign, ...page };
        }).pipe(
          Effect.catch((error) =>
            Effect.gen(function* () {
              yield* Effect.logWarning(`candhis: skipped campaign ${campaign.id}`, error);
              return null;
            }),
          ),
        ),
      { concurrency: 2 },
    );

    const read = pages.filter((page) => page !== null);
    if (campaigns.length > 0 && read.length === 0) {
      return yield* formatError("no real-time campaign could be read");
    }

    // A campaign that reports no wave height is not stored as a station.
    const reporting = read.filter((page) =>
      page.readings.some((reading) => reading.significantHeightM != null),
    );

    const stations: StationInput[] = reporting.map(({ campaign, partners }) => ({
      providerStationId: campaign.id,
      name: campaign.name,
      latitude: campaign.latitude,
      longitude: campaign.longitude,
      licenseType: "etalab-2.0",
      licenseUrl: LICENSE_URL,
      attribution: partners ? `CANDHIS: ${partners}` : "CANDHIS, Cerema",
      commercialUse: true,
    }));

    return {
      stations,
      readings: reporting.flatMap((page) => page.readings),
      rejected: read.reduce((total, page) => total + page.rejected, 0),
    };
  }),
};
