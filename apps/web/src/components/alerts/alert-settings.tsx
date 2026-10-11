import { localTime, momentOf } from "@repo/conditions/alerts/clock";
import { Badge } from "@repo/ui/components/ui/badge";
import { Button } from "@repo/ui/components/ui/button";
import { Input } from "@repo/ui/components/ui/input";
import { Skeleton } from "@repo/ui/components/ui/skeleton";
import { Slider } from "@repo/ui/components/ui/slider";
import { Switch } from "@repo/ui/components/ui/switch";
import { ToggleGroup, ToggleGroupItem } from "@repo/ui/components/ui/toggle-group";
import { type ReactNode, useId, useState } from "react";

import { m } from "@/paraglide/messages.js";
import { getLocale } from "@/paraglide/runtime.js";

import type { AlertSettings, Loadable } from "../viewer/types";

/** What a control of the settings changes: one setting, as the API takes it. */
export type AlertSettingsChange = Partial<
  Pick<
    AlertSettings,
    "onFound" | "onChange" | "horizonDays" | "daylightOnly" | "week" | "awayUntil"
  > & {
    zone: string;
  }
>;

type AlertSettingsFormProps = {
  settings: Loadable<AlertSettings>;
  // The time zone of this device, which an account that has set none may take.
  deviceZone: string;
  // Each control saves what it changes, at once.
  onChange: (change: AlertSettingsChange) => void;
};

const DAY_MINUTES = 24 * 60;
// The days an account may ask to be told ahead of.
const DAYS_AHEAD = [1, 2, 3, 4, 5];
const ALL_DAY = [{ from: 0, to: DAY_MINUTES }];

