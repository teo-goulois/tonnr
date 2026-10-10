// PROTOTYPE, to throw away. See spot-editor-prototype.tsx.
//
// Variant A, "the form": every criterion is a field with its control in view, grouped by what it
// is about. What the criteria give is at the bottom, always on screen.

import { Button } from "@repo/ui/components/ui/button";
import { Input } from "@repo/ui/components/ui/input";
import { Slider } from "@repo/ui/components/ui/slider";
import { Switch } from "@repo/ui/components/ui/switch";
import type { ReactNode } from "react";

import { CompassDial, HourStrip, countWords } from "./parts";
import { type Arc, type ArcKey, type Range, type RangeKey, KNOT, rangeWords, t } from "./shared";
import type { EditorProps } from "./spot-editor-prototype";

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="grid gap-s">
      <h3 className="text-xs font-medium tracking-wide text-neutral-7 uppercase">{title}</h3>
      {children}
    </section>
  );
}

function Field({
  label,
  words,
  enabled,
  onToggle,
  children,
}: {
  label: string;
  words: string;
  enabled: boolean;
  onToggle: (enabled: boolean) => void;
  children: ReactNode;
}) {
  return (
    <div className="grid gap-xs">
      <div className="flex items-center justify-between gap-s">
        <span className="text-s">
          {label}{" "}
          <span className="text-neutral-7 tabular-nums">
            {enabled ? words : t("not checked", "non vérifié")}
          </span>
        </span>
        <Switch checked={enabled} onCheckedChange={onToggle} aria-label={label} />
      </div>
      {enabled && children}
    </div>
  );
}

export function VariantA({
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

  // A thumb at the end of its track leaves that side open: "9 s or more".
  function range(
    key: RangeKey,
    label: string,
    unit: string,
    [low, high]: [number, number],
    step: number,
    fallback: Range,
    scale = 1,
  ) {
    const value = criteria[key];
    const shown = [(value?.min ?? low / scale) * scale, (value?.max ?? high / scale) * scale];
    return (
      <Field
        label={label}
        words={rangeWords(value ?? {}, unit, scale, step < 1 ? 1 : 0)}
        enabled={value !== undefined}
        onToggle={(enabled) => onCriteria({ ...criteria, [key]: enabled ? fallback : undefined })}
      >
        <Slider
          value={shown}
          min={low}
          max={high}
          step={step}
          onValueChange={(next) => {
            const [from, to] = next as number[];
            onCriteria({
              ...criteria,
              [key]: {
                ...(from! > low ? { min: Math.round((from! / scale) * 100) / 100 } : {}),
                ...(to! < high ? { max: Math.round((to! / scale) * 100) / 100 } : {}),
              },
            });
          }}
        />
      </Field>
    );
  }
  function sector(key: ArcKey, label: string, at: number | null | undefined, fallback: Arc) {
    const value = criteria[key];
    return (
      <Field
        label={label}
        words=""
        enabled={value !== undefined}
        onToggle={(enabled) => onCriteria({ ...criteria, [key]: enabled ? fallback : undefined })}
      >
        {value && (
          <CompassDial
            arc={value}
            now={at}
            label={label}
            onChange={(arc) => onCriteria({ ...criteria, [key]: arc })}
          />
        )}
      </Field>
    );
  }
  const trends = [
    { key: undefined, label: t("Either", "Peu importe") },
    { key: "rising" as const, label: t("Rising", "Montante") },
    { key: "falling" as const, label: t("Falling", "Descendante") },
  ];

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

      <Section title={t("Swell", "Houle")}>
        {range("swellHeightMeters", t("Height", "Hauteur"), "m", [0, 5], 0.1, {
          min: 0.8,
          max: 2.5,
        })}
        {range("swellPeriodSeconds", t("Period", "Période"), "s", [4, 22], 1, { min: 9 })}
        {sector("swellDirectionDegrees", t("Comes from", "Vient de"), now?.swellDirectionDegrees, {
          from: 250,
          to: 310,
        })}
      </Section>

      <Section title={t("Wind", "Vent")}>
        {range(
          "windSpeedMetersPerSecond",
          t("Speed", "Vitesse"),
          t("kn", "nd"),
          [0, 40],
          1,
          { max: 15 / KNOT },
          KNOT,
        )}
        {sector("windDirectionDegrees", t("Blows from", "Souffle de"), now?.windDirectionDegrees, {
          from: 45,
          to: 135,
        })}
      </Section>

      <Section title={t("Tide", "Marée")}>
        {tide
          ? range(
              "tideHeightMeters",
              t("Height", "Hauteur"),
              "m",
              [Math.floor(tide.low * 2) / 2, Math.ceil(tide.high * 2) / 2],
              0.1,
              { min: tide.low + (tide.high - tide.low) * 0.35, max: tide.high },
            )
          : null}
        <div className="flex items-center justify-between gap-s">
          <span className="text-s">{t("Going", "Sens")}</span>
          <div className="flex gap-xxs">
            {trends.map((trend) => (
              <Button
                key={trend.label}
                size="xs"
                variant={criteria.tideTrend === trend.key ? "default" : "outline"}
                onClick={() => onCriteria({ ...criteria, tideTrend: trend.key })}
              >
                {trend.label}
              </Button>
            ))}
          </div>
        </div>
      </Section>

      {footer}

      {/* What the criteria give stays in view while a control moves. */}
      <div className="sticky bottom-0 -mx-m grid gap-s border-t border-neutral-4 bg-background px-m py-s shadow-[0_2rem_0_var(--background)]">
        <p className="text-s font-medium">{countWords(judged)}</p>
        <HourStrip judged={judged} />
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
      </div>
    </div>
  );
}
