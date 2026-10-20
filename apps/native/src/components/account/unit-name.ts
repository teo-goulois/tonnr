import {
  distanceUnit,
  heightUnit,
  rainUnit,
  temperatureUnit,
  type Units,
  windUnit,
} from "@/lib/units";

/** A unit as it is written after a figure: "kn", "km/h", "°C". */
export function unitName<Measure extends keyof Units>(measure: Measure, unit: Units[Measure]) {
  switch (measure) {
    case "windSpeed":
      return windUnit(unit as Units["windSpeed"]);
    case "height":
      return heightUnit(unit as Units["height"]);
    case "temperature":
      return temperatureUnit(unit as Units["temperature"]);
    case "distance":
      return distanceUnit(unit as Units["distance"]);
    default:
      return rainUnit(unit as Units["precipitation"]);
  }
}
