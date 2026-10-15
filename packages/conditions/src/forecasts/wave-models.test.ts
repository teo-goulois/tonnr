import { describe, expect, it } from "vitest";

import { FORECAST_SOURCE, forecastSource } from "./wave-models";

describe("who a forecast is credited to", () => {
  it("links to the provider and its licence, and credits DWD as the provider asks", () => {
    const { credits } = forecastSource([]);

    expect(credits[0]).toEqual({
      text: "Weather data by Open-Meteo.com",
      url: "https://open-meteo.com/",
    });
    expect(credits[1]).toEqual({
      text: "CC BY 4.0",
      url: "https://creativecommons.org/licenses/by/4.0/",
    });
    expect(credits[2]?.text).toContain("German Weather Service DWD");
    expect(credits[2]?.url).toContain("dwd.de");
    // No producer is named for a point without a sea.
    expect(credits).toHaveLength(3);
    expect(forecastSource([]).notice).toBeNull();
  });

  it("credits ECMWF in the words its terms give, with its licence and its disclaimer", () => {
    const source = forecastSource(["ecmwf_wam"]);

    expect(source.credits.at(-1)).toEqual({
      text: "This service is based on data and products of the European Centre for Medium-Range Weather Forecasts (ECMWF)",
      url: "https://www.ecmwf.int/",
    });
    expect(source.notice).toContain("Creative Commons Attribution 4.0 International (CC BY 4.0)");
    expect(source.notice).toContain(
      "ECMWF does not accept any liability whatsoever for any error or omission in the data",
    );
  });

  it("credits a producer once, whatever the number of its models", () => {
    expect(forecastSource(["ecmwf_wam", "ecmwf_wam025"]).credits).toHaveLength(4);
  });

  it("credits Météo-France's model with the words and the DOI of Copernicus Marine", () => {
    const source = forecastSource(["meteofrance_wave"]);

    expect(source.credits.at(-1)).toEqual({
      text: "Wave forecast from Météo-France, generated using E.U. Copernicus Marine Service Information",
      url: "https://doi.org/10.48670/moi-00017",
    });
    expect(source.notice).toBeNull();
  });

  it("says the whole as one text, with every address, for where no link can be made", () => {
    const { attribution, credits, notice } = forecastSource(["ecmwf_wam"]);

    for (const credit of credits) expect(attribution).toContain(`${credit.text} (${credit.url}).`);
    expect(attribution.endsWith(notice ?? "")).toBe(true);
  });

  it("names every producer for what covers several points", () => {
    const texts = FORECAST_SOURCE.credits.map((credit) => credit.text).join(" ");

    expect(texts).toContain("ECMWF");
    expect(texts).toContain("Météo-France");
    expect(texts).toContain("DWD");
  });
});

describe("the credit of a forecast read from the files", () => {
  it("names the producers of the weather beside the wave models'", () => {
    const source = forecastSource(
      ["meteofrance_wave", "ecmwf_wam025"],
      ["Météo-France", "NOAA", "DWD"],
    );
    expect(source.credits.map((credit) => credit.text)).toEqual([
      "Weather data by Open-Meteo.com",
      "CC BY 4.0",
      "Credit asked by Open-Meteo: German Weather Service DWD",
      "Wave forecast from Météo-France, generated using E.U. Copernicus Marine Service Information",
      "This service is based on data and products of the European Centre for Medium-Range Weather Forecasts (ECMWF)",
      "Weather forecast from Météo-France",
      "Weather forecast from NOAA",
    ]);
    expect(source.notice).toContain("ECMWF");
  });
});
