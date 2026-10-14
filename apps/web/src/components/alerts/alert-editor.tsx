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
import { ChevronLeftIcon, CopyIcon, TrashIcon } from "@repo/ui/icon";
import { cn } from "@repo/ui/lib/utils";
import { type ReactNode, useEffect, useId, useMemo, useState } from "react";

import { formatNumber, formatSeconds, toKnots } from "@/lib/format";
import { formatHeight, formatWind, useUnits } from "@/lib/units";
import { holdUnsaved } from "@/lib/unsaved";
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
  NOTHING_DRAFTED,
  afterAnswer,
  afterRead,
  afterSpotsRead,
  isSetRange,
  isUnsaved,
  loosened,
  partsToSave,
  rangeAfter,
  rangeWords,
  setPart,
  sliderEnds,
  thumbsOf,
} from "./alert-words";
import { TideTrend } from "./tide-trend";
import { AlertTideChart } from "./alert-tide-chart";
import { CompassDial } from "./compass-dial";
import { HourStrip } from "./hour-strip";
import type { TidePoint } from "./tide-band";

// An alert as an editor holds it: the parts that can be changed.
const draftOf = (alert: Alert): AlertDraft => ({
  name: alert.name,
  criteria: alert.criteria,
  enabled: alert.enabled,
  shortestMinutes: alert.shortestMinutes,
  spotIds: alert.spotIds,
});

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
  // The alert that is written. Undefined for one that is not saved yet.
  alert: Alert | undefined;
  // What a new alert starts from, when it is the copy of another.
  initial?: AlertDraft;
  // The tide at the spot over the two days ahead, drawn beside what is asked of it. Empty
  // where no tide station is near.
  tide: TidePoint[];
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
  // account answered about mail when it was asked. Answers the alert once it is saved, and
  // nothing when it could not be.
  onSave: (
    draft: AlertDraft,
    changed: Partial<AlertDraft>,
    byMail?: boolean,
  ) => Promise<Alert | undefined>;
  isDeleting: boolean;
  onDelete: (alert: Alert) => void;
  // Starts another alert from this one as it is written.
  onCopy: (draft: AlertDraft) => void;
  // Asks to go back to the spot's alerts.
  onClose: () => void;
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
  isWide = false,
  children,
}: {
  label: string;
  // What the part says, in words, and as it is written when that is more than words.
  words: string;
  shown?: ReactNode;
  isSet: boolean;
  // Wider, for a part that is set beside a chart.
  isWide?: boolean;
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
      <PopoverPopup className={cn("grid gap-s text-s", isWide ? "w-80" : "w-72")}>
        <PopoverTitle className="text-s font-medium">{label}</PopoverTitle>
        {children}
      </PopoverPopup>
    </Popover>
  );
}

/**
 * An alert of a spot, said in one sentence whose parts open what changes them, with what it
 * gives over the days ahead. Decision 031.
 */
