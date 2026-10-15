import { Effect } from "effect";

import {
  cellOf,
  covers,
  type Grid,
  isGlobal,
  type OpenData,
  OpenDataError,
  type Point,
  pointAt,
  type Series,
} from "./open-data";
import { type Cell, type ForecastData, KEPT_DAYS, KEPT_PAST_DAYS, pointOf } from "./open-meteo";

// A forecast built from the models' files on Open-Meteo's bucket, as the API would build it: the
// finest model that covers the point first, the next filling what it lacks, with a ramp of three
// hours where one hands over to the next. The waves are MFWAM's, read at the sea cell the API
// would take, with ECMWF's peak period laid in. Decision 058.

const HOUR = 3600;
const DAY = 24 * HOUR;

/** What a model of the atmosphere gives, and the file of each. */
const WEATHER = {
  u: "wind_u_component_10m",
  v: "wind_v_component_10m",
  gusts: "wind_gusts_10m",
  temperature: "temperature_2m",
  cloud: "cloud_cover",
  precipitation: "precipitation",
} as const;

type WeatherVariable = keyof typeof WEATHER;

/**
 * The models of the atmosphere, the finest first, each read where its grid covers the point and
 * its files have an hour. The order is the API's for Europe and the world, kept to the models on
 * a regular grid that store the wind as two components. `without` names what a model lacks.
 */
export const WEATHER_MODELS = [
  { id: "dwd_icon_d2", producer: "DWD", resolutionKilometers: 2, without: [] },
  {
    id: "meteofrance_arome_france0025",
    producer: "Météo-France",
    resolutionKilometers: 2.5,
    without: [],
  },
  { id: "dwd_icon_eu", producer: "DWD", resolutionKilometers: 7, without: [] },
  { id: "dwd_icon", producer: "DWD", resolutionKilometers: 11, without: [] },
  { id: "ncep_gfs013", producer: "NOAA", resolutionKilometers: 13, without: ["gusts"] },
] as const satisfies readonly {
  id: string;
  producer: string;
  resolutionKilometers: number;
  without: readonly WeatherVariable[];
}[];

export type WeatherModelId = (typeof WEATHER_MODELS)[number]["id"];

/** The wave model of the whole sea and the swell apart, and the one its peak period is read from. */
export const WAVES_MODEL = "meteofrance_wave";
export const PEAK_MODEL = "ecmwf_wam025";

/** How many cells each way the API looks for the sea around a wave model's nearest cell. */
export const SEA_REACH = 2;

/** How many of the finer model's last steps are blended into the next one: the API's three. */
export const HANDOVER_STEPS = 3;

/** The hours a forecast holds: from two days before today to eight days from it, in seconds. */
export function spanAt(now: number) {
  const today = Math.floor(now / 1000 / DAY) * DAY;
  return { from: today - KEPT_PAST_DAYS * DAY, until: today + KEPT_DAYS * DAY };
}

/** The seconds of every hour of a span. */
export function hoursOf(span: { from: number; until: number }) {
  return Array.from(
    { length: (span.until - span.from) / HOUR },
    (_, index) => span.from + index * HOUR,
  );
}

/**
 * Lays a finer model's values over a coarser one's: where the finer has a value it stands, and
 * its last `HANDOVER_STEPS` values before it ends are blended into the coarser, a quarter, a
 * half and three quarters, as the API does. Where the finer has none, the coarser stands.
 */
export function handOver(finer: (number | null)[], coarser: (number | null)[]) {
  const out = finer.map((value, index) => value ?? coarser[index] ?? null);
  // The last index at which the finer model has a value, before a gap it never fills.
  let last = -1;
  for (let index = finer.length - 1; index >= 0; index -= 1) {
    if (finer[index] !== null && finer[index] !== undefined) {
      last = index;
      break;
    }
  }
  if (last < 0 || last === finer.length - 1) return out;
  for (let step = 0; step < HANDOVER_STEPS; step += 1) {
    const index = last - step;
    const fine = finer[index];
    const coarse = coarser[index];
    if (
      index < 0 ||
      fine === null ||
      fine === undefined ||
      coarse === null ||
      coarse === undefined
    ) {
      continue;
    }
    // The last step is three quarters the coarser model's, the one before half, then a quarter.
    const share = (HANDOVER_STEPS - step) / (HANDOVER_STEPS + 1);
    out[index] = fine * (1 - share) + coarse * share;
  }
  return out;
}

/**
 * A series read every few hours, given at every hour between: a value between two is on the
 * line between them, and a direction is the nearer one's, since bearings do not average. Null
 * outside the series and where a value around the hour is missing.
 */
export function hourly(series: Series, hours: readonly number[], kind: "value" | "direction") {
  const at = new Map(series.time.map((seconds, index) => [seconds, index]));
  const [first, second] = series.time;
  const step = first !== undefined && second !== undefined ? second - first : HOUR;
  return hours.map((seconds) => {
    const exact = at.get(seconds);
    if (exact !== undefined) return series.values[exact] ?? null;
    if (first === undefined || seconds < first || step <= 0) return null;
    const before = Math.floor((seconds - first) / step);
    const share = (seconds - first) / step - before;
    const from = series.values[before];
    const to = series.values[before + 1];
    if (from === null || from === undefined || to === null || to === undefined) return null;
    return kind === "direction" ? (share < 0.5 ? from : to) : from + (to - from) * share;
  });
}

