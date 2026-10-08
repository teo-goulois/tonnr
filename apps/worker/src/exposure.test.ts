import { describe, expect, it } from "vitest";

import { classifyExposure, type DailyHeight, type Site } from "./exposure";

// Twelve buoys along an open coast, a few kilometres apart, and one site up an estuary.
const coast: Site[] = Array.from({ length: 12 }, (_, index) => ({
  id: `sea-${index}`,
  latitude: 51.5 + index * 0.03,
  longitude: 3,
}));
const estuary: Site = { id: "estuary", latitude: 51.45, longitude: 3.6 };

function day(date: string, seaM: number, others: Record<string, number> = {}): DailyHeight[] {
  return [
    ...coast.map((site) => ({ stationId: site.id, day: date, heightM: seaM })),
    ...Object.entries(others).map(([stationId, heightM]) => ({ stationId, day: date, heightM })),
  ];
}

describe("classifyExposure", () => {
  it("calls a site sheltered when it stays low on a rough day among many neighbours", () => {
    const exposures = classifyExposure(
      [...coast, estuary],
      day("2026-10-08", 2.8, { estuary: 0.15 }),
    );

    expect(exposures.get("estuary")).toBe("sheltered");
    expect(coast.every((site) => exposures.get(site.id) === "open")).toBe(true);
  });

  it("says nothing on calm days, when a low site looks like every other", () => {
    const exposures = classifyExposure(
      [...coast, estuary],
      day("2026-10-06", 0.4, { estuary: 0.05 }),
    );

    expect(exposures.size).toBe(0);
  });

  it("calls a site open as soon as one rough day reaches half its neighbours' waves", () => {
    // In the lee of the land for the first swell, in the open for the second.
    const exposures = classifyExposure(
      [...coast, estuary],
      [...day("2026-10-08", 2.8, { estuary: 0.3 }), ...day("2026-10-12", 2.2, { estuary: 1.9 })],
    );

    expect(exposures.get("estuary")).toBe("open");
  });

  it("does not call a site sheltered when one rough day was not low enough", () => {
    const exposures = classifyExposure(
      [...coast, estuary],
      [...day("2026-10-08", 2.8, { estuary: 0.15 }), ...day("2026-10-12", 2, { estuary: 0.7 })],
    );

    expect(exposures.has("estuary")).toBe(false);
  });

  it("does not call a site sheltered with few neighbours, where a low day proves little", () => {
    const few = coast.slice(0, 4);
    const heights = day("2026-10-08", 2.8, { estuary: 0.15 }).filter(
      (height) =>
        height.stationId === "estuary" || few.some((site) => site.id === height.stationId),
    );
    const exposures = classifyExposure([...few, estuary], heights);

    expect(exposures.has("estuary")).toBe(false);
    expect(few.every((site) => exposures.get(site.id) === "open")).toBe(true);
  });

  it("looks only at the neighbours within sixty kilometres", () => {
    const far: Site = { id: "far", latitude: 53.5, longitude: 3 };
    const exposures = classifyExposure([...coast, far], day("2026-10-08", 2.8, { far: 0.1 }));

    expect(exposures.has("far")).toBe(false);
  });

  it("is not fooled by a group of sheltered sites next to each other", () => {
    const basin: Site[] = Array.from({ length: 5 }, (_, index) => ({
      id: `basin-${index}`,
      latitude: 51.45 + index * 0.01,
      longitude: 3.6,
    }));
    const low = Object.fromEntries(basin.map((site) => [site.id, 0.2]));
    const exposures = classifyExposure([...coast, ...basin], day("2026-10-08", 2.8, low));

    expect(basin.every((site) => exposures.get(site.id) === "sheltered")).toBe(true);
    expect(coast.every((site) => exposures.get(site.id) === "open")).toBe(true);
  });

  it("leaves out a station with no reading in the window", () => {
    const silent: Site = { id: "silent", latitude: 51.6, longitude: 3.1 };
    const exposures = classifyExposure([...coast, silent], day("2026-10-08", 2.8));

    expect(exposures.has("silent")).toBe(false);
  });
});