// The end of a day is written 24:00, as the hour it ends at.
const clock = (minutes: number) =>
  `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;

// The days of the week by name, Monday first. The first of January 2024 was a Monday.
function weekdays() {
  const format = new Intl.DateTimeFormat(getLocale(), { weekday: "long", timeZone: "UTC" });
  return Array.from({ length: 7 }, (_, index) => format.format(Date.UTC(2024, 0, 1 + index)));
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="grid gap-s">
      <h3 className="text-s font-medium text-neutral-7">{title}</h3>
      {children}
    </section>
  );
}

/** A setting with its switch, or with a word in its place for one that is not there yet. */
function Setting({
  label,
  hint,
  checked,
  onCheckedChange,
  soon = false,
}: {
  label: string;
  hint?: string;
  checked?: boolean;
  onCheckedChange?: (checked: boolean) => void;
  soon?: boolean;
}) {
  const id = useId();
  return (
    <div className="flex items-start justify-between gap-m">
      <div className="grid gap-xxs">
        <span id={id} className={soon ? "text-neutral-7" : undefined}>
          {label}
        </span>
        {hint && <span className="text-s text-neutral-7">{hint}</span>}
      </div>
      {soon ? (
        <Badge variant="neutral">{m.alert_settings_soon()}</Badge>
      ) : (
        <Switch aria-labelledby={id} checked={checked} onCheckedChange={onCheckedChange} />
      )}
    </div>
  );
}

/** One day of the week: whether the account can go, and between which hours. */
function DayHours({
  day,
  hours,
  onChange,
}: {
  day: string;
  hours: { from: number; to: number }[];
  onChange: (hours: { from: number; to: number }[]) => void;
}) {
  // The slider is followed while it moves, and saved when it is let go.
  const [moving, setMoving] = useState<{ from: number; to: number } | null>(null);
  const [first] = hours;
  const shown = moving ?? first ?? { from: 0, to: DAY_MINUTES };
  const isFree = hours.length > 0;
  // Hours given in several stretches, as the API takes them: the slider sets one, so they are
  // shown as they are and kept until one stretch is asked for in their place.
  const isSplit = hours.length > 1;
  const said = (stretch: { from: number; to: number }) =>
    stretch.from === 0 && stretch.to === DAY_MINUTES
      ? m.alert_settings_all_day()
      : `${clock(stretch.from)}–${clock(stretch.to)}`;

  return (
    <div className="grid gap-xxs">
      <div className="flex items-center justify-between gap-s">
        <span className="capitalize">{day}</span>
        <span className="flex items-center gap-s text-s text-neutral-7 tabular-nums">
          {!isFree
            ? m.alert_settings_day_off()
            : isSplit
              ? hours.map(said).join(", ")
              : said(shown)}
          <Switch
            aria-label={m.alert_settings_day_free({ day })}
            checked={isFree}
            onCheckedChange={(free) => onChange(free ? ALL_DAY : [])}
          />
        </span>
      </div>
      {isSplit && (
        <Button
          className="justify-self-start"
          variant="ghost"
          size="sm"
          onClick={() => onChange([{ from: hours[0]!.from, to: hours.at(-1)!.to }])}
        >
          {m.alert_settings_day_one({
            hours: said({ from: hours[0]!.from, to: hours.at(-1)!.to }),
          })}
        </Button>
      )}
      {isFree && !isSplit && (
        <Slider
          value={[shown.from / 60, shown.to / 60]}
          min={0}
          max={24}
          step={1}
          minStepsBetweenValues={1}
          getAriaLabel={(index) =>
            index === 0 ? m.alert_settings_day_from({ day }) : m.alert_settings_day_to({ day })
          }
          getAriaValueText={(_formatted, hour) => clock(hour * 60)}
          onValueChange={(next) => {
            const [from, to] = next as number[];
            if (from !== undefined && to !== undefined) setMoving({ from: from * 60, to: to * 60 });
          }}
          onValueCommitted={(next) => {
            const [from, to] = next as number[];
            setMoving(null);
            if (from !== undefined && to !== undefined)
              onChange([{ from: from * 60, to: to * 60 }]);
          }}
        />
      )}
    </div>
  );
}

/** How an account wants to be told, for all its alerts: decision 031. */
export function AlertSettingsForm({ settings, deviceZone, onChange }: AlertSettingsFormProps) {
  const id = useId();
  if (settings.isPending) {
    return (
      <div className="grid gap-s">
        <Skeleton className="h-(--line-m) w-2/5 rounded-(--radius-xs)" />
        <Skeleton className="h-(--line-m) w-4/5 rounded-(--radius-xs)" />
        <Skeleton className="h-(--line-m) w-3/5 rounded-(--radius-xs)" />
      </div>
    );
  }
  const kept = settings.data;
  if (settings.isError || !kept) {
    return <p className="text-s text-neutral-7">{m.alert_settings_load_failed()}</p>;
  }

  const zone = kept.zone ?? deviceZone;
  const days = weekdays();
  // The day the account is away until, on its own calendar.
  const awayDay = kept.awayUntil ? localTime(kept.awayUntil, zone).date : "";

  return (
    <div className="grid gap-l">
      <Section title={m.alert_settings_when()}>
        <Setting
          label={m.alert_settings_found()}
          hint={m.alert_settings_found_hint()}
          checked={kept.onFound}
          onCheckedChange={(onFound) => onChange({ onFound })}
        />
        <Setting
          label={m.alert_settings_change()}
          hint={m.alert_settings_change_hint()}
          checked={kept.onChange}
          onCheckedChange={(change) => onChange({ onChange: change })}
        />
        <Setting label={m.alert_settings_evening()} hint={m.alert_settings_evening_hint()} soon />
        <Setting label={m.alert_settings_begin()} hint={m.alert_settings_begin_hint()} soon />
        <Setting label={m.alert_settings_quiet()} hint={m.alert_settings_quiet_hint()} soon />
      </Section>

      <Section title={m.alert_settings_ahead()}>
        <p id={`${id}-ahead`} className="text-s text-neutral-7">
          {m.alert_settings_ahead_hint()}
        </p>
        <ToggleGroup
          variant="outline"
          size="sm"
          aria-labelledby={`${id}-ahead`}
          value={[String(kept.horizonDays)]}
          onValueChange={([pressed]) => {
            if (pressed) onChange({ horizonDays: Number(pressed) });
          }}
        >
          {DAYS_AHEAD.map((count) => (
            <ToggleGroupItem key={count} value={String(count)}>
              {m.alert_settings_days({ count })}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      </Section>

      <Section title={m.alert_settings_can_go()}>
        <Setting
          label={m.alert_settings_daylight()}
          hint={m.alert_settings_daylight_hint()}
          checked={kept.daylightOnly}
          onCheckedChange={(daylightOnly) => onChange({ daylightOnly })}
        />
        <Setting
          label={m.alert_settings_hours()}
          hint={m.alert_settings_hours_hint()}
          checked={kept.week !== null}
          onCheckedChange={(given) => onChange({ week: given ? days.map(() => ALL_DAY) : null })}
        />
        {kept.week && (
          <div className="grid gap-s">
            {days.map((day, index) => (
              <DayHours
                key={day}
                day={day}
                hours={kept.week?.[index] ?? []}
                onChange={(hours) =>
                  onChange({
                    week: days.map((_, other) =>
                      other === index ? hours : (kept.week?.[other] ?? []),
                    ),
                  })
                }
              />
            ))}
          </div>
        )}
        <div className="grid gap-xxs">
          <label htmlFor={`${id}-away`}>{m.alert_settings_away()}</label>
          <span className="text-s text-neutral-7">{m.alert_settings_away_hint()}</span>
          <div className="flex items-center gap-xs">
            <Input
              id={`${id}-away`}
              type="date"
              className="w-auto"
              value={awayDay}
              onChange={(event) => {
                const day = event.currentTarget.value;
                onChange({ awayUntil: day ? momentOf(day, 0, zone) : null });
              }}
            />
            {kept.awayUntil && (
              <Button variant="ghost" size="sm" onClick={() => onChange({ awayUntil: null })}>
                {m.alert_settings_away_clear()}
              </Button>
            )}
          </div>
        </div>
      </Section>

      <Section title={m.alert_settings_how()}>
        <Setting label={m.alert_settings_mail()} hint={m.alert_settings_mail_hint()} soon />
        <Setting label={m.alert_settings_push()} hint={m.alert_settings_push_hint()} soon />
      </Section>

      <Section title={m.alert_settings_zone()}>
        <p className="text-s">{kept.zone ?? m.alert_settings_zone_unset()}</p>
        {kept.zone !== deviceZone && (
          <Button
            className="justify-self-start"
            variant="secondary"
            size="sm"
            onClick={() => onChange({ zone: deviceZone })}
          >
            {m.alert_settings_zone_use({ zone: deviceZone })}
          </Button>
        )}
      </Section>
    </div>
  );
}
