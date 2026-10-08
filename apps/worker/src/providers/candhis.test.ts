import { describe, expect, it } from "vitest";

import { parseCampaignPage, parseRealTimeCampaigns } from "./candhis";
import { FormatError } from "./format-error";

const mapPage = `<script>
  var lCampBDDPHP = [["00601","Nice","1","AUCUNE","43.6349182","7.2290835","270","Houlographe Datawell DWR MkIII","TOTALE","111080","04\\/06\\/2002 14:00","07\\/03\\/2016 08:00"],["06403","Saint-Jean-de-Luz","1","TOTALE","43.4083328","-1.6816670","20","Houlographe Datawell DWR MkIII","TOTALE","320781","15\\/12\\/2006 11:30","31\\/08\\/2026 23:30"],["08504","Ile d'Yeu Nord","0","TOTALE","46.8333321","-2.2950001","14","Houlographe Datawell DWR","TOTALE","20152","09\\/01\\/2005 09:00","31\\/08\\/2026 23:30"]];
  var sCampPHP = [{"sNum":"00601","sNom":"Nice","sTyp":"","iTyp":2},{"sNum":"06403","sNom":"Saint-Jean-de-Luz","sTyp":" [TR]","iTyp":3},{"sNum":"08504","sNom":"Ile d'Yeu Nord","sTyp":" [TR]","iTyp":3}];
  var other = 1;
</script>`;

const legends = `var arrLegNomPHP = JSON.parse('[["H1\\/3 (m)","Hmax (m)","Th1\\/3 (s)","T. au pic (s)","Temp. mer (\\u00b0C)"],["Hm0 (m)","Hmax (m)","T02 (s)","Dir. au pic (\\u00b0)","Temp. mer (\\u00b0C)"],["H1\\/3 (m)","Hmax (m)","Th1\\/3 (s)","Dir. au pic (\\u00b0)","Etal. au pic (\\u00b0)","Temp. mer (\\u00b0C)"]]');`;

// A directional buoy: format 2, with direction and spread.
const directionalPage = `<script>
arrDataPHP = new Array(5);
arrDataPHP[0] = eval('[["2026-10-08 07:00",3.1,"<small>H1\\/3<\\/small>",5.3,"<small>Hmax<\\/small>"],["2026-10-08 06:30",2.9,"<small>H1\\/3<\\/small>",null,"<small>Hmax<\\/small>"]]');
arrDataPHP[1] = eval('[["2026-10-08 07:00",8.8,"<small>Th1\\/3<\\/small>"],["2026-10-08 06:30",8.6,"<small>Th1\\/3<\\/small>"]]');
arrDataPHP[2] = eval('[["2026-10-08 07:00",328,"<small>Dir<\\/small>"]]');
arrDataPHP[3] = eval('[["2026-10-08 07:00",19,"<small>Etal<\\/small>"]]');
arrDataPHP[4] = eval('[["2026-10-08 07:00",20.9,"<small>Temp<\\/small>"]]');
var fmtPHP = parseInt(eval('2'));
${legends}
var titCampPHP = eval('"Campagne  06403 Saint-Jean-de-Luz"');
var titPartPHP = eval('"D\\u00e9partement des Pyr\\u00e9n\\u00e9es-Atlantiques - Cerema"');
</script>`;

// A non-directional buoy: format 0, with a peak period in place of the direction.
const nonDirectionalPage = `<script>
arrDataPHP[0] = eval('[["2026-10-08 07:00",1.2,"<small>H<\\/small>",2.3,"<small>Hmax<\\/small>"]]');
arrDataPHP[1] = eval('[["2026-10-08 07:00",5.9,"<small>Th<\\/small>"]]');
arrDataPHP[2] = eval('[["2026-10-08 07:00",10,"<small>Tp<\\/small>"]]');
arrDataPHP[3] = eval('[["2026-10-08 07:00",17.9,"<small>Temp<\\/small>"]]');
arrDataPHP[4] = eval('[]');
var fmtPHP = parseInt(eval('0'));
${legends}
var titPartPHP = eval('"Conseil D\\u00e9partemental de la Vend\\u00e9e - l\\'Ile d\\'Yeu - Cerema"');
</script>`;

function expectParsed<T>(result: T | FormatError): T {
  if (result instanceof FormatError) throw result;
  return result;
}