/** A wind as two components, as a speed and the direction it comes from. */
export function windOf(u: number | null, v: number | null) {
  if (u === null || v === null) return { speed: null, direction: null };
  const speed = Math.hypot(u, v);
  const direction = (Math.atan2(-u, -v) * 180) / Math.PI;
  return { speed: round(speed, 2), direction: Math.round((direction + 360) % 360) % 360 };
}

/** MFWAM's directions are stored 180° off in the bucket, which the API corrects for it alone. */
export function turnedDirection(degrees: number | null) {
  return degrees === null ? null : (((degrees + 180) % 360) + 360) % 360;
}

const round = (value: number | null, decimals: number) =>
  value === null ? null : Number(value.toFixed(decimals));

/**
 * The sea cell the API would read for a point: among the cells within `reach` of the nearest
 * grid point, the sea cell nearest in squared degrees. Null when none is sea.
 */
export function seaCellOf(
  grid: Grid,
  point: Point,
  cells: readonly { row: number; column: number; isSea: boolean }[],
) {
  let best: { row: number; column: number } | null = null;
  let nearest = Infinity;
  for (const cell of cells) {
    if (!cell.isSea) continue;
    const at = pointAt(grid, cell);
    const away = (at.latitude - point.latitude) ** 2 + (at.longitude - point.longitude) ** 2;
    if (away < nearest) {
      nearest = away;
      best = { row: cell.row, column: cell.column };
    }
  }
  return best;
}

type Weather = Record<WeatherVariable, (number | null)[]>;

/**
 * The forecast of a cell from the models' files: the hours of the span that is kept, with the
 * weather of the finest models that cover the point, one handing over to the next, and the
 * waves of MFWAM at the sea cell the API would take. The point is the finest weather model's
 * grid point. Fails when no model could be read; a wave model that cannot be read leaves the
 * sea empty, which the kept forecast then says.
 */
export const fetchFromFiles = Effect.fn("fetchFromFiles")(function* (
  files: OpenData,
  cell: Cell,
  now = Date.now(),
) {
  const point = pointOf(cell);
  const span = spanAt(now);
  const hours = hoursOf(span);
  const empty = () => hours.map((): number | null => null);

  // The weather: every model that covers the point is read at once, and the finest stands
  // first, the next filling what it lacks, until every hour has a wind.
  const candidates = yield* Effect.all(
    WEATHER_MODELS.map((model) =>
      Effect.gen(function* () {
        const meta = yield* files.meta(model.id).pipe(Effect.option);
        if (meta._tag === "None" || !covers(meta.value.box, point)) return null;
        const grid = yield* files.grid(model.id, WEATHER.u, span.from).pipe(Effect.option);
        if (grid._tag === "None") return null;
        const at = cellOf(grid.value, point);
        if (!at) return null;
        const read = yield* Effect.all(
          (Object.keys(WEATHER) as WeatherVariable[]).map((variable) =>
            (model.without as readonly WeatherVariable[]).includes(variable)
              ? Effect.succeed(empty())
              : files
                  .series(model.id, WEATHER[variable], at, span)
                  .pipe(Effect.map((series) => hourly(series, hours, "value"))),
          ),
          { concurrency: "unbounded" },
        ).pipe(Effect.option);
        if (read._tag === "None") return null;
        const own = Object.fromEntries(
          (Object.keys(WEATHER) as WeatherVariable[]).map((variable, index) => [
            variable,
            read.value[index],
          ]),
        ) as Weather;
        // A model whose grid reaches the point and whose values do not: the box of ICON-D2
        // is larger than its domain.
        if (own.u.every((value) => value === null)) return null;
        return { model, own, point: pointAt(grid.value, at) };
      }),
    ),
    { concurrency: "unbounded" },
  );
  let weather: Weather | null = null;
  let gridPoint: Point | null = null;
  const producers: string[] = [];
  for (const found of candidates) {
    if (!found) continue;
    if (weather !== null && weather.u.every((value) => value !== null)) break;
    gridPoint ??= found.point;
    producers.push(found.model.producer);
    weather =
      weather === null
        ? found.own
        : (Object.fromEntries(
            (Object.keys(WEATHER) as WeatherVariable[]).map((variable) => [
              variable,
              handOver(weather![variable], found.own[variable]),
            ]),
          ) as Weather);
  }
  if (weather === null || gridPoint === null) {
    return yield* new OpenDataError({ message: "no weather model could be read for the point" });
  }

  // The waves: MFWAM at the sea cell the API would take, and ECMWF's peak period the same way.
  const [waves, peak] = yield* Effect.all(
    [
      seaSeries(files, WAVES_MODEL, point, span, hours, {
        height: ["wave_height", "value"],
        period: ["wave_period", "value"],
        direction: ["wave_direction", "direction"],
        swellHeight: ["swell_wave_height", "value"],
        swellDirection: ["swell_wave_direction", "direction"],
      }),
      seaSeries(files, PEAK_MODEL, point, span, hours, {
        peak: ["wave_peak_period", "value"],
      }),
    ],
    { concurrency: 2 },
  );

  const wind = weather.u.map((u, index) => windOf(u, weather!.v[index] ?? null));
  const height = waves?.height.map((value) => round(value, 2)) ?? empty();
  const firstSea = hours[height.findIndex((value) => value !== null)];
  const data: ForecastData = {
    point: gridPoint,
    models: firstSea === undefined ? [] : [{ id: WAVES_MODEL, from: firstSea }],
    swellModels: firstSea === undefined || !waves ? [] : [{ id: WAVES_MODEL, from: firstSea }],
    peakModels:
      firstSea === undefined || !peak?.peak.some((value) => value !== null)
        ? []
        : [{ id: PEAK_MODEL, from: firstSea }],
    hours: {
      time: hours,
      waveHeightMeters: height,
      wavePeriodSeconds: waves?.period.map((value) => round(value, 2)) ?? empty(),
      wavePeakPeriodSeconds: peak?.peak.map((value) => round(value, 2)) ?? empty(),
      waveDirectionDegrees:
        waves?.direction.map((value) => round(turnedDirection(value), 0)) ?? empty(),
      primarySwellHeightMeters: waves?.swellHeight.map((value) => round(value, 2)) ?? empty(),
      primarySwellDirectionDegrees:
        waves?.swellDirection.map((value) => round(turnedDirection(value), 0)) ?? empty(),
      windSpeedMetersPerSecond: wind.map((each) => each.speed),
      windGustMetersPerSecond: weather.gusts.map((value) => round(value, 2)),
      windDirectionDegrees: wind.map((each) => each.direction),
      cloudCoverPercent: weather.cloud.map((value) => round(value, 0)),
      precipitationMillimeters: weather.precipitation.map((value) => round(value, 2)),
      airTemperatureCelsius: weather.temperature.map((value) => round(value, 1)),
    },
  };
  return { data, producers };
});

