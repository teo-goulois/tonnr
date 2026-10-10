// PROTOTYPE, to throw away. See spot-editor-prototype.tsx.
//
// Variant C, "in a sentence": the spot is said in one sentence, and each part of it opens what
// changes it. Under the sentence comes its answer: the windows it gives, and what holds it back.

import { Button } from "@repo/ui/components/ui/button";
import { Input } from "@repo/ui/components/ui/input";
import { Popover, PopoverPopup, PopoverTrigger } from "@repo/ui/components/ui/popover";
import { Slider } from "@repo/ui/components/ui/slider";
import { Switch } from "@repo/ui/components/ui/switch";
import { cn } from "@repo/ui/lib/utils";
import type { ReactNode } from "react";

import { CompassDial, HourStrip, countWords, windowWords } from "./parts";
import {
  type Arc,
  type ArcKey,
  type Criteria,
  type CriterionKey,
  type Range,
  type RangeKey,
  KNOT,
  arcWords,
  blockers,
  compass,
  isAnnounced,
  rangeWords,
  t,
} from "./shared";
import type { EditorProps } from "./spot-editor-prototype";

/** A part of the sentence that can be changed. One that says "any" is written lighter. */
function Slot({ words, isSet, children }: { words: string; isSet: boolean; children: ReactNode }) {
  return (
    <Popover>
      <PopoverTrigger
        render={
          <button
            type="button"
            className={cn(
              "cursor-pointer rounded-[6px] px-1 underline decoration-dotted underline-offset-4",
              isSet ? "bg-success-transparent font-medium" : "text-neutral-7",
            )}
          />
        }
      >
        {words}
      </PopoverTrigger>
      <PopoverPopup className="grid w-72 gap-s rounded-(--radius-xs) p-m text-s">
        {children}
      </PopoverPopup>
    </Popover>
  );
}

const LABELS: Record<CriterionKey, () => string> = {
  swellHeightMeters: () => t("The swell's height", "La hauteur de la houle"),
  swellPeriodSeconds: () => t("The swell's period", "La période de la houle"),
  swellDirectionDegrees: () => t("Where the swell comes from", "D’où vient la houle"),
  windSpeedMetersPerSecond: () => t("The wind's speed", "La vitesse du vent"),
  windDirectionDegrees: () => t("Where the wind blows from", "D’où souffle le vent"),
  tideHeightMeters: () => t("The tide's height", "La hauteur de la marée"),
  tideTrend: () => t("The way the tide goes", "Le sens de la marée"),
};

// One notch wider: what the button beside a criterion that holds the spot back does.
function loosen(criteria: Criteria, key: CriterionKey): Criteria {
  if (key === "tideTrend") return { ...criteria, tideTrend: undefined };
  if (key === "swellDirectionDegrees" || key === "windDirectionDegrees") {
    const arc = criteria[key];
    if (!arc) return criteria;
    return { ...criteria, [key]: { from: (arc.from - 15 + 360) % 360, to: (arc.to + 15) % 360 } };
  }
  const range = criteria[key];
  if (!range) return criteria;
  const step = key === "swellPeriodSeconds" ? 1 : 0.2;
  const near = (value: number) => Math.round(value * 10) / 10;
  return {
    ...criteria,
    [key]: {
      ...(range.min === undefined ? {} : { min: near(Math.max(0, range.min - step)) }),
      ...(range.max === undefined ? {} : { max: near(range.max + step) }),
    },
  };
}

