import { startingArc } from "@repo/client/alerts/compass";
import {
  PLACES_MOST,
  SHORTEST_HOURS,
  STEPS,
  type ValuePart,
  askedFiguresOf,
  isSetValue as isSetValueOf,
  longestFitting,
  othersOf as othersIn,
  tideAsksOf,
  tideAt as tideAtOf,
  tideLastsOf,
  valueAt as valueAtOf,
  weekStateOf,
  withValue,
} from "@repo/client/alerts/editing";
import { MAX_ALTERNATIVES, type Part } from "@repo/conditions/spots/criteria";
import { COEFFICIENT_BANDS, type CoefficientBand, type TideSegment } from "@repo/config/sea-words";
import { Button } from "@repo/ui/components/ui/button";
import {
  Drawer,
  DrawerContent,
  DrawerFooter,
  DrawerHeader,
  DrawerPanel,
  DrawerTitle,
} from "@repo/ui/components/ui/drawer";
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
import { useAppForm } from "@repo/ui/hooks/form/form";
import { CirclePlusIcon, CircleXIcon, CopyIcon, TrashIcon } from "@repo/ui/icon";
import { cn } from "@repo/ui/lib/utils";
import { useQuery } from "@tanstack/react-query";
import {
  Fragment,
  type ReactNode,
  createContext,
  useContext,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { z } from "zod";

import { MorphText } from "@/components/shared/morph-text";
import { formatHeight, useUnits } from "@/lib/units";
import { holdUnsaved } from "@/lib/unsaved";
import { useMediaQuery } from "@/lib/use-media-query";
import { formatNumber } from "@/lib/format";
import { m } from "@/paraglide/messages.js";
import { orpc } from "@/utils/orpc";

import { Bearing } from "../viewer/bearing";
import type { Alert, AlertCriteria, AlertPreview, Loadable, Spot } from "../viewer/types";
import { hasSeaAhead, heldBack, hoursAhead, judgeTried, openPieces } from "./alert-trial";
import {
  type AlertDraft,
  type AlertTrial,
  type Arc,
  type ArcKey,
  BAND_FIGURES,
  CRITERION_LABELS,
  RANGES,
  type RangeKey,
  type TideAsk,
  arcWords,
  asked,
  asksOfTide,
  conditionsKey,
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
  tideWords,
} from "./alert-words";
import { CompassDial } from "./compass-dial";
import { CycleDial } from "./cycle-dial";
import type { TidePoint } from "./tide-band";
import { type Asked, LiveCount, Week, WeekPreview, type WeekState, weekDays } from "./week-preview";

// An alert as an editor holds it: the parts that can be changed.
const draftOf = (alert: Alert): AlertDraft => ({
  name: alert.name,
  criteria: alert.criteria,
  enabled: alert.enabled,
  shortestMinutes: alert.shortestMinutes,
  spotIds: alert.spotIds,
  breakIds: alert.breakIds,
});

/**
 * Where an alert is written from: a spot of the account's own, or a surf break of the catalogue.
 * Decision 064.
 */
export type AlertPlace = {
  kind: "spot" | "break";
  id: string;
  name: string;
  latitude: number;
  longitude: number;
};

// A wide screen opens a part in a popover, and a phone in a drawer.
const WIDE = "(min-width: 1024px)";
// An arrow and its name stand as one box in the sentence, which the underline of the part does
// not reach: they are underlined as the part is.
const underlined = "underline decoration-dotted underline-offset-4";
// The most places an alert holds: decisions 031 and 064.
export const SPOTS_MOST = PLACES_MOST;
const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

type AlertEditorProps = {
  now: number;
  // The place the alert is written from, and the user's spots, for the neighbours it may hold.
  place: AlertPlace;
  spots: Spot[];
  // The alert that is written. Undefined for one that is not saved yet.
  alert: Alert | undefined;
  // What a new alert starts from, when it is the copy of another.
  initial?: AlertDraft;
  // The tide at the place over the two days ahead: how long the parts of the cycle asked last.
  // Empty where no tide station is near.
  tide: TidePoint[];
  // The time zone the account's days are read in. Undefined until it has set one: the browser's.
  zone: string | undefined;
  // Every figure of the hours ahead at the draft's places, and the hours the account can use,
  // and how to ask for them.
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
};

// What follows a part's last word and keeps to it: its "+", its comma. A part reads it here, so
// that its words wrap as they like and its last word takes the rest along to the next line.
const After = createContext<ReactNode>(null);

// What a part does as a new alert is said one part at a time: the part to answer stands out,
// and closing it says the next one.
type GuideOf = {
  current: boolean;
  onClosed: (byButton: boolean) => void;
  // An other value offers to take it away, where a part offers "any".
  onAny?: () => void;
  anyLabel?: string;
};
const Guide = createContext<GuideOf | null>(null);
// An other value that is still to choose: the sentence says nothing of it until it is.
const Unsaid = createContext(false);
// The sentence asks nothing while the alert is being sent: each of its parts says so, to a screen
// reader with the error under the sentence, and the first takes the focus.
const Wrong = createContext<{ invalid: boolean; describedBy: string | undefined }>({
  invalid: false,
  describedBy: undefined,
});

/** Stops a press on what stands inside a part from opening the part. */
const apart = (event: { stopPropagation: () => void }) => event.stopPropagation();

/**
 * A part of the sentence, which opens what changes it: a popover on a wide screen, which stays
 * where the part stood as it opened while the sentence says what is chosen, and a drawer on a
 * phone. Both say the value big at their top and the count of the week, and end on two buttons.
 * One that asks nothing is written lighter. Decision 031, "The editor".
 */
function Slot({
  label,
  words,
  shown = words,
  isSet,
  open = false,
  onAny,
  value,
  children,
}: {
  label: string;
  // What the part says, in words, and as it is written when that is more than words.
  words: string;
  shown?: ReactNode;
  isSet: boolean;
  // Opens as it comes: a value just added, or the next part of a new alert.
  open?: boolean;
  // Leaves the part asking nothing. A part that always asks has none.
  onAny?: () => void;
  // The value alone, said big at the top of what opens. A long one wraps and does not move.
  value: { said: string; long?: boolean };
  children: ReactNode;
}) {
  const wide = useMediaQuery(WIDE);
  const unsaid = useContext(Unsaid);
  const wrong = useContext(Wrong);
  const after = useContext(After);
  const guide = useContext(Guide);
  const week = useContext(Week);
  const [isOpen, setOpen] = useState(open);
  // The count as the part opened: what is chosen there is said against it.
  const [since, setSince] = useState<number | null>(open ? week.count : null);
  const change = (next: boolean, byButton = false) => {
    setOpen(next);
    setSince(next ? week.count : null);
    if (!next) guide?.onClosed(byButton);
  };
  const triggerRef = useRef<HTMLSpanElement>(null);
  const [stood, setStood] = useState<DOMRect | null>(null);
  useLayoutEffect(() => {
    setStood(isOpen && wide ? (triggerRef.current?.getBoundingClientRect() ?? null) : null);
  }, [isOpen, wide]);
  const anchor = useMemo(
    () => (stood ? { getBoundingClientRect: () => stood } : undefined),
    [stood],
  );
  const any = guide?.onAny ?? onAny;
  const triggerClass = cn(
    "focus-ring cursor-pointer rounded-(--radius-xs) underline decoration-dotted underline-offset-4 outline-none",
    isSet ? "font-medium" : "text-neutral-7",
    guide?.current && "bg-neutral-3 px-xxs text-neutral-10 decoration-solid",
  );
  const valueLine = value.long ? (
    <span className="text-m font-medium text-pretty">{value.said}</span>
  ) : (
    <MorphText className="max-w-full text-l font-medium">{value.said}</MorphText>
  );
  const buttons = (
    <>
      {any && (
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="flex-1"
          onClick={() => {
            any();
            change(false, true);
          }}
        >
          {guide?.anyLabel ?? m.alert_part_any()}
        </Button>
      )}
      <Button type="button" size="sm" className="flex-1" onClick={() => change(false, true)}>
        {m.alert_part_done()}
      </Button>
    </>
  );
  // Two parts may read the same: each says what it is of.
  const name = m.alert_slot_name({ label, words });

  if (!wide) {
    return (
      <>
        {!unsaid && (
          <span
            role="button"
            tabIndex={0}
            aria-label={name}
            aria-invalid={wrong.invalid || undefined}
            aria-describedby={wrong.describedBy}
            className={triggerClass}
            onClick={() => change(true)}
            onKeyDown={(event) => {
              if (event.key !== "Enter" && event.key !== " ") return;
              event.preventDefault();
              change(true);
            }}
          >
            {withAfter(shown, after)}
          </span>
        )}
        <Drawer showSwipeHandle open={isOpen} onOpenChange={(next) => change(next)}>
          <DrawerContent variant="edge">
            <DrawerHeader className="gap-xxs">
              <DrawerTitle className="text-s font-normal text-neutral-7">{label}</DrawerTitle>
              {valueLine}
            </DrawerHeader>
            <DrawerPanel className="grid gap-s text-s">
              {children}
              <LiveCount since={since} />
            </DrawerPanel>
            <DrawerFooter>{buttons}</DrawerFooter>
          </DrawerContent>
        </Drawer>
      </>
    );
  }

  return (
    <Popover open={isOpen} onOpenChange={(next) => change(next)}>
      <PopoverTrigger
        nativeButton={false}
        render={
          <span
            ref={triggerRef}
            aria-label={name}
            aria-invalid={wrong.invalid || undefined}
            aria-describedby={wrong.describedBy}
            className={triggerClass}
          />
        }
      >
        {/* A value still to choose stands as an empty mark, for its popover to hold to. */}
        {unsaid ? null : withAfter(shown, after)}
      </PopoverTrigger>
      <PopoverPopup anchor={anchor} className="grid w-80 grid-cols-[minmax(0,1fr)] gap-s text-s">
        <div className="grid gap-xxs">
          <PopoverTitle className="text-s font-normal text-neutral-7">{label}</PopoverTitle>
          {valueLine}
        </div>
        {children}
        <LiveCount since={since} />
        <div className="flex gap-xs">{buttons}</div>
      </PopoverPopup>
    </Popover>
  );
}

/** The last word of a part held with what follows it, which the underline does not reach. */
function withAfter(content: ReactNode, after: ReactNode) {
  if (!after) return content;
  const tail = <span className="inline-block no-underline">{after}</span>;
  if (typeof content !== "string") {
    return (
      <span className="whitespace-nowrap">
        {content}
        {tail}
      </span>
    );
  }
  const at = content.lastIndexOf(" ");
  return (
    <>
      {content.slice(0, at + 1)}
      <span className="whitespace-nowrap">
        {content.slice(at + 1)}
        {tail}
      </span>
    </>
  );
}

/** A length in minutes, by the quarter hour: "2 h 30". */
function durationWords(minutes: number) {
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest === 0
    ? m.alert_hours({ count: hours })
    : m.alert_hours_minutes({ hours, minutes: String(rest).padStart(2, "0") });
}

/**
 * An alert of a spot, said in one sentence whose parts open what changes them, with what it
 * would tell over the week ahead. A new alert is said a part at a time, each chosen or passed,
 * and a part takes other values after a "+" once it has one. Decision 031.
 */
export function AlertEditor({
  now,
  place,
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
}: AlertEditorProps) {
  const id = useId();
  // The wind is written in the unit its reader chose: the editor is drawn again when it changes.
  useUnits();
  const saved = useMemo<AlertDraft>(
    () =>
      alert
        ? draftOf(alert)
        : (initial ?? {
            name: place.name,
            criteria: {},
            enabled: true,
            shortestMinutes: 120,
            spotIds: place.kind === "spot" ? [place.id] : [],
            breakIds: place.kind === "break" ? [place.id] : [],
          }),
    [alert, initial, place.kind, place.id, place.name],
  );
  // What was changed here, part by part, and what the save that is on its way sent. The rest is
  // the alert as it is saved, now: a part left alone follows the alert if it changes elsewhere
  // meanwhile, as its switch does in the list. `alert-words.ts` holds the rules, and their
  // tests: what is written while a save is on its way is still here when the answer comes.
  const [drafting, setDrafting] = useState(NOTHING_DRAFTED);
  const { changed } = drafting;
  // Whether a spot is still the user's. A list that does not hold the spot the alert is written
  // from is not read yet, and says nothing of what is gone. At a break, the list is read before
  // the editor opens.
  const isKnown = useMemo(() => {
    const known = new Set(spots.map((one) => one.id));
    return place.kind === "break" || known.has(place.id)
      ? (spotId: string) => known.has(spotId)
      : () => true;
  }, [spots, place.kind, place.id]);
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
  const setCriteria = (next: AlertCriteria) => set("criteria", next);

  // The preview is asked of the draft's places while the editor is open, and let go of when it
  // closes. It gives every hour, and the editor judges the conditions itself.
  useEffect(() => {
    onTry({ spotIds: draft.spotIds, breakIds: draft.breakIds });
  }, [draft.spotIds, draft.breakIds, onTry]);
  useEffect(() => () => onTry(null), [onTry]);

  // What the conditions give at each place of the draft, in their order: the preview names a
  // place by its id, a spot's or a break's. An answer may still be of the places as they were
  // a moment ago.
  const tried = useMemo(
    () =>
      [...draft.spotIds, ...draft.breakIds].flatMap((placeId) => {
        const one = preview.data?.spots.find((spot) => spot.spotId === placeId);
        return one ? [judgeTried(one, sent, draft.shortestMinutes)] : [];
      }),
    [draft.spotIds, draft.breakIds, preview.data, sent, draft.shortestMinutes],
  );
  const ahead = hoursAhead(
    tried.find((one) => one.spotId === place.id),
    now,
  );
  const current = ahead[0];
  const pieces = openPieces(tried, now);
  const held = heldBack(ahead).slice(0, 2);

  // The tide's turns over the days ahead, with their coefficients where the coast has them: how
  // long the parts of the cycle last, and whether a coefficient can be asked here.
  const span = useMemo(() => {
    const start = new Date(now - DAY_MS);
    start.setMinutes(0, 0, 0);
    return { start, end: new Date(start.getTime() + 4 * DAY_MS) };
    // The turns of the tide are read again every six hours.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [Math.floor(now / (6 * HOUR_MS))]);
  const turns = useQuery(
    orpc.v1.tides.extremes.queryOptions({
      input: { latitude: place.latitude, longitude: place.longitude, ...span },
      retry: false,
      meta: { quiet: true },
    }),
  );
  const extremes = useMemo(() => turns.data?.extremes ?? [], [turns.data]);
  const hasCoefficients = extremes.some((one) => one.coefficient !== null);

  // The asks of the tide, its own and its others.
  const tideAsks = useMemo(() => tideAsksOf(sent), [sent]);
  // How long the parts of the cycle asked last, at their longest over the curve drawn, to the
  // quarter hour: a window cannot be longer, so a shortest window above it never comes.
  const tideLasts = useMemo(
    () => tideLastsOf(tideAsks, tide, extremes),
    [tideAsks, tide, extremes],
  );
  const tooShort = tideLasts !== null && tideLasts < draft.shortestMinutes;
  // The longest of the shortest windows offered that the tide leaves room for.
  const fits = longestFitting(tideLasts);

  const askedFigures: Asked = askedFiguresOf(sent);
  const weekState: WeekState = weekStateOf({ asksSomething, failed: preview.isError, tried });
  const week = useMemo(
    () => ({
      count: weekState === "ready" ? pieces.length : null,
      days: weekDays(pieces, now, zone).map((day) => day.pieces.length > 0),
    }),
    [weekState, pieces, now, zone],
  );

  // A place is named among the user's spots, the alert's places, or as the one written from.
  const nameOf = (placeId: string) =>
    placeId === place.id
      ? place.name
      : (spots.find((one) => one.id === placeId)?.name ??
        alert?.places.find((one) => (one.spotId ?? one.breakId) === placeId)?.name ??
        "");
  const notes = [
    ...(weekState === "ready" && pieces.length === 0 && hasSeaAhead(tried, now)
      ? [m.alert_preview_outside()]
      : []),
    ...(tried.some((one) => one.forecastStale) ? [m.alert_preview_stale()] : []),
    ...(tideAsks.length > 0
      ? tried
          .filter((one) => one.hasSea && !one.hasTide)
          .map((one) => m.alert_no_tide({ spot: nameOf(one.spotId) }))
      : []),
  ];

  // A new alert is said a part at a time: how many of its parts are said, the one at that
  // index being the part to answer. An alert that is saved, or a copy, is said whole.
  const [revealed, setRevealed] = useState(alert || initial ? STEPS.length : 0);
  // The part that opens by itself as it comes, after the one before was answered.
  const [autoOpen, setAutoOpen] = useState<number | null>(null);
  const guideOf = (step: number): GuideOf => ({
    current: step === revealed,
    onClosed: (byButton) => {
      if (step !== revealed) return;
      setRevealed(step + 1);
      setAutoOpen(byButton && step + 1 < STEPS.length ? step + 1 : null);
    },
  });
  const shows = (step: number) => step <= revealed;

  // An other value just added, still to choose: the part it is of. It stands after the others,
  // opens as it comes, and goes when it is closed still empty.
  const [adding, setAdding] = useState<Part | null>(null);

  // The values of a part: its own first, then its others, as they are written.
  const valueAt = (key: ValuePart, index: number) => valueAtOf(criteria, key, index);
  const tideAt = (index: number): TideAsk => tideAtOf(criteria, index);
  const othersOf = (key: Part) => othersIn(criteria, key);
  // Sets a value of a part. Its own value set to nothing leaves the whole part asking nothing:
  // "any size" is no size, whatever else was said. An other value set to nothing goes. A value
  // that is being moved keeps its place, the part's others with it, whatever it says meanwhile:
  // `moving`, which a slider and the dial pass.
  function setValue(key: Part, index: number, value: unknown, moving = false) {
    setCriteria(withValue(criteria, key, index, value, moving));
    // An other value that is set or taken away is no longer one to add.
    if (index > 0 && key === adding) setAdding(null);
  }
  const isSetValue = (key: Part, index: number) => isSetValueOf(criteria, key, index);

  function range(
    key: RangeKey & ValuePart,
    index: number,
    any: string,
    said: (range: string) => string,
    open: boolean,
  ) {
    const scale = RANGES[key];
    const label = scale.label();
    const value = valueAt(key, index) as { min?: number; max?: number } | undefined;
    const ends = sliderEnds(key, value);
    const thumbs = thumbsOf(key, value, ends);
    const isSet = isSetRange(value);
    return (
      <Slot
        label={label}
        isSet={isSet}
        open={open}
        // An other value says its value alone: the verb stands before the part's own.
        words={isSet ? (index === 0 ? said(rangeWords(key, value)) : rangeWords(key, value)) : any}
        onAny={() => setValue(key, index, undefined)}
        value={{ said: isSet ? rangeWords(key, value) : m.alert_part_any() }}
      >
        <Slider
          value={thumbs}
          min={ends[0]}
          max={ends[1]}
          step={scale.step}
          getAriaLabel={(at) =>
            at === 0 ? m.alert_slider_least({ label }) : m.alert_slider_most({ label })
          }
          getAriaValueText={(_formatted, shown) => scale.unit(formatNumber(shown, scale.digits))}
          onValueChange={(next) =>
            setValue(key, index, rangeAfter(key, value, thumbs, next as number[], ends), true)
          }
        />
        <span className="flex justify-between text-xs text-neutral-7 tabular-nums">
          <span>{scale.unit(formatNumber(ends[0], scale.digits))}</span>
          <span>{scale.unit(formatNumber(ends[1], scale.digits))}</span>
        </span>
      </Slot>
    );
  }

  function sector(
    key: ArcKey & ValuePart,
    index: number,
    at: number | null | undefined,
    open: boolean,
  ) {
    const value = valueAt(key, index) as Arc | undefined;
    const label = CRITERION_LABELS[key]();
    // Around where it comes from now, when the forecast says, or around the usual.
    const around = startingArc(key, at);
    const setArc = (arc: Arc | undefined) => setValue(key, index, arc);
    return (
      <Slot
        label={label}
        open={open}
        onAny={() => setArc(undefined)}
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
        value={{
          said: value
            ? m.alert_sector_degrees({
                arc: arcWords(value),
                from: String(value.from),
                to: String(value.to),
              })
            : m.alert_part_any(),
        }}
      >
        <CompassDial arc={value ?? around} now={at} label={label} onChange={setArc} />
        <DegreesFields arc={value ?? around} label={label} onChange={setArc} />
      </Slot>
    );
  }

  function tidePart(index: number, open: boolean) {
    const ask = tideAt(index);
    const words = tideWords(ask);
    const isSet = asksOfTide(ask);
    // A height and a way, from before the cycle: the cycle takes their place once it is chosen.
    const before =
      isSetRange(ask.tideHeightMeters) || ask.tideTrend !== undefined
        ? tideWords({ tideHeightMeters: ask.tideHeightMeters, tideTrend: ask.tideTrend })
        : undefined;
    const choose = (next: Pick<TideAsk, "tideCycle" | "tideCoefficients">) =>
      setValue("tide", index, {
        tideCycle: ask.tideCycle,
        tideCoefficients: ask.tideCoefficients,
        ...next,
      });
    return (
      <Slot
        label={m.alert_label_tide()}
        isSet={isSet}
        open={open}
        words={isSet ? words : m.alert_any_tide_moment()}
        onAny={() => setValue("tide", index, undefined)}
        value={{ said: isSet ? words : m.alert_part_any(), long: true }}
      >
        <CycleDial
          value={ask.tideCycle ?? []}
          onChange={(cycle) => choose({ tideCycle: cycle as TideSegment[] })}
        />
        {before && (
          <span className="text-xs text-pretty text-neutral-7">
            {m.alert_tide_before({ words: before })}
          </span>
        )}
        {hasCoefficients && (
          <div className="grid gap-xxs">
            <span className="text-xs text-neutral-7">{m.alert_label_coefficient()}</span>
            <ToggleGroup
              multiple
              variant="outline"
              size="sm"
              aria-label={m.alert_label_coefficient()}
              value={ask.tideCoefficients ?? []}
              onValueChange={(pressed) =>
                choose({
                  tideCoefficients: COEFFICIENT_BANDS.filter((band) =>
                    (pressed as CoefficientBand[]).includes(band),
                  ),
                })
              }
            >
              {COEFFICIENT_BANDS.map((band) => (
                <ToggleGroupItem key={band} value={band}>
                  <span className="tabular-nums">{BAND_FIGURES[band]}</span>
                </ToggleGroupItem>
              ))}
            </ToggleGroup>
          </div>
        )}
      </Slot>
    );
  }

  function part(key: Part, index: number, open: boolean) {
    switch (key) {
      case "waveHeightMeters":
        return range(
          key,
          index,
          index === 0 ? m.alert_any_height() : m.alert_to_choose(),
          (said) => m.alert_height_of({ range: said }),
          open,
        );
      case "wavePeakPeriodSeconds":
        return range(
          key,
          index,
          index === 0 ? m.alert_any_period() : m.alert_to_choose(),
          (said) => m.alert_period_of({ range: said }),
          open,
        );
      case "primarySwellHeightMeters":
        return range(
          key,
          index,
          index === 0 ? m.alert_any_swell_height() : m.alert_to_choose(),
          (said) => m.alert_swell_height_of({ range: said }),
          open,
        );
      case "windSpeedMetersPerSecond":
        return range(
          key,
          index,
          index === 0 ? m.alert_any_wind() : m.alert_to_choose(),
          (said) => m.alert_wind_at({ range: said }),
          open,
        );
      case "waveDirectionDegrees":
        return sector(key, index, current?.waveDirectionDegrees, open);
      case "primarySwellDirectionDegrees":
        return sector(key, index, current?.primarySwellDirectionDegrees, open);
      case "windDirectionDegrees":
        return sector(key, index, current?.windDirectionDegrees, open);
      case "tide":
        return tidePart(index, open);
    }
  }

  const iconButton = (label: string, icon: ReactNode, onPress: () => void) => (
    <button
      type="button"
      aria-label={label}
      onPointerDown={apart}
      onClick={(event) => {
        apart(event);
        onPress();
      }}
      className="focus-ring ms-xxs inline-flex size-6 -translate-y-0.5 items-center justify-center rounded-full align-middle text-neutral-7 outline-none hover:text-neutral-10"
    >
      {icon}
    </button>
  );

  /**
   * A part of the sentence with its other values, each after "or". The "+" stands after the
   * last value said, once that one is set and the part has room for one more, and the comma
   * after it. `step` is its place in a new alert's sentence: none for the swell's parts, which
   * are said whole.
   */
  function said(key: Part, comma: string, step?: number) {
    const others = othersOf(key);
    const pending = adding === key ? 1 : 0;
    const lines = Array.from({ length: others + pending }, (_, at) => at + 1);
    // A value still to choose says nothing: the sentence gives it no room until it is chosen.
    const unsaid = (index: number) => index > others || !isSetValue(key, index);
    const lastSaid = lines.filter((index) => !unsaid(index)).at(-1) ?? 0;
    const plus =
      isSetValue(key, lastSaid) &&
      others < MAX_ALTERNATIVES &&
      adding === null &&
      iconButton(
        m.alert_add_value({ label: partLabel(key) }),
        <CirclePlusIcon data-slot="icon" aria-hidden className="size-4.5" />,
        () => setAdding(key),
      );
    const ending = (
      <>
        {plus}
        {comma}
      </>
    );
    const own = (
      <After.Provider value={lastSaid === 0 ? ending : null}>
        {part(key, 0, step !== undefined && autoOpen === step)}
      </After.Provider>
    );
    return (
      <>
        {step === undefined ? own : <Guide.Provider value={guideOf(step)}>{own}</Guide.Provider>}
        {lines.map((index) => (
          // The values of a part keep their order: nothing else tells them apart.
          // oxlint-disable-next-line react/no-array-index-key
          <Fragment key={index}>
            {!unsaid(index) && (
              <>
                {" "}
                <span className="text-neutral-7">{m.alert_or_word()}</span>{" "}
              </>
            )}
            <Unsaid.Provider value={unsaid(index)}>
              <Guide.Provider
                value={{
                  current: false,
                  onAny: () => setValue(key, index, undefined),
                  anyLabel: m.alert_part_remove(),
                  // An other value left with nothing chosen goes as it closes.
                  onClosed: () => {
                    if (index > others) setAdding(null);
                    else if (!isSetValue(key, index)) setValue(key, index, undefined);
                  },
                }}
              >
                <After.Provider
                  value={
                    <>
                      {index <= others &&
                        iconButton(
                          m.alert_remove_value({ label: partLabel(key) }),
                          <CircleXIcon data-slot="icon" aria-hidden className="size-4.5" />,
                          () => setValue(key, index, undefined),
                        )}
                      {index === lastSaid && ending}
                    </>
                  }
                >
                  {part(key, index, index > others)}
                </After.Provider>
              </Guide.Provider>
            </Unsaid.Provider>
          </Fragment>
        ))}
      </>
    );
  }

  const shortest = draft.shortestMinutes / 60;
  const shortestSlot = (
    <Guide.Provider value={guideOf(STEPS.indexOf("shortest"))}>
      <Slot
        label={m.alert_label_shortest()}
        isSet
        open={autoOpen === STEPS.indexOf("shortest")}
        words={m.alert_hours({ count: shortest })}
        value={{ said: m.alert_hours({ count: shortest }) }}
      >
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
        {tideLasts !== null && (
          <span className={cn("text-xs", tooShort ? "text-neutral-9" : "text-neutral-7")}>
            {m.alert_tide_lasts({ lasts: durationWords(tideLasts) })}
          </span>
        )}
      </Slot>
    </Guide.Provider>
  );

  // The spots that may share the alert: the user's others, whatever alerts they are in.
  const neighbours = spots.filter((one) => one.id !== place.id);
  const isFull = draft.spotIds.length + draft.breakIds.length >= SPOTS_MOST;
  const parts = partsToSave(drafting, saved);
  const isDirty = !alert || Object.keys(parts).length > 0;
  // Saving and deleting take turns: neither is asked while the other is on its way.
  const isBusy = isSaving || isDeleting;

  function save() {
    if (isBusy) return;
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
  }

  // The form checks the alert as it is sent: a name, and a sentence that asks something. What is
  // written lives in the draft, whose rules packages/client keeps for the phone's editor too: the
  // form holds the name and the conditions as the draft says them, and the name typed here goes
  // to the draft. Decision 076.
  const form = useAppForm({
    defaultValues: { name: draft.name, criteria: sent },
    validators: {
      onSubmit: z.object({
        name: z.string().trim().min(1, m.alert_name_needed()),
        criteria: z.custom<AlertCriteria>(
          (criteria) => Object.keys(asked(criteria as AlertCriteria)).length > 0,
          m.alert_asks_nothing(),
        ),
      }),
    },
    onSubmit: save,
  });
  useEffect(() => {
    if (form.getFieldValue("name") !== draft.name) {
      form.setFieldValue("name", draft.name, { dontUpdateMeta: true });
    }
  }, [form, draft.name]);
  // Only conditions that say something else change the field: a draft drawn again says the same,
  // and what the form said of it stays.
  useEffect(() => {
    if (conditionsKey(form.getFieldValue("criteria")) !== conditionsKey(sent)) {
      form.setFieldValue("criteria", sent, { dontUpdateMeta: true });
    }
  }, [form, sent]);
  // Something is written here that leaving would lose: a part that was changed, a save that
  // has not answered, or a new alert that asks something already, as a copy does before it is
  // touched. Whatever is about to leave asks `lib/unsaved`.
  const isHeld = isUnsaved(drafting, saved) || (!alert && asksSomething);
  useEffect(() => holdUnsaved(isHeld), [isHeld]);
  useEffect(() => () => holdUnsaved(false), []);

  return (
    <Week.Provider value={week}>
      {/* What is written scrolls, and the buttons stay at the bottom of the sheet. */}
      <form.AppForm>
        <form.Form className="flex min-h-0 flex-1 flex-col">
          <div className="-mx-xs -mt-xs grid min-h-0 flex-1 content-start gap-l overflow-y-auto overscroll-contain px-xs pt-xs pb-m">
            <form.AppField name="name" listeners={{ onChange: ({ value }) => set("name", value) }}>
              {(field) => <field.Input label={m.alert_name_label()} maxLength={80} />}
            </form.AppField>

            {/* The alert, said. Every underlined part opens what changes it. */}
            <div className="grid gap-s">
              {/* The sentence is the field of the conditions: what is wrong with it is said under it. */}
              <form.AppField name="criteria">
                {(field) => (
                  <field.Control<AlertCriteria>>
                    {(control) => (
                      <Wrong.Provider
                        value={{
                          invalid: control.invalid,
                          describedBy: control["aria-describedby"],
                        }}
                      >
                        <p className="text-l text-pretty">
                          {m.alert_says_waves()} {said("waveHeightMeters", shows(1) ? "," : "", 0)}
                          {shows(1) && (
                            <> {said("wavePeakPeriodSeconds", shows(2) ? "," : "", 1)}</>
                          )}
                          {shows(2) && <> {said("waveDirectionDegrees", shows(3) ? "," : "", 2)}</>}
                          {shows(3) && (
                            <>
                              {" "}
                              {m.alert_says_wind()}{" "}
                              {said("windSpeedMetersPerSecond", shows(4) ? "," : "", 3)}
                            </>
                          )}
                          {shows(4) && <> {said("windDirectionDegrees", shows(5) ? "," : "", 4)}</>}
                          {shows(5) && (
                            <>
                              {" "}
                              {m.alert_says_tide()} {said("tide", shows(6) ? "," : "", 5)}
                            </>
                          )}
                          {shows(6) && (
                            <>
                              {" "}
                              {m.alert_says_lasts()} {shortestSlot}.
                            </>
                          )}
                        </p>
                      </Wrong.Provider>
                    )}
                  </field.Control>
                )}
              </form.AppField>
              {tooShort && shows(5) && tideLasts !== null && (
                <div className="flex flex-wrap items-center gap-xs text-s text-neutral-8">
                  <span className="text-pretty">
                    {m.alert_tide_short({
                      lasts: durationWords(tideLasts),
                      shortest: durationWords(draft.shortestMinutes),
                    })}
                  </span>
                  {fits !== undefined && (
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => set("shortestMinutes", fits * 60)}
                    >
                      {m.alert_tide_short_fit({ hours: m.alert_hours({ count: fits }) })}
                    </Button>
                  )}
                </div>
              )}
            </div>

            {/* The swell apart from the wind sea, for whoever wants to ask about it. It opens by
            itself on an alert that already asks something of the swell. */}
            {revealed >= STEPS.length && (
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
                  {m.alert_says_swell()} {said("primarySwellHeightMeters", ",")}{" "}
                  {said("primarySwellDirectionDegrees", "")}.
                </p>
              </details>
            )}

            {/* What the sentence would tell over the week ahead. */}
            <WeekPreview
              state={weekState}
              pieces={pieces}
              asked={askedFigures}
              now={now}
              zone={zone}
              nameOf={tried.length > 1 ? nameOf : undefined}
              notes={notes}
            />

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
                  value={draft.spotIds.filter((spotId) => spotId !== place.id)}
                  onValueChange={(pressed) =>
                    set("spotIds", place.kind === "spot" ? [place.id, ...pressed] : pressed)
                  }
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
                  <p className="text-xs text-neutral-7">
                    {m.alert_spots_most({ count: SPOTS_MOST })}
                  </p>
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

            {/* An alert that is saved may be turned off without being deleted. A new one is on. */}
            {alert && (
              <div className="flex items-center justify-between gap-m">
                <span id={`${id}-enabled`}>{m.alert_enabled_label()}</span>
                <Switch
                  aria-labelledby={`${id}-enabled`}
                  checked={draft.enabled}
                  onCheckedChange={(enabled) => set("enabled", enabled)}
                />
              </div>
            )}
          </div>

          <div className="flex shrink-0 items-center gap-xs pt-s pb-[var(--drawer-keyboard-inset,0px)]">
            {alert && isConfirming ? (
              <>
                <Button
                  type="button"
                  variant="secondary"
                  className="flex-1"
                  onClick={() => setIsConfirming(false)}
                >
                  {m.action_cancel()}
                </Button>
                <Button
                  type="button"
                  variant="destructive"
                  className="flex-1"
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
              <>
                {/* An alert that is saved and was not changed has nothing to send. */}
                <form.SubmitButton
                  className="flex-1"
                  isPending={isSaving}
                  disabled={!isDirty || isDeleting}
                >
                  {m.alert_save()}
                </form.SubmitButton>
                {/* A saved alert may be copied into another, and deleted. */}
                {alert && (
                  <>
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
                  </>
                )}
              </>
            )}
          </div>
        </form.Form>
      </form.AppForm>
    </Week.Provider>
  );
}

/** The name of a part, for its "+" and its "×". */
function partLabel(key: Part) {
  return key === "tide" ? m.alert_label_tide() : CRITERION_LABELS[key]();
}

/** The two ends of a sector in degrees, typed, for what the dial's steps are too coarse for. */
function DegreesFields({
  arc,
  label,
  onChange,
}: {
  arc: Arc;
  label: string;
  onChange: (arc: Arc) => void;
}) {
  return (
    <div className="flex gap-xs">
      <DegreeField
        word={m.alert_degrees_from()}
        label={m.alert_sector_from({ label })}
        degrees={arc.from}
        onChange={(from) => onChange({ ...arc, from })}
      />
      <DegreeField
        word={m.alert_degrees_to()}
        label={m.alert_sector_to({ label })}
        degrees={arc.to}
        onChange={(to) => onChange({ ...arc, to })}
      />
    </div>
  );
}

function DegreeField({
  word,
  label,
  degrees,
  onChange,
}: {
  word: string;
  label: string;
  degrees: number;
  onChange: (degrees: number) => void;
}) {
  // What is typed, which may be empty for a moment; the dial's moves write over it.
  const [typed, setTyped] = useState(String(degrees));
  const [isEditing, setIsEditing] = useState(false);
  useEffect(() => {
    if (!isEditing) setTyped(String(degrees));
  }, [degrees, isEditing]);
  return (
    <label className="grid flex-1 gap-xxs">
      <span className="text-xs text-neutral-7">{word}</span>
      <span className="relative">
        <Input
          type="number"
          inputMode="numeric"
          min={0}
          max={359}
          step={1}
          aria-label={label}
          value={typed}
          onFocus={() => setIsEditing(true)}
          onBlur={() => {
            setIsEditing(false);
            setTyped(String(degrees));
          }}
          onChange={(event) => {
            const text = event.currentTarget.value;
            setTyped(text);
            const number = Number(text);
            if (text === "" || !Number.isFinite(number)) return;
            onChange(((Math.round(number) % 360) + 360) % 360);
          }}
          className="pe-l tabular-nums"
        />
        <span className="pointer-events-none absolute inset-y-0 end-s flex items-center text-neutral-7">
          °
        </span>
      </span>
    </label>
  );
}
