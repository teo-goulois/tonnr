import { describe, expect, it } from "vitest";

import { readCapabilities, readLegend, WaveMapFormatError } from "./copernicus-wave-map";

const PRODUCT = "GLOBAL_ANALYSISFORECAST_WAV_001_027";
const DATASET = "cmems_mod_glo_wav_anfc_0.083deg_PT3H-i_202411";
const WAVE_HEIGHT = `${PRODUCT}/${DATASET}/VHM0`;
const SWELL_HEIGHT = `${PRODUCT}/${DATASET}/VHM0_SW1`;
const BATHYMETRY = `${PRODUCT}/cmems_mod_wav_anfc_0.083deg_static_202211--ext--bathy/deptho`;

const TIMES = "2022-11-01T03:00:00Z/2026-10-18T00:00:00Z/PT10800S";
const UPDATED = "2026-10-08T10:16:08.088Z";

type LayerParts = { times?: string; updated?: string; format?: string; matrixSet?: string };

// One layer of the capabilities of 2026-10-08, cut down to the elements the parser reads and to
// one of each kind it must pass over: a style and a matrix set link have an identifier too.
function layer(id: string, parts: LayerParts = {}) {
  const { times = TIMES, updated = UPDATED, format = "image/png", matrixSet = "EPSG:3857" } = parts;
  return `<Layer queryable="1">
    <ows:Identifier>${id}</ows:Identifier>
    <ows:Title>${id.split("/")[1]} - ${id.split("/")[2]}</ows:Title>
    <Style isDefault="true">
      <ows:Identifier>cmap:amp</ows:Identifier>
      <ows:Title>Linear scale</ows:Title>
      <LegendURL format="application/json" xlink:href="https://wmts.marine.copernicus.eu/teroWmts?SERVICE=WMTS&amp;REQUEST=GetLegend&amp;STYLE=cmap%3Aamp"/>
    </Style>
    <Format>${format}</Format>
    <InfoFormat>application/json</InfoFormat>
    <Dimension>
      <ows:Identifier>time</ows:Identifier>
      <ows:UOM>ISO8601</ows:UOM>
      <Default>2026-10-08T18:00:00.000Z</Default>
      <Value>${times}</Value>
    </Dimension>
    <ows:Metadata>
      <VariableInformation><Id>${id.split("/")[2]}</Id><Unit>m</Unit></VariableInformation>
      <DataCubeInformation>
        <admp_updated>2026-10-08T10:16:24.499172Z</admp_updated>
        ${updated && `<admp_updated_data>${updated}</admp_updated_data>`}
      </DataCubeInformation>
    </ows:Metadata>
    <TileMatrixSetLink><TileMatrixSet>${matrixSet}</TileMatrixSet></TileMatrixSetLink>
    <TileMatrixSetLink><TileMatrixSet>${matrixSet}@2x</TileMatrixSet></TileMatrixSetLink>
  </Layer>`;
}

// The service has matrices 0 to 10, each a square of 2^zoom tiles.
const ZOOMS = Array.from({ length: 11 }, (_, zoom) => zoom);

function matrix(zoom: number, tileSize = 256, width = 2 ** zoom) {
  return `<TileMatrix>
    <ows:Identifier>${zoom}</ows:Identifier>
    <ScaleDenominator>${559082264.0287178 / 2 ** zoom}</ScaleDenominator>
    <TopLeftCorner>-20037508.3428 20037508.3428</TopLeftCorner>
    <TileWidth>${tileSize}</TileWidth>
    <TileHeight>${tileSize}</TileHeight>
    <MatrixWidth>${width}</MatrixWidth>
    <MatrixHeight>${2 ** zoom}</MatrixHeight>
  </TileMatrix>`;
}

function matrixSet(id: string, matrices: string[]) {
  return `<TileMatrixSet>
    <ows:Identifier>${id}</ows:Identifier>
    <ows:SupportedCRS>urn:ogc:def:crs:EPSG::3857</ows:SupportedCRS>
    ${matrices.join("\n")}
  </TileMatrixSet>`;
}

const MATRIX_SETS = [
  matrixSet(
    "EPSG:3857@2x",
    ZOOMS.map((zoom) => matrix(zoom, 512)),
  ),
  matrixSet(
    "EPSG:3857",
    ZOOMS.map((zoom) => matrix(zoom)),
  ),
];