describe("parseRealTimeCampaigns", () => {
  it("returns the real-time campaigns with their position", () => {
    expect(expectParsed(parseRealTimeCampaigns(mapPage))).toEqual([
      { id: "06403", name: "Saint-Jean-de-Luz", latitude: 43.4083328, longitude: -1.681667 },
      { id: "08504", name: "Ile d'Yeu Nord", latitude: 46.8333321, longitude: -2.2950001 },
    ]);
  });

  it("reports a page without the campaign list", () => {
    expect(parseRealTimeCampaigns("<html></html>")).toBeInstanceOf(FormatError);
  });
});

describe("parseCampaignPage", () => {
  it("merges the series of a directional buoy into one reading per time", () => {
    const { readings } = expectParsed(parseCampaignPage(directionalPage, "06403"));

    expect(readings).toEqual([
      {
        providerStationId: "06403",
        observedAt: new Date("2026-10-08T07:00:00Z"),
        significantHeightM: 3.1,
        maxHeightM: 5.3,
        significantPeriodS: 8.8,
        peakDirectionDeg: 328,
        directionalSpreadDeg: 19,
        waterTemperatureC: 20.9,
      },
      {
        providerStationId: "06403",
        observedAt: new Date("2026-10-08T06:30:00Z"),
        significantHeightM: 2.9,
        significantPeriodS: 8.6,
      },
    ]);
  });

  it("reads the peak period of a non-directional buoy", () => {
    const { readings } = expectParsed(parseCampaignPage(nonDirectionalPage, "08504"));

    expect(readings).toEqual([
      {
        providerStationId: "08504",
        observedAt: new Date("2026-10-08T07:00:00Z"),
        significantHeightM: 1.2,
        maxHeightM: 2.3,
        significantPeriodS: 5.9,
        peakPeriodS: 10,
        waterTemperatureC: 17.9,
      },
    ]);
  });

  it("returns the partners to credit, apostrophes included", () => {
    expect(expectParsed(parseCampaignPage(directionalPage, "06403")).partners).toBe(
      "Département des Pyrénées-Atlantiques - Cerema",
    );
    expect(expectParsed(parseCampaignPage(nonDirectionalPage, "08504")).partners).toBe(
      "Conseil Départemental de la Vendée - l'Ile d'Yeu - Cerema",
    );
  });

  it("reports data in a series that has no label", () => {
    const page = nonDirectionalPage.replace(
      "arrDataPHP[4] = eval('[]');",
      `arrDataPHP[4] = eval('[["2026-10-08 07:00",42,"<small>?<\\/small>"]]');`,
    );

    expect(parseCampaignPage(page, "08504")).toBeInstanceOf(FormatError);
  });

  it("reports a page whose data is no longer where it was", () => {
    const page = directionalPage.replaceAll("arrDataPHP[", "newDataPHP[");

    expect(parseCampaignPage(page, "06403")).toBeInstanceOf(FormatError);
  });

  it("rejects a reading dated on a day that does not exist", () => {
    const page = directionalPage.replaceAll("2026-10-08 06:30", "2026-02-31 06:30");
    const { readings, rejected } = expectParsed(parseCampaignPage(page, "06403"));

    expect(rejected).toBe(1);
    expect(readings.map((reading) => reading.observedAt.toISOString())).toEqual([
      "2026-10-08T07:00:00.000Z",
    ]);
  });

  it("ignores a value that is not a finite number", () => {
    const page = directionalPage.replace('"2026-10-08 07:00",3.1,', '"2026-10-08 07:00",1e999,');
    const [reading] = expectParsed(parseCampaignPage(page, "06403")).readings;

    expect(reading?.significantHeightM).toBeUndefined();
    expect(reading?.maxHeightM).toBe(5.3);
  });

  it("ignores a value the sea cannot produce", () => {
    const page = directionalPage.replace('"2026-10-08 07:00",3.1,', '"2026-10-08 07:00",1e39,');
    const [reading] = expectParsed(parseCampaignPage(page, "06403")).readings;

    expect(reading?.significantHeightM).toBeUndefined();
    expect(reading?.maxHeightM).toBe(5.3);
  });

  it("reports a series it does not know instead of guessing", () => {
    const page = directionalPage.replace("Etal. au pic", "Nouvelle mesure");

    expect(parseCampaignPage(page, "06403")).toBeInstanceOf(FormatError);
  });
});
