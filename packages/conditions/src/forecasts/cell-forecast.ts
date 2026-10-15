import { Effect } from "effect";

import {
  type FetchFineWaves,
  type FetchSwell,
  type FineWaves,
  makeFineWaves,
  makeSwell,
  type Swell,
} from "./copernicus-waves";
import { fetchFromFiles } from "./model-files";
import { makeOpenData, type OpenData } from "./open-data";
import {
  type BudgetSpent,
  type Cell,
  fetchForecast,
  type ForecastData,
  pointOf,
} from "./open-meteo";
import type { WaveModelId } from "./wave-models";

/**
 * The swell at a moment, from a series that has a value every few hours: the height between the
 * two values around the moment, and the direction of the nearer one, since bearings do not
 * average. Null outside the series, and where a value around the moment is missing.
 */
function swellAt(swell: Swell, seconds: number) {
  const [start = 0, next = 0] = swell.time;
  const step = next - start;
  if (step <= 0 || seconds < start) return null;
  const before = Math.floor((seconds - start) / step);
  const share = (seconds - start) / step - before;
  const from = swell.swellHeight[before] ?? null;
  if (share === 0) {
    return from === null ? null : { height: from, direction: swell.swellDirection[before] ?? null };
  }
  const to = swell.swellHeight[before + 1] ?? null;
  if (from === null || to === null) return null;
  return {
    height: Number((from + (to - from) * share).toFixed(2)),
    direction: swell.swellDirection[share < 0.5 ? before : before + 1] ?? null,
  };
}

/**
 * A forecast with what the stores of Copernicus Marine give laid over it. Where the fine model
 * has a height for an hour, the hour's waves are its own, and so is its swell, which is empty
 * when that model gives none for the hour. Every other hour keeps its waves and takes its swell
 * from the world's model, no higher than its waves. The models are listed again from what each hour holds, so the lists
 * say where one hands over to the next.
 */
export function layWaves(
  data: ForecastData,
  fine: FineWaves | null,
  swell: Swell | null,
): ForecastData {
  if (!fine && !swell) return data;
  const fineAt = new Map((fine?.time ?? []).map((seconds, index) => [seconds, index]));
  // The model that answers at a moment: the last of the list that started by then.
  const modelAt = (seconds: number) => {
    let id: WaveModelId | null = null;
    for (const model of data.models) if (model.from <= seconds) id = model.id;
    return id;
  };

  const hours = {
    ...data.hours,
    waveHeightMeters: [...data.hours.waveHeightMeters],
    wavePeriodSeconds: [...data.hours.wavePeriodSeconds],
    wavePeakPeriodSeconds: [...data.hours.wavePeakPeriodSeconds],
    waveDirectionDegrees: [...data.hours.waveDirectionDegrees],
    primarySwellHeightMeters: [...data.hours.primarySwellHeightMeters],
    primarySwellDirectionDegrees: [...data.hours.primarySwellDirectionDegrees],
  };
  const swellModelAt = (seconds: number) => {
    let id: WaveModelId | null = null;
    for (const model of data.swellModels) if (model.from <= seconds) id = model.id;
    return id;
  };
  const peakModelAt = (seconds: number) => {
    let id: WaveModelId | null = null;
    for (const model of data.peakModels) if (model.from <= seconds) id = model.id;
    return id;
  };

  const models: ForecastData["models"] = [];
  const swellModels: ForecastData["swellModels"] = [];
  const peakModels: ForecastData["peakModels"] = [];
  const listed = (list: ForecastData["models"], id: WaveModelId | null, seconds: number) => {
    if (id !== null && list.at(-1)?.id !== id) list.push({ id, from: seconds });
  };
  let isFine = false;
  let hasSwell = false;
  for (const [index, seconds] of data.hours.time.entries()) {
    const at = fineAt.get(seconds);
    const height = fine && at !== undefined ? (fine.height[at] ?? null) : null;
    if (fine && at !== undefined && height !== null) {
      hours.waveHeightMeters[index] = height;
      hours.wavePeriodSeconds[index] = fine.meanPeriod[at] ?? null;
      hours.wavePeakPeriodSeconds[index] = fine.peakPeriod[at] ?? null;
      hours.waveDirectionDegrees[index] = fine.direction[at] ?? null;
      hours.primarySwellHeightMeters[index] = fine.swellHeight[at] ?? null;
      hours.primarySwellDirectionDegrees[index] = fine.swellDirection[at] ?? null;
      listed(models, fine.model, seconds);
      listed(
        swellModels,
        hours.primarySwellHeightMeters[index] === null ? null : fine.model,
        seconds,
      );
      isFine = true;
    } else if (swell) {
      const apart = swellAt(swell, seconds);
      // The swell is another model's than the waves here, and a part is never more than the
      // whole: it is given no higher than the whole sea of its hour.
      const whole = hours.waveHeightMeters[index] ?? null;
      hours.primarySwellHeightMeters[index] =
        apart && whole !== null ? Math.min(apart.height, whole) : (apart?.height ?? null);
      hours.primarySwellDirectionDegrees[index] = apart?.direction ?? null;
      listed(models, hours.waveHeightMeters[index] === null ? null : modelAt(seconds), seconds);
      listed(swellModels, apart ? swell.model : null, seconds);
    } else {
      // No swell laid over: the hour keeps the swell its forecast came with, from the files.
      listed(models, hours.waveHeightMeters[index] === null ? null : modelAt(seconds), seconds);
      listed(
        swellModels,
        hours.primarySwellHeightMeters[index] === null ? null : swellModelAt(seconds),
        seconds,
      );
    }
    listed(
      peakModels,
      hours.wavePeakPeriodSeconds[index] === null
        ? null
        : fine && fineAt.get(seconds) !== undefined && height !== null
          ? fine.model
          : peakModelAt(seconds),
      seconds,
    );
    hasSwell ||= hours.primarySwellHeightMeters[index] !== null;
  }
  if (!isFine && !hasSwell) return data;
  // The grid point is the fine model's when it answered: it is the one nearest the spot.
  return {
    point: isFine && fine ? fine.point : data.point,
    models,
    swellModels,
    peakModels,
    producers: data.producers,
    hours,
  };
}