function capabilities(layers: string[], matrixSets = MATRIX_SETS) {
  return `<Capabilities xmlns="http://www.opengis.net/wmts/1.0" xmlns:ows="http://www.opengis.net/ows/1.1" xmlns:xlink="http://www.w3.org/1999/xlink">
  <Contents>
    ${layers.join("\n")}
    ${matrixSets.join("\n")}
  </Contents>
</Capabilities>`;
}

function read(layers: string[], matrixSets = MATRIX_SETS) {
  const map = readCapabilities(capabilities(layers, matrixSets));
  if (map instanceof WaveMapFormatError) throw map;
  return map;
}

describe("readCapabilities", () => {
  it("picks the wave height among the layers of the product", () => {
    const map = read([layer(SWELL_HEIGHT), layer(WAVE_HEIGHT), layer(BATHYMETRY)]);

    expect(map.layer).toBe(WAVE_HEIGHT);
  });

  it("takes the newer dataset when two versions are listed", () => {
    const next = `${PRODUCT}/cmems_mod_glo_wav_anfc_0.083deg_PT3H-i_202703/VHM0`;

    expect(read([layer(next), layer(WAVE_HEIGHT)]).layer).toBe(next);
  });

  it("builds the address of a tile, with the placeholders left for the client", () => {
    expect(read([layer(WAVE_HEIGHT)]).tileUrlTemplate).toBe(
      "https://wmts.marine.copernicus.eu/teroWmts?service=WMTS&version=1.0.0&request=GetTile" +
        "&layer=GLOBAL_ANALYSISFORECAST_WAV_001_027%2Fcmems_mod_glo_wav_anfc_0.083deg_PT3H-i_202411%2FVHM0" +
        "&style=cmap%3Agray%2Crange%3A0%2F10&format=image%2Fpng&tilematrixset=EPSG%3A3857" +
        "&tilematrix={z}&tilerow={y}&tilecol={x}&time={time}" +
        "&updated=2026-10-08T10%3A16%3A08.088Z",
    );
  });

  it("leaves out the moment of the last change when the layer does not give it", () => {
    for (const updated of ["", "yesterday"]) {
      const { tileUrlTemplate } = read([layer(WAVE_HEIGHT, { updated })]);

      expect(tileUrlTemplate).toMatch(/&time=\{time\}$/);
    }
  });

  it("reads the zooms and the size of a tile from the matrix set", () => {
    expect(read([layer(WAVE_HEIGHT)])).toMatchObject({ tileSize: 256, minZoom: 0, maxZoom: 10 });
  });

  it("reads the moments the layer has a field for", () => {
    expect(read([layer(WAVE_HEIGHT)]).times).toEqual({
      start: new Date("2022-11-01T03:00:00Z"),
      end: new Date("2026-10-18T00:00:00Z"),
      stepSeconds: 10_800,
    });
  });

  it("reads a period written in hours", () => {
    const times = "2026-10-08T00:00:00.000Z/2026-10-18T00:00:00.000Z/PT3H";

    expect(read([layer(WAVE_HEIGHT, { times })]).times.stepSeconds).toBe(10_800);
  });

  it("reports a document without the layer", () => {
    const withoutTheLayer = [
      capabilities([layer(SWELL_HEIGHT), layer(BATHYMETRY)]),
      // The same variable in another dataset, and in another product.
      capabilities([layer(`${PRODUCT}/cmems_mod_glo_wav_anfc_0.083deg_PT1H-i_202411/VHM0`)]),
      capabilities([layer(`GLOBAL_MULTIYEAR_WAV_001_032/${DATASET}/VHM0`)]),
      "<html><body>Service unavailable</body></html>",
      "",
    ];

    for (const xml of withoutTheLayer) {
      expect(readCapabilities(xml)).toBeInstanceOf(WaveMapFormatError);
    }
  });

  it("reports times it cannot read", () => {
    const malformed = [
      "",
      "2026-10-08T18:00:00Z",
      "2022-11-01T03:00:00Z/2026-10-18T00:00:00Z",
      "2022-11-01T03:00:00Z/2026-10-18T00:00:00Z/3 hours",
      "2022-11-01T03:00:00Z/2026-10-18T00:00:00Z/PT0S",
      "2022-11-01T03:00:00Z/2026-10-18T00:00:00Z/PT",
      "2022-11-01T03:00:00Z/2026-10-18T00:00:00Z/PT10800S/PT10800S",
      // A day that does not exist, a time with no zone, and a date alone.
      "2022-02-31T03:00:00Z/2026-10-18T00:00:00Z/PT10800S",
      "2022-11-01T03:00:00/2026-10-18T00:00:00/PT10800S",
      "2022-11-01/2026-10-18/PT10800S",
      // An end before the start, and an end that is not one of the moments.
      "2026-10-18T00:00:00Z/2022-11-01T03:00:00Z/PT10800S",
      "2022-11-01T03:00:00Z/2026-10-18T01:00:00Z/PT10800S",
    ];

    for (const times of malformed) {
      const map = readCapabilities(capabilities([layer(WAVE_HEIGHT, { times })]));

      expect(map, times).toBeInstanceOf(WaveMapFormatError);
    }
  });

  it("reports a layer with no time, or with several ranges of time", () => {
    const whole = layer(WAVE_HEIGHT);
    const timeless = whole.replace(/<Dimension>[\s\S]*<\/Dimension>/, "");
    const twice = whole.replace("</Value>", `</Value><Value>${TIMES}</Value>`);

    expect(readCapabilities(capabilities([timeless]))).toBeInstanceOf(WaveMapFormatError);
    expect(readCapabilities(capabilities([twice]))).toBeInstanceOf(WaveMapFormatError);
  });

  it("reports tiles that are not the PNG pyramid of web maps", () => {
    const wholeSet = ZOOMS.map((zoom) => matrix(zoom));
    const changed = [
      capabilities([layer(WAVE_HEIGHT, { format: "image/jpeg" })]),
      capabilities([layer(WAVE_HEIGHT, { matrixSet: "EPSG:4326" })]),
      // No matrix set, no matrix, larger tiles, a zoom twice as wide, and a zoom missing.
      capabilities([layer(WAVE_HEIGHT)], []),
      capabilities([layer(WAVE_HEIGHT)], [matrixSet("EPSG:3857", [])]),
      capabilities([layer(WAVE_HEIGHT)], [matrixSet("EPSG:3857", [matrix(0, 512)])]),
      capabilities([layer(WAVE_HEIGHT)], [matrixSet("EPSG:3857", [matrix(0), matrix(1, 256, 4)])]),
      capabilities([layer(WAVE_HEIGHT)], [matrixSet("EPSG:3857", wholeSet.toSpliced(5, 1))]),
    ];

    for (const xml of changed) {
      expect(readCapabilities(xml)).toBeInstanceOf(WaveMapFormatError);
    }
  });

  it("reports a document cut short", () => {
    const whole = capabilities([layer(WAVE_HEIGHT)]);

    // Inside the layer, then inside the last matrix set, which is the one to read.
    for (const end of [whole.indexOf("</Layer>"), whole.lastIndexOf("</TileMatrixSet>")]) {
      expect(readCapabilities(whole.slice(0, end))).toBeInstanceOf(WaveMapFormatError);
    }
  });
});

