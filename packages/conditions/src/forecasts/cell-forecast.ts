import { Effect } from "effect";

import {
  type FetchFineWaves,
  type FetchSwell,
  type FineWaves,
  makeFineWaves,
  makeSwell,
  type Swell,
} from "./copernicus-waves";
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
  const models: ForecastData["models"] = [];
  const swellModels: ForecastData["swellModels"] = [];
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
    } else {
      const apart = swell ? swellAt(swell, seconds) : null;
      // The swell is another model's than the waves here, and a part is never more than the
      // whole: it is given no higher than the whole sea of its hour.
      const whole = hours.waveHeightMeters[index] ?? null;
      hours.primarySwellHeightMeters[index] =
        apart && whole !== null ? Math.min(apart.height, whole) : (apart?.height ?? null);
      hours.primarySwellDirectionDegrees[index] = apart?.direction ?? null;
      listed(models, hours.waveHeightMeters[index] === null ? null : modelAt(seconds), seconds);
      listed(swellModels, apart && swell ? swell.model : null, seconds);
    }
    hasSwell ||= hours.primarySwellHeightMeters[index] !== null;
  }
  if (!isFine && !hasSwell) return data;
  // The grid point is the fine model's when it answered: it is the one nearest the spot.
  return { point: isFine && fine ? fine.point : data.point, models, swellModels, hours };
}

/**
 * What asks for the forecast of a cell: Open-Meteo for the wind, the weather and the waves, then
 * the fine model for the waves where it has its sea, and the world's model for the swell apart.
 * The two stores are read once Open-Meteo has answered: a question the budget refuses, or that
 * the provider fails, asks nothing of them. They are not counted against the budget, which is
 * Open-Meteo's, and their failure fails nothing.
 */
export function makeCellForecast(
  fineWaves: FetchFineWaves = makeFineWaves(),
  swell: FetchSwell = makeSwell(),
) {
  return <E>(cell: Cell, spend: Effect.Effect<void, BudgetSpent | E>) =>
    fetchForecast(cell, spend).pipe(
      Effect.flatMap((data) =>
        Effect.all([fineWaves(pointOf(cell)), swell(pointOf(cell))], { concurrency: 2 }).pipe(
          Effect.map(([fine, apart]) => layWaves(data, fine, apart)),
        ),
      ),
    );
}
