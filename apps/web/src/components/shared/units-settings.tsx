import { Dialog, DialogDescription, DialogPopup, DialogTitle } from "@repo/ui/components/ui/dialog";
import { Tabs, TabsList, TabsTab } from "@repo/ui/components/ui/tabs";
import { useSyncExternalStore } from "react";

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

// A module-level store, so that the account's menu and the command palette can open the dialog.
let isOpen = false;
const listeners = new Set<() => void>();

function setOpen(next: boolean) {
  isOpen = next;
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function openUnitsSettings() {
  setOpen(true);
}

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

/** The units in force, one after the other, for a menu that says them in a line: "kn · m · °C". */
export function unitsInALine(units: Units) {
  return [
    windUnit(units.windSpeed),
    heightUnit(units.height),
    temperatureUnit(units.temperature),
  ].join(" · ");
}

/**
 * The dialog where the reader chooses the unit each measurement is written in. A press changes
 * every screen at once, and the account keeps the choice.
 */
export function UnitsSettings() {
  const open = useSyncExternalStore(
    subscribe,
    () => isOpen,
    () => false,
  );
  const units = useUnits();
  const saveUnits = useSaveUnits();

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogPopup className="w-full max-w-md gap-l p-l">
        <div className="grid gap-xs">
          <DialogTitle>{m.units_title()}</DialogTitle>
          <DialogDescription>{m.units_description()}</DialogDescription>
        </div>
        <ul className="grid gap-s">
          {MEASURES.map(({ measure, label }) => (
            <li key={measure} className="flex items-center justify-between gap-s">
              <span>{label()}</span>
              <Tabs
                value={units[measure]}
                onValueChange={(value) => saveUnits({ [measure]: value } as Partial<Units>)}
              >
                <TabsList variant="segment" aria-label={label()}>
                  {UNIT_CHOICES[measure].map((unit) => (
                    <TabsTab key={unit} value={unit}>
                      {nameOf(measure, unit)}
                    </TabsTab>
                  ))}
                </TabsList>
              </Tabs>
            </li>
          ))}
        </ul>
      </DialogPopup>
    </Dialog>
  );
}