// The red of the 256 colors of the gray ramp, from the legend of 2026-10-08. Green and blue
// are within two levels of it.
const GRAY_RAMP = [
  0, 0, 0, 0, 1, 1, 2, 2, 3, 3, 4, 5, 5, 6, 7, 8, 9, 10, 11, 12, 13, 15, 16, 17, 18, 19, 20, 21, 22,
  23, 24, 25, 26, 27, 28, 29, 29, 30, 31, 32, 33, 34, 35, 36, 37, 38, 39, 40, 41, 42, 43, 43, 44,
  45, 46, 47, 48, 49, 50, 51, 52, 53, 53, 54, 55, 56, 57, 58, 59, 60, 61, 62, 62, 63, 64, 65, 66,
  67, 68, 69, 70, 71, 71, 72, 73, 74, 75, 76, 77, 78, 79, 80, 80, 81, 82, 83, 84, 85, 86, 87, 88,
  89, 90, 90, 91, 92, 93, 94, 95, 96, 97, 98, 99, 100, 101, 101, 102, 103, 104, 105, 106, 107, 108,
  109, 110, 111, 112, 113, 114, 115, 115, 116, 117, 118, 119, 120, 121, 122, 123, 124, 125, 126,
  127, 128, 129, 130, 131, 132, 133, 134, 135, 136, 137, 138, 139, 140, 141, 142, 143, 144, 145,
  146, 147, 148, 149, 150, 151, 152, 153, 154, 155, 156, 157, 158, 159, 160, 161, 162, 163, 164,
  165, 166, 167, 168, 170, 171, 172, 173, 174, 175, 176, 177, 178, 179, 180, 182, 183, 184, 185,
  186, 187, 188, 189, 190, 192, 193, 194, 195, 196, 197, 198, 200, 201, 202, 203, 204, 205, 207,
  208, 209, 210, 211, 213, 214, 215, 216, 217, 219, 220, 221, 222, 224, 225, 226, 227, 229, 230,
  231, 232, 234, 235, 236, 238, 239, 240, 242, 243, 244, 245, 247, 248, 249, 251, 252, 254, 255,
];

