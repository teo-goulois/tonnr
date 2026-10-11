import { Button } from "@repo/ui/components/ui/button";
import { Input } from "@repo/ui/components/ui/input";
import {
  Popover,
  PopoverPopup,
  PopoverTitle,
  PopoverTrigger,
} from "@repo/ui/components/ui/popover";
import { Slider } from "@repo/ui/components/ui/slider";
import { Switch } from "@repo/ui/components/ui/switch";
import { ToggleGroup, ToggleGroupItem } from "@repo/ui/components/ui/toggle-group";
import { TrashIcon } from "@repo/ui/icon";
import { cn } from "@repo/ui/lib/utils";
import { type ReactNode, useEffect, useId, useMemo, useRef, useState } from "react";

import { formatNumber, formatSeconds, toKnots } from "@/lib/format";
import { formatHeight, formatWind, useUnits } from "@/lib/units";
import { m } from "@/paraglide/messages.js";

import { Bearing } from "../viewer/bearing";
import type { Alert, AlertCriteria, AlertPreview, Loadable, Spot } from "../viewer/types";
import { hasSeaAhead, heldBack, hoursAhead, openPieces, stretchWords } from "./alert-trial";
import {
  type AlertDraft,
  type AlertTrial,
  type Arc,
  type ArcKey,
  CRITERION_LABELS,
  RANGES,
  type RangeKey,
  arcWords,
  asked,
  changedParts,
  isSetRange,
  loosened,
  rangeAfter,
  rangeWords,
  sliderEnds,
  thumbsOf,
} from "./alert-words";
import { CompassDial } from "./compass-dial";
import { HourStrip } from "./hour-strip";

// An arrow and its name stand as one box in the sentence, which the underline of the part does
// not reach: they are underlined as the part is.
const underlined = "underline decoration-dotted underline-offset-4";
// The shortest windows an alert may ask for, in hours.
const SHORTEST_HOURS = [1, 2, 3, 4, 6];
// How many of the windows ahead are listed under the strips.
const LISTED = 6;
// The most spots an alert holds: decision 031.
export const SPOTS_MOST = 12;

type AlertEditorProps = {
  now: number;
  // The spot whose panel this is, and the user's spots, for the neighbours an alert may hold.
  spot: Spot;
  spots: Spot[];
  // The alert the spot is in. Undefined while it has none.
  alert: Alert | undefined;
  // True once the offer of an alert was taken elsewhere on the panel.
  opened?: boolean;
  // The time zone the account's days are read in. Undefined until it has set one: the browser's.
  zone: string | undefined;
  // What the draft gives at its spots, and how to ask for it.
  preview: Loadable<AlertPreview>;
  onTry: (trial: AlertTrial) => void;
  // True for an account that was never asked whether it wants its alerts by mail, on an
  // instance that sends some: it is asked here, with the alert it saves.
  asksMail: boolean;
  // True while the account's address is not checked: mail leaves once it is.
  mailWaits?: boolean;
  isSaving: boolean;
  // The alert as it is written, what of it differs from the alert that is saved, and what the
  // account answered about mail when it was asked.
  onSave: (draft: AlertDraft, changed: Partial<AlertDraft>, byMail?: boolean) => void;
  isDeleting: boolean;
  onDelete: (alert: Alert) => void;
};

/**
 * A part of the sentence that can be changed. One that asks nothing is written lighter. It is a
 * span that acts as a button: a button does not break where a sentence does.
 */
function Slot({
  label,
  words,
  shown = words,
  isSet,
  children,
}: {
  label: string;
  // What the part says, in words, and as it is written when that is more than words.
  words: string;
  shown?: ReactNode;
  isSet: boolean;
  children: ReactNode;
}) {
  return (
    <Popover>
      <PopoverTrigger
        nativeButton={false}
        render={
          <span
            // Two parts may read the same: each says what it is of.
            aria-label={m.alert_slot_name({ label, words })}
            className={cn(
              "focus-ring cursor-pointer rounded-(--radius-xs) underline decoration-dotted underline-offset-4 outline-none",
              isSet ? "font-medium" : "text-neutral-7",
            )}
          />
        }
      >
        {shown}
      </PopoverTrigger>
      <PopoverPopup className="grid w-72 gap-s text-s">
        <PopoverTitle className="text-s font-medium">{label}</PopoverTitle>
        {children}
      </PopoverPopup>
    </Popover>
  );
}

/**
 * The alert of a spot, said in one sentence whose parts open what changes them, with what it
 * gives over the days ahead. Decision 031.
 */