// The series of a wave model at the sea cell the API would take for a point, each at every
// hour. Null when the model cannot be read, or has no sea within reach.
const seaSeries = Effect.fn("seaSeries")(function* <Name extends string>(
  files: OpenData,
  model: string,
  point: Point,
  span: { from: number; until: number },
  hours: readonly number[],
  variables: Record<Name, readonly [file: string, kind: "value" | "direction"]>,
) {
  const names = Object.keys(variables) as Name[];
  const first = variables[names[0]!]![0];
  const grid = yield* files.grid(model, first, span.from).pipe(Effect.option);
  if (grid._tag === "None") return null;
  const nearest = cellOf(grid.value, point);
  if (!nearest) return null;
  const readAt = (cell: { row: number; column: number }) =>
    Effect.all(
      names.map((name) => {
        const [file, kind] = variables[name]!;
        return files
          .series(model, file, cell, span)
          .pipe(Effect.map((series) => hourly(series, hours, kind)));
      }),
      { concurrency: "unbounded" },
    ).pipe(
      Effect.map(
        (read) =>
          Object.fromEntries(names.map((name, index) => [name, read[index]])) as Record<
            Name,
            (number | null)[]
          >,
      ),
      Effect.option,
    );
  const around = yield* files.seaAround(model, nearest, SEA_REACH).pipe(Effect.option);
  if (around._tag === "Some") {
    const cell = seaCellOf(grid.value, point, around.value);
    if (!cell) return null;
    const read = yield* readAt(cell);
    return read._tag === "Some" ? read.value : null;
  }
  // A model with no land mask: the nearest cell within reach that has a value is the sea.
  const away = (cell: { row: number; column: number }) => {
    const at = pointAt(grid.value, cell);
    return (at.latitude - point.latitude) ** 2 + (at.longitude - point.longitude) ** 2;
  };
  const candidates = cellsAround(grid.value, nearest, SEA_REACH).sort(
    (one, other) => away(one) - away(other),
  );
  for (const cell of candidates) {
    const read = yield* readAt(cell);
    if (read._tag === "Some" && read.value[names[0]!]!.some((value) => value !== null)) {
      return read.value;
    }
  }
  return null;
});

/** The cells of a grid within `reach` rows and columns of one, the grid's edges respected. */
export function cellsAround(grid: Grid, cell: { row: number; column: number }, reach: number) {
  const cells: { row: number; column: number }[] = [];
  const rows = { from: Math.max(0, cell.row - reach), to: Math.min(grid.ny - 1, cell.row + reach) };
  for (let row = rows.from; row <= rows.to; row += 1) {
    for (let column = cell.column - reach; column <= cell.column + reach; column += 1) {
      const wrapped = isGlobal(grid) ? ((column % grid.nx) + grid.nx) % grid.nx : column;
      if (wrapped < 0 || wrapped >= grid.nx) continue;
      cells.push({ row, column: wrapped });
    }
  }
  return cells;
}