export function VariantC({
  draft,
  onDraft,
  onCriteria,
  judged,
  tide,
  place,
  footer,
  onSave,
}: EditorProps) {
  const { criteria } = draft;
  const now = judged.hours[0];

  function range(
    key: RangeKey,
    unit: string,
    [low, high]: [number, number],
    step: number,
    any: string,
    scale = 1,
  ) {
    const value = criteria[key];
    const shown = [(value?.min ?? low / scale) * scale, (value?.max ?? high / scale) * scale];
    const isSet = value !== undefined && (value.min !== undefined || value.max !== undefined);
    return (
      <Slot isSet={isSet} words={isSet ? rangeWords(value, unit, scale, step < 1 ? 1 : 0) : any}>
        <span className="font-medium">{LABELS[key]()}</span>
        <Slider
          value={shown}
          min={low}
          max={high}
          step={step}
          onValueChange={(next) => {
            const [from, to] = next as number[];
            const made: Range = {
              ...(from! > low ? { min: Math.round((from! / scale) * 100) / 100 } : {}),
              ...(to! < high ? { max: Math.round((to! / scale) * 100) / 100 } : {}),
            };
            onCriteria({ ...criteria, [key]: Object.keys(made).length > 0 ? made : undefined });
          }}
        />
        <span className="text-xs text-neutral-7">
          {t(
            "A thumb at the end of the line leaves that side open.",
            "Un curseur au bout de la ligne laisse ce côté ouvert.",
          )}
        </span>
      </Slot>
    );
  }
  function sector(key: ArcKey, at: number | null | undefined, fallback: Arc) {
    const value = criteria[key];
    return (
      <Slot isSet={value !== undefined} words={value ? arcWords(value) : t("anywhere", "partout")}>
        <span className="font-medium">{LABELS[key]()}</span>
        {value ? (
          <>
            <CompassDial
              arc={value}
              now={at}
              label={LABELS[key]()}
              size={168}
              onChange={(arc) => onCriteria({ ...criteria, [key]: arc })}
            />
            <Button
              size="xs"
              variant="outline"
              onClick={() => onCriteria({ ...criteria, [key]: undefined })}
            >
              {t("Anywhere", "Partout")}
            </Button>
          </>
        ) : (
          <Button size="xs" onClick={() => onCriteria({ ...criteria, [key]: fallback })}>
            {at == null
              ? t("Choose a sector", "Choisir un secteur")
              : t(`Around ${compass(at)}, as now`, `Autour de ${compass(at)}, comme maintenant`)}
          </Button>
        )}
      </Slot>
    );
  }
  const around = (degrees: number | null | undefined, fallback: Arc) =>
    degrees == null ? fallback : { from: (degrees - 30 + 360) % 360, to: (degrees + 30) % 360 };
  const trends = [
    { key: undefined, label: t("rising or falling", "montante ou descendante") },
    { key: "rising" as const, label: t("rising", "montante") },
    { key: "falling" as const, label: t("falling", "descendante") },
  ];
  const trend = trends.find((candidate) => candidate.key === criteria.tideTrend)!;

  const swellHeight = range(
    "swellHeightMeters",
    "m",
    [0, 5],
    0.1,
    t("any height", "de n’importe quelle hauteur"),
  );
  const swellPeriod = range(
    "swellPeriodSeconds",
    "s",
    [4, 22],
    1,
    t("any period", "n’importe quelle période"),
  );
  const swellFrom = sector(
    "swellDirectionDegrees",
    now?.swellDirectionDegrees,
    around(now?.swellDirectionDegrees, { from: 250, to: 310 }),
  );
  const windSpeed = range(
    "windSpeedMetersPerSecond",
    t("kn", "nd"),
    [0, 40],
    1,
    t("of any strength", "de n’importe quelle force"),
    KNOT,
  );
  const windFrom = sector(
    "windDirectionDegrees",
    now?.windDirectionDegrees,
    around(now?.windDirectionDegrees, { from: 45, to: 135 }),
  );
  const tideHeight = tide
    ? range(
        "tideHeightMeters",
        "m",
        [Math.floor(tide.low * 2) / 2, Math.ceil(tide.high * 2) / 2],
        0.1,
        t("at any height", "à n’importe quelle hauteur"),
      )
    : t("at any height", "à n’importe quelle hauteur");
  const tideTrend = (
    <Slot isSet={criteria.tideTrend !== undefined} words={trend.label}>
      <span className="font-medium">{LABELS.tideTrend()}</span>
      <div className="flex flex-wrap gap-xxs">
        {trends.map((candidate) => (
          <Button
            key={candidate.label}
            size="xs"
            variant={candidate.key === criteria.tideTrend ? "default" : "outline"}
            onClick={() => onCriteria({ ...criteria, tideTrend: candidate.key })}
          >
            {candidate.label}
          </Button>
        ))}
      </div>
    </Slot>
  );

  const announced = judged.windows.filter(isAnnounced);
  const held = blockers(judged).slice(0, 2);
  const at = (time: Date) => judged.hours.find((hour) => hour.time.getTime() === time.getTime());

  return (
    <div className="grid gap-l">
      <div className="grid gap-xs">
        <Input
          value={draft.name}
          placeholder={t("Name of the spot", "Nom du spot")}
          aria-label={t("Name of the spot", "Nom du spot")}
          onChange={(event) => onDraft({ name: event.currentTarget.value })}
        />
        <p className="text-xs text-neutral-7">{place}</p>
      </div>

      {/* The spot, said. Every underlined part opens what changes it. */}
      <p className="text-l leading-[1.7] text-pretty">
        {t("It works when the swell is ", "Ça marche quand la houle fait ")}
        {swellHeight}
        {t(", at ", ", à ")}
        {swellPeriod}
        {t(", from ", ", de ")}
        {swellFrom}
        {t("; the wind is ", " ; le vent souffle à ")}
        {windSpeed}
        {t(" from ", " de ")}
        {windFrom}
        {t("; and the tide is ", " ; et la marée est ")}
        {tideHeight}
        {", "}
        {tideTrend}.
      </p>

      <div className="grid gap-s">
        <p className="text-m font-medium">{countWords(judged)}</p>
        <HourStrip judged={judged} />
        {announced.length > 0 && (
          <ul className="grid gap-xxs text-s">
            {announced.slice(0, 6).map((window) => {
              const hour = at(window.start);
              return (
                <li
                  key={window.start.getTime()}
                  className="flex justify-between gap-s tabular-nums"
                >
                  <span>{windowWords(window)}</span>
                  <span className="text-neutral-7">
                    {hour?.swellHeightMeters?.toFixed(1)} m · {hour?.swellPeriodSeconds?.toFixed(0)}{" "}
                    s · {((hour?.windSpeedMetersPerSecond ?? 0) * KNOT).toFixed(0)} {t("kn", "nd")}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {held.length > 0 && (
        <div className="grid gap-xs">
          <h3 className="text-xs font-medium tracking-wide text-neutral-7 uppercase">
            {t("What holds it back", "Ce qui le retient")}
          </h3>
          {held.map(([key, count]) => (
            <div key={key} className="flex items-center justify-between gap-s text-s">
              <span>
                {LABELS[key]()}{" "}
                <span className="text-neutral-7">
                  {t(`alone rules out ${count} h`, `écarte à lui seul ${count} h`)}
                </span>
              </span>
              <Button size="xs" variant="outline" onClick={() => onCriteria(loosen(criteria, key))}>
                {t("Loosen", "Élargir")}
              </Button>
            </div>
          ))}
        </div>
      )}

      <div className="flex items-center justify-between gap-s">
        <label className="flex items-center gap-xs text-s">
          <Switch
            checked={draft.alertsEnabled}
            onCheckedChange={(alertsEnabled) => onDraft({ alertsEnabled })}
          />
          {t("Alert me", "M’alerter")}
        </label>
        <Button onClick={onSave}>{t("Save the spot", "Enregistrer le spot")}</Button>
      </div>

      {footer}
    </div>
  );
}
