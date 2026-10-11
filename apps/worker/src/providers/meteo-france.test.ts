import { describe, expect, it } from "vitest";

import { FormatError } from "./format-error";
import {
  mergeSnapshots,
  parseObservations,
  parseStationNames,
  slotsToAsk,
  stationName,
} from "./meteo-france";

const LIST = [
  "Id_station;Id_omm;Nom_usuel;Latitude;Longitude;Altitude;Date_ouverture;Pack",
  "29168001;07103;PTE DU RAZ;48.038833;-4.732000;67;1893-01-01;ETENDU",
  "56009001;07207;BELLE ILE-LE TALUT;47.294333;-3.218333;37;1930-04-01;ETENDU",
  "",
].join("\n");

// An entry of the package, with the fields a station on land sends.
function entry(overrides: Record<string, unknown> = {}) {
  return {
    lat: 48.038833,
    lon: -4.732,
    geo_id_insee: "29168001",
    reference_time: "2026-10-11T18:09:08Z",
    insert_time: "2026-10-11T18:08:08Z",
    validity_time: "2026-10-11T18:06:00Z",
    t: 287.45,
    td: 284.15,
    u: 80,
    dd: 190,
    ff: 7.4,
    ddraf10: 200,
    raf10: 10.9,
    rr_per: 0,
    pres: null,
    pmer: null,
    ...overrides,
  };
}

function names() {
  const read = parseStationNames(LIST);
  if (read instanceof FormatError) throw read;
  return read;
}

function parse(json: unknown[]) {
  const snapshot = parseObservations(json, names());
  if (snapshot instanceof FormatError) throw snapshot;
  return snapshot;
}

describe("slotsToAsk", () => {
  it("asks for the moment whose package is out, and for the one before", () => {
    expect(slotsToAsk(new Date("2026-10-11T18:10:20Z"))).toEqual([
      new Date("2026-10-11T18:06:00Z"),
      new Date("2026-10-11T18:00:00Z"),
    ]);
  });

  it("waits three and a half minutes for a moment's package", () => {
    const [before] = slotsToAsk(new Date("2026-10-11T18:09:29Z"));
    const [after] = slotsToAsk(new Date("2026-10-11T18:09:30Z"));

    expect(before).toEqual(new Date("2026-10-11T18:00:00Z"));
    expect(after).toEqual(new Date("2026-10-11T18:06:00Z"));
  });
});

describe("stationName", () => {
  it("writes a name in capitals as a place name", () => {
    expect(stationName("PTE DU RAZ")).toBe("Pte du Raz");
    expect(stationName("MONT-DE-MARSAN")).toBe("Mont-de-Marsan");
    expect(stationName("CREON D'ARMAGNAC")).toBe("Creon d'Armagnac");
    expect(stationName("BUSTINCE - ST JEAN")).toBe("Bustince - St Jean");
  });

  it("keeps the capital of a name's first word, and reads an underscore as a space", () => {
    expect(stationName("LA BALME SUR CERDON_SAPC")).toBe("La Balme sur Cerdon Sapc");
    expect(stationName("L'ILE D'YEU")).toBe("L'Ile d'Yeu");
    expect(stationName("BELLE-ILE_AERO")).toBe("Belle-Ile Aero");
  });
});

describe("parseStationNames", () => {
  it("gives the name of each station by its number", () => {
    expect([...names()]).toEqual([
      ["29168001", "PTE DU RAZ"],
      ["56009001", "BELLE ILE-LE TALUT"],
    ]);
  });

  it("refuses a list without the columns it reads", () => {
    expect(parseStationNames("<html></html>")).toBeInstanceOf(FormatError);
    expect(parseStationNames("Id_station;Latitude\n29168001;48.03\n")).toBeInstanceOf(FormatError);
  });
});

describe("parseObservations", () => {
  it("turns a station into a wind reading in metres per second", () => {
    const { stations, readings, rejected } = parse([entry()]);

    expect(stations).toEqual([
      {
        providerStationId: "29168001",
        name: "Pte du Raz",
        latitude: 48.038833,
        longitude: -4.732,
        licenseType: "etalab-2.0",
        licenseUrl: "https://www.etalab.gouv.fr/licence-ouverte-open-licence/",
        attribution: "Météo-France",
        commercialUse: true,
      },
    ]);
    expect(readings).toEqual([
      {
        providerStationId: "29168001",
        observedAt: new Date("2026-10-11T18:06:00Z"),
        windSpeedMs: 7.4,
        windGustMs: 10.9,
        windDirectionDeg: 190,
      },
    ]);
    expect(rejected).toBe(0);
  });

  it("leaves out a station that sent no wind speed", () => {
    const noWind = entry({ geo_id_insee: "01027003", dd: null, ff: null, raf10: null });

    expect(parse([noWind])).toEqual({ stations: [], readings: [], rejected: 0 });
  });

  it("gives no direction to a calm wind, and keeps 360 for the north", () => {
    const calm = entry({ dd: 0, ff: 0, raf10: 0 });
    const north = entry({ geo_id_insee: "56009001", dd: 360 });

    const { readings } = parse([calm, north]);

    expect(readings.map((reading) => reading.windDirectionDeg)).toEqual([null, 360]);
    expect(readings[0]).toMatchObject({ windSpeedMs: 0, windGustMs: 0 });
  });

  it("keeps a wind speed whose gust or direction is missing", () => {
    const { readings } = parse([entry({ dd: null, raf10: null })]);

    expect(readings).toEqual([
      {
        providerStationId: "29168001",
        observedAt: new Date("2026-10-11T18:06:00Z"),
        windSpeedMs: 7.4,
        windGustMs: null,
        windDirectionDeg: null,
      },
    ]);
  });

  it("names a station the list does not hold by its number", () => {
    const { stations } = parse([entry({ geo_id_insee: "97502001" })]);

    expect(stations[0]?.name).toBe("Station 97502001");
  });

  it("rejects an entry it cannot place, date or measure", () => {
    const { stations, rejected } = parse([
      "29168001",
      entry({ geo_id_insee: 29168001 }),
      entry({ lat: null }),
      entry({ lat: 148.03 }),
      entry({ validity_time: "2026-02-31T18:06:00Z" }),
      entry({ validity_time: "2026-10-11 18:06" }),
      entry({ ff: 740 }),
      entry({ ff: -1 }),
    ]);

    expect(stations).toEqual([]);
    expect(rejected).toBe(8);
  });

  it("reads an empty package as a moment that is not out yet", () => {
    expect(parse([])).toEqual({ stations: [], readings: [], rejected: 0 });
  });

  it("refuses an answer that is not a list", () => {
    expect(parseObservations({ code: 900908 }, names())).toBeInstanceOf(FormatError);
  });
});

describe("mergeSnapshots", () => {
  it("keeps each station once and every reading", () => {
    const latest = parse([entry()]);
    const previous = parse([
      entry({ validity_time: "2026-10-11T18:00:00Z", ff: 6.1 }),
      entry({ geo_id_insee: "56009001", validity_time: "2026-10-11T18:00:00Z" }),
      "not an entry",
    ]);

    const merged = mergeSnapshots([latest, previous]);

    expect(merged.stations.map((station) => station.providerStationId)).toEqual([
      "29168001",
      "56009001",
    ]);
    expect(
      merged.readings.map((reading) => [reading.providerStationId, reading.windSpeedMs]),
    ).toEqual([
      ["29168001", 7.4],
      ["29168001", 6.1],
      ["56009001", 7.4],
    ]);
    expect(merged.rejected).toBe(1);
  });
});
