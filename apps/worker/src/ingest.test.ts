import { describe, expect, it } from "vitest";

import { providersOf, retiredProviderIdsOf } from "./ingest";

const ids = (keys: Parameters<typeof providersOf>[0]) =>
  providersOf(keys).map((provider) => provider.id);

describe("providersOf", () => {
  it("leaves out a provider that asks for a key the instance does not hold", () => {
    expect(ids({})).not.toContain("meteofrance");
    expect(ids({ METEO_FRANCE_API_KEY: undefined })).not.toContain("meteofrance");
    expect(ids({})).toContain("ndbc");
  });

  it("fetches from it once the instance holds the key", () => {
    expect(ids({ METEO_FRANCE_API_KEY: "a-key" })).toContain("meteofrance");
  });

  it("fetches from AEMET with its own key, and from Météo-France without it", () => {
    expect(ids({})).not.toContain("aemet");
    expect(ids({ AEMET_API_KEY: "a-key" })).toContain("aemet");
    expect(ids({ AEMET_API_KEY: "a-key" })).not.toContain("meteofrance");
  });

  it("names each provider once", () => {
    const all = ids({ AEMET_API_KEY: "a-key", METEO_FRANCE_API_KEY: "a-key" });

    expect(new Set(all).size).toBe(all.length);
  });
});

describe("retiredProviderIdsOf", () => {
  it("retires the queue of a provider whose key the instance does not hold", () => {
    expect(retiredProviderIdsOf({})).toContain("meteofrance");
    expect(retiredProviderIdsOf({ METEO_FRANCE_API_KEY: "a-key" })).not.toContain("meteofrance");
  });

  it("retires AEMET's queue on an instance without its key", () => {
    expect(retiredProviderIdsOf({})).toContain("aemet");
    expect(retiredProviderIdsOf({ AEMET_API_KEY: "a-key" })).not.toContain("aemet");
  });

  it("never retires a provider the instance fetches from", () => {
    for (const keys of [{}, { METEO_FRANCE_API_KEY: "a-key" }, { AEMET_API_KEY: "a-key" }]) {
      const fetched = ids(keys);

      expect(retiredProviderIdsOf(keys).filter((id) => fetched.includes(id))).toEqual([]);
    }
  });
});