// The legend of the style `cmap:gray,range:0/10`, cut down to what the parser reads.
function legend(changes: Record<string, unknown> = {}, ramp = GRAY_RAMP) {
  return {
    continuous: {
      clamp: true,
      logScale: false,
      valueMax: 10,
      valueMin: 0,
      variableId: "VHM0",
      cmap: { colorMap: ramp.map((red) => [red, red, red]), brightnessType: "darkToLight" },
      cmapName: "gray",
      units: "m",
      ...changes,
    },
  };
}

function readLevels(json: unknown) {
  const metersByLevel = readLegend(json);
  if (metersByLevel instanceof WaveMapFormatError) throw metersByLevel;
  return metersByLevel;
}

describe("readLegend", () => {
  it("gives each level of red the height of the bins drawn with it", () => {
    const metersByLevel = readLevels(legend());

    expect(metersByLevel).toHaveLength(256);
    // Bin 128 of 256 is drawn with red 114: the middle of the range, where a level read as a
    // share of the range would say 4.47 m.
    expect(metersByLevel[114]).toBe(5.02);
    // Bins 35 and 36 share red 29.
    expect(metersByLevel[29]).toBe(1.406);
    // The first four bins are black, and the last one is every height from 9.96 m up.
    expect(metersByLevel[0]).toBe(0.078);
    expect(metersByLevel[255]).toBe(9.98);
  });

  it("matches the heights the service gave for pixels of its tiles", () => {
    const metersByLevel = readLevels(legend());
    // Red of a pixel and the height GetFeatureInfo gave there, on 2026-10-08 at 18:00 UTC.
    const measured = [
      [11, 0.72],
      [28, 1.34],
      [55, 2.53],
      [80, 3.56],
      [183, 7.68],
      [222, 9.0],
      [238, 9.48],
    ] as const;

    for (const [red, meters] of measured) {
      // A level stands for one bin of 0.04 m, or for two, and the table gives the middle.
      expect(Math.abs((metersByLevel[red] ?? 0) - meters)).toBeLessThanOrEqual(0.04);
    }
  });

  it("gives a level the ramp skips a height between its neighbours'", () => {
    const metersByLevel = readLevels(legend());

    // No color of the ramp has red 14.
    expect(metersByLevel.slice(13, 16)).toEqual([0.801, 0.82, 0.84]);
    expect(metersByLevel).toEqual(metersByLevel.toSorted((a, b) => a - b));
  });

  it("reads a ramp that does not reach both ends", () => {
    const narrow = GRAY_RAMP.map((red) => Math.min(250, Math.max(5, red)));
    const metersByLevel = readLevels(legend({}, narrow));

    expect(metersByLevel[0]).toBe(metersByLevel[5]);
    expect(metersByLevel[255]).toBe(metersByLevel[250]);
  });

  it("reports the colors the service falls back on for a ramp it does not know", () => {
    expect(readLegend(legend({ cmapName: "amp" }))).toBeInstanceOf(WaveMapFormatError);
  });

  it("reports a legend the heights could not be read with", () => {
    const changed = [
      legend({ valueMax: 6.87 }),
      legend({ valueMin: 0.41 }),
      legend({ units: "cm" }),
      legend({ logScale: true }),
      legend({ clamp: false }),
      legend({}, GRAY_RAMP.slice(0, 255)),
      legend({}, GRAY_RAMP.toReversed()),
      legend({}, [...GRAY_RAMP.slice(0, 255), 256]),
      { discrete: {} },
      null,
    ];

    for (const json of changed) {
      expect(readLegend(json)).toBeInstanceOf(WaveMapFormatError);
    }
  });
});
