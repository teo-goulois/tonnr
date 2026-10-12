// The wave models a forecast may come from, and what each party asks to be credited with. The
// wording is theirs, read on 2026-10-12: `docs/data-sources.md` says where. Decision 036.

/** A credit as it must be shown: its words, and the address they link to. */
export type Credit = { text: string; url: string };

const CC_BY = "https://creativecommons.org/licenses/by/4.0/";

// ECMWF's terms give the wording for a service made with its data, and ask that it be shown
// prominently, with the licence and this disclaimer.
const ECMWF = {
  credit: {
    text: "This service is based on data and products of the European Centre for Medium-Range Weather Forecasts (ECMWF)",
    url: "https://www.ecmwf.int/",
  },
  notice:
    "This ECMWF data is published under a Creative Commons Attribution 4.0 International " +
    `(CC BY 4.0) licence, ${CC_BY}. ECMWF does not accept any liability whatsoever for any ` +
    "error or omission in the data, their availability, or for any loss or damage arising " +
    "from their use.",
};

// The model Open-Meteo serves as Météo-France's is the global product of Copernicus Marine,
// whose licence asks for these words and the product's DOI.
const MFWAM = {
  credit: {
    text: "Wave forecast from Météo-France, generated using E.U. Copernicus Marine Service Information",
    url: "https://doi.org/10.48670/moi-00017",
  },
  notice: null,
};

// Asked best first: the first that has a sea at the point answers. The order is the one they
// came in against the buoys. Météo-France's has no peak period at Open-Meteo: its period is a
// mean one, which reads more than a second lower.
export const WAVE_MODELS = [
  { id: "ecmwf_wam", name: "ECMWF WAM", producer: "ECMWF", resolutionKilometers: 9, ...ECMWF },
  { id: "ecmwf_wam025", name: "ECMWF WAM", producer: "ECMWF", resolutionKilometers: 25, ...ECMWF },
  {
    id: "meteofrance_wave",
    name: "MFWAM",
    producer: "Météo-France",
    resolutionKilometers: 8,
    ...MFWAM,
  },
] as const;

export type WaveModel = (typeof WAVE_MODELS)[number];
export type WaveModelId = WaveModel["id"];

export const waveModelIds = WAVE_MODELS.map((model) => model.id) as [WaveModelId, ...WaveModelId[]];

export function waveModel(id: WaveModelId): WaveModel {
  return WAVE_MODELS.find((model) => model.id === id) ?? WAVE_MODELS[0];
}

// Open-Meteo's licence page asks for these words as a link beside its data, and for a link to
// the licence. Its marine API asks every user for a clear credit to DWD beside its own, whatever
// model answers: the credit says who asks, since no value shown is DWD's.
const PROVIDER: Credit[] = [
  { text: "Weather data by Open-Meteo.com", url: "https://open-meteo.com/" },
  { text: "CC BY 4.0", url: CC_BY },
  {
    text: "Credit asked by Open-Meteo's marine API: German Weather Service DWD",
    url: "https://www.dwd.de/EN/service/copyright/copyright_node.html",
  },
];

/**
 * Who a forecast is credited to: Open-Meteo, which serves it, and whoever produced the wave
 * models given. `credits` are the links to show beside the data, `notice` what a producer asks
 * to be said with them, and `attribution` the whole as one text, for where no link can be made.
 */
export function forecastSource(models: readonly WaveModelId[]) {
  const producers = [...new Map(models.map((id) => [waveModel(id).producer, waveModel(id)]))].map(
    ([, model]) => model,
  );
  const credits = [...PROVIDER, ...producers.map((model) => model.credit)];
  const notice =
    producers.flatMap((model) => (model.notice === null ? [] : [model.notice])).join(" ") || null;
  return {
    name: "Open-Meteo",
    url: "https://open-meteo.com/",
    attribution: [...credits.map((credit) => `${credit.text} (${credit.url}).`), notice]
      .filter((part) => part !== null)
      .join(" "),
    // The data is CC BY 4.0. The free API that serves it is for non-commercial use only.
    license: { type: "cc-by-4.0", url: CC_BY, commercialUse: false },
    credits,
    notice,
  };
}

// The credit of what covers several points, such as an alert on several spots: every producer a
// wave forecast may come from.
export const FORECAST_SOURCE = forecastSource(waveModelIds);