export function AlertEditor({
  now,
  spot,
  spots,
  alert,
  opened = false,
  zone,
  preview,
  onTry,
  asksMail,
  mailWaits = false,
  isSaving,
  onSave,
  isDeleting,
  onDelete,
}: AlertEditorProps) {
  const id = useId();
  // The wind is written in the unit its reader chose: the editor is drawn again when it changes.
  useUnits();
  const saved = useMemo<AlertDraft>(
    () =>
      alert
        ? {
            name: alert.name,
            criteria: alert.criteria,
            enabled: alert.enabled,
            shortestMinutes: alert.shortestMinutes,
            spotIds: alert.spotIds,
          }
        : {
            name: spot.name,
            criteria: {},
            enabled: true,
            shortestMinutes: 120,
            spotIds: [spot.id],
          },
    [alert, spot.id, spot.name],
  );
  // What was changed here, part by part. The rest is the alert as it is saved, now: a part left
  // alone follows the alert if it changes elsewhere meanwhile, as its switch does in the list.
  // What was written while a save was on its way is still here when the answer comes.
  const [changed, setChanged] = useState<Partial<AlertDraft>>({});
  const draft = useMemo(() => ({ ...saved, ...changed }), [saved, changed]);
  const set = <Key extends keyof AlertDraft>(key: Key, value: AlertDraft[Key]) =>
    setChanged((current) => ({ ...current, [key]: value }));
  // What the API has caught up with is no longer a change made here: a part that is saved, or
  // that became the same elsewhere, follows the alert again. A neighbour that was deleted
  // meanwhile is no longer asked for.
  useEffect(() => {
    setChanged((current) => {
      const known = new Set(spots.map((one) => one.id));
      const isKnown = (spotId: string) => spotId === spot.id || known.has(spotId);
      const cleaned =
        current.spotIds && !current.spotIds.every(isKnown)
          ? { ...current, spotIds: current.spotIds.filter(isKnown) }
          : current;
      const still = changedParts(cleaned, saved);
      const isSame =
        cleaned === current && Object.keys(still).length === Object.keys(current).length;
      return isSame ? current : still;
    });
  }, [saved, spots, spot.id]);
  // A spot with no alert shows the offer of one, until it is taken. An alert that was deleted
  // leaves nothing of what was written of it, and the offer comes back.
  const [wasOpened, setWasOpened] = useState(false);
  const [wasDeleted, setWasDeleted] = useState(false);
  const isOpen = alert !== undefined || wasOpened || (opened && !wasDeleted);
  const [isConfirming, setIsConfirming] = useState(false);
  // Mail is offered, and taken unless the account says no.
  const [wantsMail, setWantsMail] = useState(true);
  const hadAlert = useRef(alert !== undefined);
  useEffect(() => {
    if (hadAlert.current && !alert) {
      setChanged({});
      setWasOpened(false);
      setWasDeleted(true);
      setIsConfirming(false);
    }
    hadAlert.current = alert !== undefined;
  }, [alert]);

  const { criteria } = draft;
  const sent = useMemo(() => asked(criteria), [criteria]);
  const asksSomething = Object.keys(sent).length > 0;

  // The preview follows the draft while the editor is open, and is let go of when it closes.
  useEffect(() => {
    if (isOpen) {
      onTry({ criteria: sent, shortestMinutes: draft.shortestMinutes, spotIds: draft.spotIds });
    } else {
      onTry(null);
    }
  }, [isOpen, sent, draft.shortestMinutes, draft.spotIds, onTry]);
  useEffect(() => () => onTry(null), [onTry]);

  if (!isOpen) {
    return (
      <div className="grid justify-items-start gap-s">
        <p className="text-s text-neutral-7">{m.alert_none()}</p>
        <Button type="button" variant="secondary" onClick={() => setWasOpened(true)}>
          {m.alert_create()}
        </Button>
      </div>
    );
  }

  const setCriteria = (next: AlertCriteria) => set("criteria", next);
  // What was tried at the spots of the draft, in their order. An answer may still be of the
  // draft as it was a moment ago.
  const tried = draft.spotIds.flatMap(
    (spotId) => preview.data?.spots.find((one) => one.spotId === spotId) ?? [],
  );
  const ahead = hoursAhead(
    tried.find((one) => one.spotId === spot.id),
    now,
  );
  const current = ahead[0];
  const tides = ahead.flatMap((hour) => hour.tideHeightMeters ?? []);

  function range(key: RangeKey, any: string, said: (range: string) => string) {
    const scale = RANGES[key];
    const label = scale.label();
    const value = criteria[key];
    // The tide's slider runs over what the tide does here.
    const ends = sliderEnds(
      key,
      value,
      key === "tideHeightMeters" && tides.length > 0
        ? [Math.floor(Math.min(...tides) * 2) / 2, Math.ceil(Math.max(...tides) * 2) / 2]
        : undefined,
    );
    const thumbs = thumbsOf(key, value, ends);
    const isSet = isSetRange(value);
    return (
      <Slot label={label} isSet={isSet} words={isSet ? said(rangeWords(key, value)) : any}>
        <Slider
          value={thumbs}
          min={ends[0]}
          max={ends[1]}
          step={scale.step}
          getAriaLabel={(index) =>
            index === 0 ? m.alert_slider_least({ label }) : m.alert_slider_most({ label })
          }
          getAriaValueText={(_formatted, shown) => scale.unit(formatNumber(shown, scale.digits))}
          onValueChange={(next) =>
            setCriteria({
              ...criteria,
              [key]: rangeAfter(key, value, thumbs, next as number[], ends),
            })
          }
        />
        <span className="text-xs text-neutral-7">{m.alert_slider_hint()}</span>
      </Slot>
    );
  }

  function sector(key: ArcKey, at: number | null | undefined, usual: Arc) {
    const value = criteria[key];
    const label = CRITERION_LABELS[key]();
    // Around where it comes from now, when the forecast says, or around the usual.
    const around: Arc =
      at == null
        ? usual
        : {
            from: (Math.round((at - 30) / 5) * 5 + 360) % 360,
            to: (Math.round((at + 30) / 5) * 5 + 360) % 360,
          };
    return (
      <Slot
        label={label}
        isSet={value !== undefined}
        words={value ? m.alert_from_sector({ arc: arcWords(value) }) : m.alert_any_from()}
        shown={
          // A direction is an arrow and a name: the two ends of the sector, clockwise.
          value && (
            <>
              {m.alert_from()} <Bearing degrees={value.from} className={underlined} />–
              <Bearing degrees={value.to} className={underlined} />
            </>
          )
        }
      >
        {value ? (
          <>
            <CompassDial
              arc={value}
              now={at}
              label={label}
              onChange={(arc) => setCriteria({ ...criteria, [key]: arc })}
            />
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => setCriteria({ ...criteria, [key]: undefined })}
            >
              {m.alert_sector_any()}
            </Button>
          </>
        ) : (
          <Button
            type="button"
            size="sm"
            onClick={() => setCriteria({ ...criteria, [key]: around })}
          >
            {at == null ? (
              m.alert_sector_choose()
            ) : (
              <>
                {m.alert_sector_as_now()} <Bearing degrees={at} />
              </>
            )}
          </Button>
        )}
      </Slot>
    );
  }

  const trends = [
    { value: "any", label: m.alert_any_trend() },
    { value: "rising", label: m.alert_trend_rising() },
    { value: "falling", label: m.alert_trend_falling() },
  ] as const;
  const shortest = draft.shortestMinutes / 60;

  const pieces = openPieces(tried, now);
  const held = heldBack(ahead).slice(0, 2);
  const nameOf = (spotId: string) => spots.find((one) => one.id === spotId)?.name ?? "";
  const asksTide = sent.tideHeightMeters !== undefined || sent.tideTrend !== undefined;
  // The spots that may share the alert: the user's, in no other alert.
  const neighbours = spots.filter(
    (one) => one.id !== spot.id && (one.alertId === null || one.alertId === alert?.id),
  );
  const isFull = draft.spotIds.length >= SPOTS_MOST;
  const parts = changedParts(changed, saved);
  const isDirty = !alert || Object.keys(parts).length > 0;
  // Saving and deleting take turns: neither is asked while the other is on its way.
  const isBusy = isSaving || isDeleting;
  const canSave = isDirty && asksSomething && draft.name.trim().length > 0 && !isBusy;

  return (
    <form
      className="grid gap-l"
      onSubmit={(event) => {
        event.preventDefault();
        if (!canSave) return;
        const name = draft.name.trim();
        onSave(
          { ...draft, name, criteria: sent },
          {
            ...parts,
            ...(parts.name === undefined ? {} : { name }),
            ...(parts.criteria === undefined ? {} : { criteria: sent }),
          },
          asksMail ? wantsMail : undefined,
        );
      }}
    >
      <div className="flex items-center gap-s">
        <Input
          className="flex-1"
          value={draft.name}
          maxLength={80}
          aria-label={m.alert_name_label()}
          placeholder={m.alert_name_label()}
          onChange={(event) => set("name", event.currentTarget.value)}
        />
        <Switch
          aria-label={m.alert_enabled_label()}
          checked={draft.enabled}
          onCheckedChange={(enabled) => set("enabled", enabled)}
        />
      </div>

      {/* The alert, said. Every underlined part opens what changes it. */}
      <p className="text-l text-pretty">
        {m.alert_says_swell()}{" "}
        {range("swellHeightMeters", m.alert_any_height(), (said) =>
          m.alert_height_of({ range: said }),
        )}
        ,{" "}
        {range("swellPeriodSeconds", m.alert_any_period(), (said) =>
          m.alert_period_of({ range: said }),
        )}
        , {sector("swellDirectionDegrees", current?.swellDirectionDegrees, { from: 250, to: 310 })},{" "}
        {m.alert_says_wind()}{" "}
        {range("windSpeedMetersPerSecond", m.alert_any_wind(), (said) =>
          m.alert_wind_at({ range: said }),
        )}
        , {sector("windDirectionDegrees", current?.windDirectionDegrees, { from: 45, to: 135 })},{" "}
        {m.alert_says_tide()}{" "}
        {range("tideHeightMeters", m.alert_any_tide(), (said) => m.alert_tide_at({ range: said }))},{" "}
        <Slot
          label={m.alert_label_tide_trend()}
          isSet={criteria.tideTrend !== undefined}
          words={trends.find((trend) => trend.value === (criteria.tideTrend ?? "any"))?.label ?? ""}
        >
          <ToggleGroup
            variant="outline"
            size="sm"
            aria-label={m.alert_label_tide_trend()}
            value={[criteria.tideTrend ?? "any"]}
            onValueChange={([pressed]) => {
              if (!pressed) return;
              setCriteria({
                ...criteria,
                tideTrend: pressed === "any" ? undefined : (pressed as "rising" | "falling"),
              });
            }}
          >
            {trends.map((trend) => (
              <ToggleGroupItem key={trend.value} value={trend.value}>
                {trend.label}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
        </Slot>
        , {m.alert_says_for()}{" "}
        <Slot label={m.alert_label_shortest()} isSet words={m.alert_hours({ count: shortest })}>
          <ToggleGroup
            variant="outline"
            size="sm"
            aria-label={m.alert_label_shortest()}
            value={[String(shortest)]}
            onValueChange={([pressed]) => {
              if (pressed) set("shortestMinutes", Number(pressed) * 60);
            }}
          >
            {SHORTEST_HOURS.map((hours) => (
              <ToggleGroupItem key={hours} value={String(hours)}>
                {m.alert_hours({ count: hours })}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
        </Slot>
        .
      </p>

      {/* What the sentence gives, over the days ahead. */}
      <div className="grid gap-s" aria-live="polite">
        {!asksSomething ? (
          <p className="text-s text-neutral-7">{m.alert_preview_no_condition()}</p>
        ) : preview.isError ? (
          <p className="text-s text-neutral-7">
            {preview.isUnavailable ? m.alert_preview_failed() : m.alert_preview_no_sea()}
          </p>
        ) : tried.length === 0 ? (
          // Nothing was answered yet: no count is said of a forecast that was not read.
          <p className="text-s text-neutral-7">{m.alert_preview_pending()}</p>
        ) : (
          <>
            <p className={cn("font-medium", preview.isPending && "text-neutral-7")}>
              {pieces.length === 0
                ? hasSeaAhead(tried, now)
                  ? m.alert_preview_outside()
                  : m.alert_preview_none()
                : pieces.length === 1
                  ? m.alert_preview_one()
                  : m.alert_preview_many({ count: pieces.length })}
            </p>
            {tried.map((one) =>
              one.hasSea ? (
                <div key={one.spotId} className="grid gap-xxs">
                  {tried.length > 1 && <span className="text-xs">{nameOf(one.spotId)}</span>}
                  <HourStrip
                    hours={hoursAhead(one, now)}
                    open={one.open}
                    zone={zone}
                    label={
                      one.open.some((piece) => piece.end.getTime() > now)
                        ? m.alert_strip_summary({
                            spot: nameOf(one.spotId),
                            hours: one.open
                              .filter((piece) => piece.end.getTime() > now)
                              .map((piece) => stretchWords(piece, zone))
                              .join(", "),
                          })
                        : m.alert_strip_none({ spot: nameOf(one.spotId) })
                    }
                  />
                </div>
              ) : (
                <p key={one.spotId} className="text-s text-neutral-7">
                  {nameOf(one.spotId)} · {m.alert_preview_no_sea()}
                </p>
              ),
            )}
            {pieces.length > 0 && (
              <ul className="grid gap-xxs text-s">
                {pieces.slice(0, LISTED).map((piece) => {
                  const first = piece.hours.find(
                    (hour) => hour.time.getTime() === piece.start.getTime(),
                  );
                  return (
                    <li
                      key={`${piece.spotId}-${piece.start.getTime()}`}
                      className="flex justify-between gap-s tabular-nums"
                    >
                      <span>
                        {tried.length > 1 && `${nameOf(piece.spotId)} · `}
                        {stretchWords(piece, zone)}
                      </span>
                      {first && (
                        <span className="text-neutral-7">
                          {[
                            first.swellHeightMeters !== null &&
                              formatHeight(first.swellHeightMeters),
                            first.swellPeriodSeconds !== null &&
                              formatSeconds(first.swellPeriodSeconds),
                            first.windSpeedMetersPerSecond !== null &&
                              formatWind(toKnots(first.windSpeedMetersPerSecond)),
                          ]
                            .filter(Boolean)
                            .join(" · ")}
                        </span>
                      )}
                    </li>
                  );
                })}
                {pieces.length > LISTED && (
                  <li className="text-neutral-7">
                    {m.alert_preview_more({ count: pieces.length - LISTED })}
                  </li>
                )}
              </ul>
            )}
            {tried.some((one) => one.forecastStale) && (
              <p className="text-xs text-neutral-7">{m.alert_preview_stale()}</p>
            )}
          </>
        )}
        {asksTide &&
          tried
            .filter((one) => one.hasSea && !one.hasTide)
            .map((one) => (
              <p key={one.spotId} className="text-s text-neutral-7">
                {m.alert_no_tide({ spot: nameOf(one.spotId) })}
              </p>
            ))}
      </div>

      {asksSomething && held.length > 0 && (
        <div className="grid gap-xs">
          <h3 className="text-s font-medium">{m.alert_held_title()}</h3>
          {held.map(([key, hours]) => (
            <div key={key} className="flex items-center justify-between gap-s text-s">
              <span>
                {CRITERION_LABELS[key]()}{" "}
                <span className="text-neutral-7">{m.alert_held_alone({ hours })}</span>
              </span>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => setCriteria(loosened(criteria, key))}
              >
                {m.alert_loosen()}
              </Button>
            </div>
          ))}
        </div>
      )}

      {neighbours.length > 0 && (
        <div className="grid gap-xs">
          <p id={`${id}-also`} className="text-s font-medium">
            {m.alert_also_on()}
          </p>
          <ToggleGroup
            multiple
            variant="outline"
            size="sm"
            aria-labelledby={`${id}-also`}
            value={draft.spotIds.filter((spotId) => spotId !== spot.id)}
            onValueChange={(pressed) => set("spotIds", [spot.id, ...pressed])}
          >
            {neighbours.map((one) => (
              <ToggleGroupItem
                key={one.id}
                value={one.id}
                // A spot can still be taken out of an alert that is full.
                disabled={isFull && !draft.spotIds.includes(one.id)}
              >
                {one.name}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
          {isFull && (
            <p className="text-xs text-neutral-7">{m.alert_spots_most({ count: SPOTS_MOST })}</p>
          )}
        </div>
      )}

      {asksMail && (
        <div className="flex items-start justify-between gap-m">
          <div className="grid gap-xxs">
            <span id={`${id}-mail`}>{m.alert_mail_ask()}</span>
            <span className="text-s text-neutral-7">
              {mailWaits ? m.alert_mail_ask_hint_unchecked() : m.alert_mail_ask_hint()}
            </span>
          </div>
          <Switch
            aria-labelledby={`${id}-mail`}
            checked={wantsMail}
            onCheckedChange={setWantsMail}
          />
        </div>
      )}

      <div className="flex flex-wrap items-center gap-xs">
        <Button type="submit" isPending={isSaving} disabled={!canSave}>
          {m.alert_save()}
        </Button>
        {alert &&
          (isConfirming ? (
            <>
              <Button type="button" variant="ghost" onClick={() => setIsConfirming(false)}>
                {m.action_cancel()}
              </Button>
              <Button
                type="button"
                variant="destructive"
                aria-label={m.alert_delete({ name: alert.name })}
                disabled={isBusy}
                onClick={() => {
                  setIsConfirming(false);
                  onDelete(alert);
                }}
              >
                {m.action_delete()}
              </Button>
            </>
          ) : (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label={m.alert_delete({ name: alert.name })}
              isPending={isDeleting}
              disabled={isBusy}
              onClick={() => setIsConfirming(true)}
            >
              <TrashIcon data-slot="icon" aria-hidden />
            </Button>
          ))}
      </div>
    </form>
  );
}
