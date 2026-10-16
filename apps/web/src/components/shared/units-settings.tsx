import { Tabs, TabsList, TabsTab } from "@repo/ui/components/ui/tabs";

import {
  UNIT_CHOICES,
  type Units,
  distanceUnit,
  heightUnit,
  rainUnit,
  temperatureUnit,
  useUnits,
  windUnit,
} from "@/lib/units";
import { m } from "@/paraglide/messages.js";

import { useSaveUnits } from "./units-account";

// Each measurement that has a choice, with what it is called.
const MEASURES: { measure: keyof Units; label: () => string }[] = [
  { measure: "windSpeed", label: m.units_wind_speed },
  { measure: "height", label: m.units_height },
  { measure: "temperature", label: m.units_temperature },
  { measure: "distance", label: m.units_distance },
  { measure: "precipitation", label: m.units_precipitation },
];

// A unit as it is written after a figure.
function nameOf<Measure extends keyof Units>(measure: Measure, unit: Units[Measure]) {
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

/**
 * The choice of one measurement's unit, as a segmented control: a press changes every screen at
 * once, and the browser keeps the choice, with the account when one is signed in. The settings
 * draw one for each measurement, and a demo of the guides one beside its figure (decision 060).
 */
export function UnitTabs({ measure }: { measure: keyof Units }) {
  const units = useUnits();
  const saveUnits = useSaveUnits();
  const label = MEASURES.find((one) => one.measure === measure)!.label();
  return (
    <Tabs
      value={units[measure]}
      onValueChange={(value) => saveUnits({ [measure]: value } as Partial<Units>)}
    >
      <TabsList variant="segment" aria-label={label}>
        {UNIT_CHOICES[measure].map((unit) => (
          <TabsTab key={unit} value={unit}>
            {nameOf(measure, unit)}
          </TabsTab>
        ))}
      </TabsList>
    </Tabs>
  );
}

/**
 * Where the reader chooses the unit each measurement is written in: a line for each, in the
 * account's settings.
 */
export function UnitsSettings() {
  return (
    <ul className="grid gap-s">
      {MEASURES.map(({ measure, label }) => (
        // A phone that is too narrow for a line puts the choices under their name.
        <li key={measure} className="flex flex-wrap items-center justify-between gap-x-s gap-y-xxs">
          <span>{label()}</span>
          <UnitTabs measure={measure} />
        </li>
      ))}
    </ul>
  );
}