export function AlertEditor({
  now,
  spot,
  spots,
  alert,
  initial,
  tide,
  zone,
  preview,
  onTry,
  asksMail,
  mailWaits = false,
  isSaving,
  onSave,
  isDeleting,
  onDelete,
  onCopy,
  onClose,
}: AlertEditorProps) {
  const id = useId();
  // The wind is written in the unit its reader chose: the editor is drawn again when it changes.
  useUnits();
  const saved = useMemo<AlertDraft>(
    () =>
      alert
        ? draftOf(alert)
        : (initial ?? {
            name: spot.name,
            criteria: {},
            enabled: true,
            shortestMinutes: 120,
            spotIds: [spot.id],
          }),
    [alert, initial, spot.id, spot.name],
  );
  // What was changed here, part by part, and what the save that is on its way sent. The rest is
  // the alert as it is saved, now: a part left alone follows the alert if it changes elsewhere
  // meanwhile, as its switch does in the list. `alert-words.ts` holds the rules, and their
  // tests: what is written while a save is on its way is still here when the answer comes.
  const [drafting, setDrafting] = useState(NOTHING_DRAFTED);
  const { changed } = drafting;
  // Whether a spot is still the user's. A list that does not hold the panel's own spot is not
  // read yet, and says nothing of what is gone.
  const isKnown = useMemo(() => {
    const known = new Set(spots.map((one) => one.id));
    return known.has(spot.id) ? (spotId: string) => known.has(spotId) : () => true;
  }, [spots, spot.id]);
  // The alert as it is written. A neighbour that was deleted meanwhile is not shown, tried or
  // sent, whether the alert's spots were changed here or not.
  const draft = useMemo(() => {
    const written = { ...saved, ...changed };
    return written.spotIds.every(isKnown)
      ? written
      : { ...written, spotIds: written.spotIds.filter(isKnown) };
  }, [saved, changed, isKnown]);
  const set = <Key extends keyof AlertDraft>(key: Key, value: AlertDraft[Key]) =>
    setDrafting((current) => setPart(current, saved, key, value));
  // The alert was read again: a part that now says what it says follows it again.
  useEffect(() => setDrafting((current) => afterRead(current, saved)), [saved]);
  // What was written of the alert's spots no longer asks for one that is gone. The spots of an
  // alert that is saved, when they were not changed here, are left to the alert: it says
  // itself what they are once it is read again, and may say more than that one is gone.
  const isSaved = alert !== undefined;
  useEffect(() => {
    setDrafting((current) => afterSpotsRead(current, saved, isKnown, isSaved));
  }, [isKnown, saved, isSaved]);
  const [isConfirming, setIsConfirming] = useState(false);
  // The advanced part is open on an alert that asks something of the swell apart, and stays as
  // its reader left it.
  const [isAdvancedOpen, setIsAdvancedOpen] = useState(
    () =>
      saved.criteria.primarySwellHeightMeters !== undefined ||
      saved.criteria.primarySwellDirectionDegrees !== undefined,
  );
  // Mail is offered, and taken unless the account says no.
  const [wantsMail, setWantsMail] = useState(true);

  const { criteria } = draft;
  const sent = useMemo(() => asked(criteria), [criteria]);
  const asksSomething = Object.keys(sent).length > 0;

  // The preview follows the draft while the editor is open, and is let go of when it closes.
  useEffect(() => {
    onTry({ criteria: sent, shortestMinutes: draft.shortestMinutes, spotIds: draft.spotIds });
  }, [sent, draft.shortestMinutes, draft.spotIds, onTry]);
  useEffect(() => () => onTry(null), [onTry]);

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
  // What the tide does here: the hours that were tried, and the curve that is drawn.
  const tides = [
    ...ahead.flatMap((hour) => hour.tideHeightMeters ?? []),
    ...tide.map((point) => point.value),
  ];
  // The tide beside what is asked of it, in each of the two parts that ask something of it.
  const tideChart = tide.length > 1 && (
    <div className="grid gap-xxs">
      <AlertTideChart
        label={m.alert_tide_chart({ spot: spot.name })}
        points={tide}
        range={criteria.tideHeightMeters}
        trend={criteria.tideTrend}
      />
      <span className="text-xs text-neutral-7">{m.alert_tide_caption({ spot: spot.name })}</span>
    </div>
  );

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
    const isTide = key === "tideHeightMeters";
    return (
      <Slot
        label={label}
        isSet={isSet}
        isWide={isTide}
        words={isSet ? said(rangeWords(key, value)) : any}
      >
        {isTide && tideChart}
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
  const asksSwell =
    sent.primarySwellHeightMeters !== undefined || sent.primarySwellDirectionDegrees !== undefined;
  // The spots that may share the alert: the user's others, whatever alerts they are in.
  const neighbours = spots.filter((one) => one.id !== spot.id);
  const isFull = draft.spotIds.length >= SPOTS_MOST;
  const parts = partsToSave(drafting, saved);
  const isDirty = !alert || Object.keys(parts).length > 0;
  // Saving and deleting take turns: neither is asked while the other is on its way.
  const isBusy = isSaving || isDeleting;
  const canSave = isDirty && asksSomething && draft.name.trim().length > 0 && !isBusy;
  // Something is written here that leaving would lose: a part that was changed, a save that
  // has not answered, or a new alert that asks something already, as a copy does before it is
  // touched. Whatever is about to leave asks `lib/unsaved`.
  const isHeld = isUnsaved(drafting, saved) || (!alert && asksSomething);
  useEffect(() => holdUnsaved(isHeld), [isHeld]);
  useEffect(() => () => holdUnsaved(false), []);

  return (
    <form
      className="grid gap-l"
      onSubmit={(event) => {
        event.preventDefault();
        if (!canSave) return;
        const name = draft.name.trim();
        const whole = { ...draft, name, criteria: sent };
        const patch = {
          ...parts,
          ...(parts.name === undefined ? {} : { name }),
          ...(parts.criteria === undefined ? {} : { criteria: sent }),
        };
        // A new alert is sent whole, and one that is saved by the parts that were changed.
        const sending = alert ? patch : whole;
        setDrafting((current) => ({ ...current, sending }));
        void onSave(whole, patch, asksMail ? wantsMail : undefined).then((answer) =>
          setDrafting((current) => afterAnswer(current, sending, answer && draftOf(answer))),
        );
      }}
    >
      <div className="flex items-center gap-s">
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label={m.alert_back({ spot: spot.name })}
          onClick={onClose}
        >
          <ChevronLeftIcon data-slot="icon" aria-hidden />
        </Button>
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
        {m.alert_says_waves()}{" "}
        {range("waveHeightMeters", m.alert_any_height(), (said) =>
          m.alert_height_of({ range: said }),
        )}
        ,{" "}
        {range("wavePeakPeriodSeconds", m.alert_any_period(), (said) =>
          m.alert_period_of({ range: said }),
        )}
        , {sector("waveDirectionDegrees", current?.waveDirectionDegrees, { from: 250, to: 310 })},{" "}
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
          isWide
          words={trends.find((trend) => trend.value === (criteria.tideTrend ?? "any"))?.label ?? ""}
          shown={
            // A trend is an arrow and a word, as a direction is.
            criteria.tideTrend && <TideTrend trend={criteria.tideTrend} className={underlined} />
          }
        >
          {tideChart}
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
                {trend.value === "any" ? trend.label : <TideTrend trend={trend.value} />}
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

      {/* The swell apart from the wind sea, for whoever wants to ask about it. It opens by
          itself on an alert that already asks something of the swell. */}
      <details
        className="group grid gap-xs"
        open={isAdvancedOpen}
        onToggle={(event) => setIsAdvancedOpen(event.currentTarget.open)}
      >
        <summary className="focus-ring w-fit cursor-pointer rounded-(--radius-xs) text-s text-neutral-8 outline-none hover:text-neutral-10">
          {m.alert_advanced()}
        </summary>
        <p className="text-s text-pretty text-neutral-7">
          {m.alert_advanced_about()}
          {current &&
            current.waveHeightMeters !== null &&
            current.primarySwellHeightMeters != null && (
              <>
                {" "}
                {m.alert_advanced_now({
                  waves: formatHeight(current.waveHeightMeters),
                  swell: formatHeight(current.primarySwellHeightMeters),
                })}
              </>
            )}
        </p>
        <p className="text-l text-pretty">
          {m.alert_says_swell()}{" "}
          {range("primarySwellHeightMeters", m.alert_any_swell_height(), (said) =>
            m.alert_swell_height_of({ range: said }),
          )}
          ,{" "}
          {sector("primarySwellDirectionDegrees", current?.primarySwellDirectionDegrees, {
            from: 250,
            to: 310,
          })}
          .
        </p>
      </details>

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
                            first.waveHeightMeters !== null && formatHeight(first.waveHeightMeters),
                            first.wavePeakPeriodSeconds !== null &&
                              formatSeconds(first.wavePeakPeriodSeconds),
                            asksSwell &&
                              first.primarySwellHeightMeters != null &&
                              m.alert_preview_swell({
                                height: formatHeight(first.primarySwellHeightMeters),
                              }),
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
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label={m.alert_copy({ name: draft.name })}
          disabled={isBusy || !asksSomething}
          onClick={() => onCopy({ ...draft, criteria: sent })}
        >
          <CopyIcon data-slot="icon" aria-hidden />
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
