import { forecastSource } from "@repo/conditions/forecasts/wave-models";

import { NearbyBreaks } from "@/components/spot-pages/nearby-breaks";
import { NextTides } from "@/components/spot-pages/next-tides";
import { SeaNow } from "@/components/spot-pages/sea-now";
import { WeekTable } from "@/components/spot-pages/week-table";
import type { NearStation, NearWind, NearbyBreak, SpotTide, SpotWeek } from "@/lib/pages-api";

// The pieces of the public page of a surf break, over invented figures: the sea now, the next
// tides, the week and the breaks nearby. Decision 057.

const NOW = Date.UTC(2026, 9, 9, 9, 30);
const HOUR_MS = 60 * 60 * 1000;
const at = (hours: number) => new Date(NOW + hours * HOUR_MS);

const READING: NearStation["latestReading"] = {
  observedAt: at(-0.4),
  significantHeightMeters: 1.8,
  maxHeightMeters: 2.9,
  peakPeriodSeconds: 12,
  meanPeriodSeconds: 9,
  significantPeriodSeconds: 10,
  peakDirectionDegrees: 290,
  directionalSpreadDegrees: 24,
  waterTemperatureCelsius: 15.2,
  windSpeedMetersPerSecond: null,
  windGustMetersPerSecond: null,
  windDirectionDegrees: null,
  validated: false,
};

const LICENCE = {
  type: "Etalab 2.0",
  url: "https://www.etalab.gouv.fr/licence-ouverte-open-licence/",
  commercialUse: true,
};

const BUOY: NearStation = {
  id: "candhis-05602",
  provider: "candhis",
  name: "Pierres Noires",
  latitude: 48.29,
  longitude: -4.97,
  attribution: "CANDHIS, Cerema",
  measures: ["waves"],
  exposure: "open",
  license: LICENCE,
  latestReading: READING,
  distanceKm: 23.4,
};

const WIND: NearWind = {
  id: "meteofrance-29075001",
  provider: "meteofrance",
  name: "Penmarch",
  latitude: 47.8,
  longitude: -4.37,
  attribution: "Météo-France",
  measures: ["wind"],
  exposure: null,
  license: LICENCE,
  latestReading: {
    ...READING,
    observedAt: at(-0.2),
    significantHeightMeters: null,
    peakPeriodSeconds: null,
    peakDirectionDegrees: null,
    windSpeedMetersPerSecond: 4.1,
    windGustMetersPerSecond: 6.7,
    windDirectionDegrees: 80,
  },
  distanceKm: 6.1,
  atShore: "offshore",
};

const TIDE: SpotTide = {
  station: {
    id: "brest",
    name: "Brest",
    latitude: 48.38,
    longitude: -4.49,
    distanceKm: 61,
    source: { name: "NEAPS", url: "https://neaps.org" },
    license: { type: "MIT", url: "https://opensource.org/license/mit", commercialUse: true },
  },
  datum: "MSL",
  extremes: [
    { time: at(2.3), type: "high", heightMeters: 2.9 },
    { time: at(8.5), type: "low", heightMeters: -2.6 },
    { time: at(14.8), type: "high", heightMeters: 3.1 },
    { time: at(21), type: "low", heightMeters: -2.8 },
    { time: at(27.2), type: "high", heightMeters: 3.2 },
  ],
};

const WAVES = [1.2, 1.8, 2.6, 3.4, 2.1, 1.1, 0.7];
const WINDS = [3.2, 4.1, 7.8, 12.5, 9.1, 5.2, 2.4];
const WEEK: SpotWeek = {
  fetchedAt: at(-5),
  stale: true,
  source: forecastSource(["ecmwf_wam", "mfwam"]),
  days: WAVES.map((height, index) => {
    const day = new Date(Date.UTC(2026, 9, 9 + index, 12));
    return {
      day: day.toISOString().slice(0, 10),
      hours: 24,
      wave: {
        time: day,
        heightMeters: height,
        peakPeriodSeconds: 9 + index,
        directionDegrees: 280 + index * 5,
        primarySwellHeightMeters: height * 0.8,
        primarySwellDirectionDegrees: 285,
      },
      wind: {
        time: day,
        speedMetersPerSecond: WINDS[index]!,
        gustMetersPerSecond: WINDS[index]! * 1.4,
        directionDegrees: index < 3 ? 80 : 250,
      },
      airTemperatureCelsius: 16,
      cloudCoverPercent: 40,
      precipitationMillimeters: index === 3 ? 4.2 : 0,
    };
  }),
};

const nothing = {
  breakTypes: null,
  waveDirections: null,
  bottomTypes: null,
  abilityLevels: null,
  boardTypes: null,
  bestSeasons: null,
  bestTides: null,
  bestSwellDirections: null,
  bestWindDirections: null,
  offshoreDirectionDegrees: 90,
  waveSizeMeters: null,
};

const NEARBY: NearbyBreak[] = [
  {
    id: "1",
    name: "La Torche",
    page: "/spots/france/bretagne/la-torche",
    distanceKm: 3.2,
    listed: true,
    characteristics: { ...nothing, breakTypes: ["beach"], bottomTypes: ["sand"] },
  },
  {
    id: "2",
    name: "Pors Carn",
    page: "/spots/france/bretagne/pors-carn",
    distanceKm: 4.8,
    listed: true,
    characteristics: { ...nothing, breakTypes: ["beach"], bottomTypes: ["sand", "rock"] },
  },
  {
    id: "3",
    name: "Anse du Phare",
    page: "/spots/france/bretagne/anse-du-phare",
    distanceKm: 1.1,
    listed: false,
    characteristics: nothing,
  },
];

export function SpotPageSamples() {
  return (
    <div className="grid gap-xl">
      <SeaNow waves={BUOY} wind={WIND} now={NOW} />
      {/* Far from every station: each says so in its place. */}
      <SeaNow waves={null} wind={null} now={NOW} />
      <NextTides tide={TIDE} timezone="Europe/Paris" />
      <NextTides tide={TIDE} timezone={null} />
      <WeekTable week={WEEK} now={NOW} />
      <WeekTable week={null} now={NOW} />
      <NearbyBreaks nearby={NEARBY} />
    </div>
  );
}
