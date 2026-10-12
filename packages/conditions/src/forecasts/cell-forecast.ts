import { Effect } from "effect";

import { type FetchFineWaves, type FineWaves, makeFineWaves } from "./copernicus-waves";
import {
  type BudgetSpent,
  type Cell,
  fetchForecast,
  type ForecastData,
  pointOf,
} from "./open-meteo";
import type { WaveModelId } from "./wave-models";

/**
 * A forecast with the fine model's waves laid over it: where the fine model has a height for an
 * hour, the hour's waves are its own, and elsewhere they stay what they were. The models are
 * listed again from what each hour holds, so the list says where one hands over to the next.
 */
export function overlayWaves(data: ForecastData, fine: FineWaves | null): ForecastData {
  if (!fine) return data;
  const fineAt = new Map(fine.time.map((seconds, index) => [seconds, index]));
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
  };
  const models: ForecastData["models"] = [];
  let isFine = false;
  for (const [index, seconds] of data.hours.time.entries()) {
    const at = fineAt.get(seconds);
    const height = at === undefined ? null : (fine.height[at] ?? null);
    let model: WaveModelId | null;
    if (at !== undefined && height !== null) {
      hours.waveHeightMeters[index] = height;
      hours.wavePeriodSeconds[index] = fine.meanPeriod[at] ?? null;
      hours.wavePeakPeriodSeconds[index] = fine.peakPeriod[at] ?? null;
      hours.waveDirectionDegrees[index] = fine.direction[at] ?? null;
      model = fine.model;
      isFine = true;
    } else {
      model = hours.waveHeightMeters[index] === null ? null : modelAt(seconds);
    }
    if (model !== null && models.at(-1)?.id !== model) models.push({ id: model, from: seconds });
  }
  // The grid point is the fine model's when it answered: it is the one nearest the spot.
  return isFine ? { point: fine.point, models, hours } : data;
}

/**
 * What asks for the forecast of a cell: Open-Meteo for the wind, the weather and the waves, and
 * the fine model for the waves where it has its sea. The fine model is not counted against the
 * budget, which is Open-Meteo's, and its failure fails nothing.
 */
export function makeCellForecast(fineWaves: FetchFineWaves = makeFineWaves()) {
  return <E>(cell: Cell, spend: Effect.Effect<void, BudgetSpent | E>) =>
    Effect.all([fetchForecast(cell, spend), fineWaves(pointOf(cell))], { concurrency: 2 }).pipe(
      Effect.map(([data, fine]) => overlayWaves(data, fine)),
    );
}