/**
 * What asks for the forecast of a cell: the models' files on Open-Meteo's bucket for the wind,
 * the weather, the waves and the swell apart, then the fine model laid over where it has its
 * sea. The files cost no quota, so `spend` is not called for them. When they cannot be read, the
 * HTTP API is asked as before, within the budget, and the world's swell store laid over its
 * answer, which has no swell apart: decisions 023, 037, 038 and 058. The stores are read once
 * the forecast is had: a question that fails asks nothing of them, and their failure fails
 * nothing.
 */
export function makeCellForecast(
  fineWaves: FetchFineWaves = makeFineWaves(),
  swell: FetchSwell = makeSwell(),
  files: OpenData | null = makeOpenData(),
) {
  return <E>(cell: Cell, spend: Effect.Effect<void, BudgetSpent | E>) => {
    const fromFiles = files
      ? fetchFromFiles(files, cell).pipe(
          Effect.map(({ data }) => ({ data, swellApart: true })),
          Effect.timeoutOption(FILES_PATIENCE),
          Effect.flatMap((answered) =>
            answered._tag === "Some"
              ? Effect.succeed(answered.value)
              : Effect.logWarning("the models' files took too long").pipe(Effect.as(null)),
          ),
          Effect.catch((error) =>
            Effect.logWarning("the models' files could not be read", error).pipe(Effect.as(null)),
          ),
        )
      : Effect.succeed(null);
    return fromFiles.pipe(
      Effect.flatMap((found) =>
        found
          ? Effect.succeed(found)
          : fetchForecast(cell, spend).pipe(Effect.map((data) => ({ data, swellApart: false }))),
      ),
      Effect.flatMap(({ data, swellApart }) =>
        Effect.all(
          [fineWaves(pointOf(cell)), swellApart ? Effect.succeed(null) : swell(pointOf(cell))],
          { concurrency: 2 },
        ).pipe(Effect.map(([fine, apart]) => layWaves(data, fine, apart))),
      ),
    );
  };
}

// How long a cell waits for the files before the API is asked instead: a cold cell takes a few
// seconds from Europe, the bucket being in Oregon.
const FILES_PATIENCE = "20 seconds";
