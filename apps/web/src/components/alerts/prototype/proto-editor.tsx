// PROTOTYPE, throwaway (branch prototype/alert-conditions). Two questions, judged in the app:
// how an alert says "ou" (several cases, any of which finds an hour), and four ways to ask the
// tide (A height made quick, B stage of the tide, C coefficient, D a picture of the cycle).
// Nothing is saved: the draft lives here, and the hours are judged in the browser by
// `rules.ts`, over the hours the API's preview gives with no condition.

import { Button } from "@repo/ui/components/ui/button";
import { Input } from "@repo/ui/components/ui/input";
import { Label } from "@repo/ui/components/ui/label";
import {
  Popover,
  PopoverPopup,
  PopoverTitle,
  PopoverTrigger,
} from "@repo/ui/components/ui/popover";
import { Slider } from "@repo/ui/components/ui/slider";
import { ToggleGroup, ToggleGroupItem } from "@repo/ui/components/ui/toggle-group";
import { CirclePlusIcon, CircleXIcon, PlusIcon, XIcon } from "@repo/ui/icon";
import { cn } from "@repo/ui/lib/utils";
import { TIDE_STAGES, type TideStage } from "@repo/config/sea-words";
import { useQuery } from "@tanstack/react-query";
import {
  Fragment,
  type ReactNode,
  createContext,
  useContext,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";

import { MorphText } from "@/components/shared/morph-text";
import { useMediaQuery } from "@/lib/use-media-query";
import { formatDay, formatNumber, formatSeconds, toKnots } from "@/lib/format";
import { TIDE_COLOR, TIDE_PAST_COLOR } from "@/lib/sea-scales";
import { formatHeight, formatWind, useUnits } from "@/lib/units";
import { m } from "@/paraglide/messages.js";
import { orpc } from "@/utils/orpc";

import { Bearing } from "../../viewer/bearing";
import { SeaChart } from "../../viewer/sea-chart";
import type { Alert, AlertCriteria, Spot } from "../../viewer/types";
import type { AlertPlace } from "../alert-editor";
import { stretchWords } from "../alert-trial";
import {
  type Arc,
  type ArcKey,
  CRITERION_LABELS,
  RANGES,
  type RangeKey,
  arcWords,
  isSetRange,
  rangeAfter,
  rangeWords,
  sliderEnds,
  thumbsOf,
} from "../alert-words";
import { CompassDial } from "../compass-dial";
import { HourStrip } from "../hour-strip";
import type { TidePoint } from "../tide-band";
import { TideTrend } from "../tide-trend";
import { CycleDial } from "./cycle-dial";
import {
  type Case,
  COEF_BUCKETS,
  COEF_KEYS,
  type CoefBucket,
  CYCLE,
  CYCLE_WORDS,
  type Extreme,
  STAGE_WORDS,
  type TideAsk,
  type TideVariant,
  type Trend,
  asksSomething,
  asksTide,
  coefficientsByDay,
  cycleOfStages,
  heightsOfStages,
  judge,
  meanRange,
  tideContextAt,
  tideMeets,
} from "./rules";
import { useProto } from "./state";

const WIDE = "(min-width: 1024px)";
const underlined = "underline decoration-dotted underline-offset-4";
const SHORTEST_HOURS = [1, 2, 3, 4, 6];
const LISTED = 8;
const DAY_MS = 24 * 60 * 60 * 1000;
const CASE_COLORS = ["bg-color-1", "bg-neutral-8", "bg-neutral-6", "bg-neutral-5"];

type ProtoEditorProps = {
  now: number;
  place: AlertPlace;
  spots: Spot[];
  alert: Alert | undefined;
  tide: TidePoint[];
  zone: string | undefined;
  onDone: () => void;
};

// What follows a part's last word and keeps to it: its "+", its comma. A part reads it here, so
// that its words wrap as they like and its last word takes it along to the next line.
const After = createContext<ReactNode>(null);

// Variant 3 builds its sentence a part at a time: the part to answer stands out, and its
// popover ends on what goes on, "Passer" while it asks nothing and "Suivant" once it does.
type GuideOf = {
  current: boolean;
  last: boolean;
  onClosed: (byButton: boolean) => void;
  // An other value's popover offers to take it away, where a part offers "any".
  onAny?: () => void;
  anyLabel?: string;
};
const Guide = createContext<GuideOf | null>(null);
// A value added on a phone that says nothing until it is chosen.
const Unsaid = createContext(false);

// On a phone, what changes a part opens at the bottom of the editor, in the place of its
// buttons: the sentence stays in view above it and follows what is chosen. One part at a time.
type DockOf = { at: HTMLElement | null; open: string | null; setOpen: (id: string | null) => void };
const Dock = createContext<DockOf>({ at: null, open: null, setOpen: () => {} });

/** Stops a press on what stands inside a part from opening the part. */
const apart = {
  onClick: (event: { stopPropagation: () => void }) => event.stopPropagation(),
  onPointerDown: (event: { stopPropagation: () => void }) => event.stopPropagation(),
};

/** A part of the sentence that opens what changes it: a popover on a wide screen, the dock at
 * the bottom of the editor on a phone. */
function Slot({
  label,
  words,
  shown = words,
  isSet,
  isWide = false,
  open = false,
  onAny,
  value,
  children,
}: {
  label: string;
  words: string;
  shown?: ReactNode;
  isSet: boolean;
  isWide?: boolean;
  // Opens as it comes: a value just added with "+".
  open?: boolean;
  // Leaves the part asking nothing: what "Peu importe" does. A part that always asks has none.
  onAny?: () => void;
  // The value alone, said big at the top of what opens, where the title says what it is of.
  // A long one, the tide's, wraps there and does not move.
  value?: { said: string; long?: boolean };
  children: ReactNode;
}) {
  const wide = useMediaQuery(WIDE);
  const unsaid = useContext(Unsaid);
  const after = useContext(After);
  const guide = useContext(Guide);
  const dock = useContext(Dock);
  const slotId = useId();
  const triggerRef = useRef<HTMLSpanElement>(null);
  const [popoverOpen, setPopoverOpen] = useState(open && wide);
  const isOpen = wide ? popoverOpen : dock.open === slotId;
  const setOpen = (next: boolean) => {
    if (wide) setPopoverOpen(next);
    else dock.setOpen(next ? slotId : null);
  };
  // A part that comes open, on a phone, takes the dock as it mounts.
  useEffect(() => {
    if (open && !wide) dock.setOpen(slotId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    if (isOpen && !wide) triggerRef.current?.scrollIntoView({ block: "nearest" });
  }, [isOpen, wide]);
  // While a popover is open, the sentence keeps the words it had: what is chosen there would
  // move the words, and the popover with them. A drawer holds to no word: the sentence follows.
  const [kept, setKept] = useState<{ shown: ReactNode; after: ReactNode } | null>(
    open ? { shown, after } : null,
  );
  const change = (next: boolean, byButton = false) => {
    setOpen(next);
    setKept(next ? { shown, after } : null);
    if (!next) guide?.onClosed(byButton);
  };
  const current = guide?.current ?? false;
  const any = guide?.onAny ?? onAny;
  const triggerClass = cn(
    "focus-ring cursor-pointer rounded-(--radius-xs) underline decoration-dotted underline-offset-4 outline-none",
    isSet ? "font-medium" : "text-neutral-7",
    current && "bg-neutral-3 px-xxs text-neutral-10 decoration-solid",
  );
  const valueLine = value?.long ? (
    <span className="text-m font-medium text-pretty">{value.said}</span>
  ) : (
    <MorphText className="max-w-full text-l font-medium">{value?.said ?? words}</MorphText>
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
          {guide?.anyLabel ?? "Peu importe"}
        </Button>
      )}
      <Button type="button" size="sm" className="flex-1" onClick={() => change(false, true)}>
        Valider
      </Button>
    </>
  );

  if (!wide) {
    return (
      <>
        {!unsaid && (
          <span
            ref={triggerRef}
            role="button"
            tabIndex={0}
            aria-label={`${label} : ${words}`}
            className={cn(triggerClass, isOpen && "bg-neutral-3 px-xxs")}
            onClick={() => change(!isOpen)}
            onKeyDown={(event) => {
              if (event.key !== "Enter" && event.key !== " ") return;
              event.preventDefault();
              change(true);
            }}
          >
            {withAfter(shown, after)}
          </span>
        )}
        {isOpen &&
          dock.at &&
          createPortal(
            <div className="grid grid-cols-[minmax(0,1fr)] gap-s text-s">
              <div className="grid gap-xxs">
                <span className="text-s text-neutral-7">{label}</span>
                {valueLine}
              </div>
              {children}
              <div className="flex gap-xs">{buttons}</div>
            </div>,
            dock.at,
          )}
      </>
    );
  }

  return (
    <Popover open={isOpen} onOpenChange={(next) => change(next)}>
      <PopoverTrigger
        nativeButton={false}
        render={<span aria-label={`${label} : ${words}`} className={triggerClass} />}
      >
        {withAfter(kept?.shown ?? shown, kept ? kept.after : after)}
      </PopoverTrigger>
      <PopoverPopup
        className={cn("grid grid-cols-[minmax(0,1fr)] gap-s text-s", isWide ? "w-80" : "w-72")}
      >
        <div className="grid gap-xxs">
          <PopoverTitle className="text-s text-neutral-7">{label}</PopoverTitle>
          {valueLine}
        </div>
        {children}
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

const ofCriteria = (criteria: AlertCriteria): { criteria: AlertCriteria; tide: TideAsk } => {
  const { tideHeightMeters, tideTrend, ...rest } = criteria;
  return {
    criteria: rest,
    tide: {
      ...(tideHeightMeters ? { height: tideHeightMeters } : {}),
      ...(tideTrend ? { trend: tideTrend } : {}),
    },
  };
};

const joinOr = (words: string[]) =>
  words.length <= 1 ? (words[0] ?? "") : `${words.slice(0, -1).join(", ")} ou ${words.at(-1)}`;

function coefWords(ask: TideAsk) {
  if (ask.coefRange && (ask.coefRange.min !== undefined || ask.coefRange.max !== undefined)) {
    const { min, max } = ask.coefRange;
    if (min !== undefined && max !== undefined) return `de coef ${min}–${max}`;
    if (min !== undefined) return `de coef ${min} et plus`;
    return `de coef ${max} au plus`;
  }
  if (!ask.coefs?.length || ask.coefs.length === COEF_KEYS.length) return undefined;
  return `de ${joinOr(COEF_KEYS.filter((key) => ask.coefs?.includes(key)).map((key) => COEF_BUCKETS[key].word))}`;
}

function stagesWords(stages: TideStage[] | undefined) {
  if (!stages?.length || stages.length === TIDE_STAGES.length) return undefined;
  return joinOr(
    TIDE_STAGES.filter((stage) => stages.includes(stage)).map((stage) => STAGE_WORDS[stage]),
  );
}

/** What a case asks of the tide, in words, in the variant that reads it. Empty: nothing. */
function tideWords(variant: TideVariant, ask: TideAsk): string {
  const trend =
    ask.trend === "rising" ? "montante" : ask.trend === "falling" ? "descendante" : undefined;
  switch (variant) {
    case "a": {
      const height = isSetRange(ask.height)
        ? m.alert_tide_at({ range: rangeWords("tideHeightMeters", ask.height) })
        : undefined;
      return [height, trend].filter(Boolean).join(", ");
    }
    case "b": {
      const stages = stagesWords(ask.stages);
      return [stages && `à ${stages}`, trend].filter(Boolean).join(", ");
    }
    case "c": {
      const stages = stagesWords(ask.stages);
      return [coefWords(ask), stages && `à ${stages}`].filter(Boolean).join(", ");
    }
    case "d": {
      const cycle =
        ask.cycle?.length && ask.cycle.length < CYCLE.length
          ? CYCLE.filter((one) => ask.cycle?.includes(one))
              .map((one) => CYCLE_WORDS[one])
              .join(", ")
          : undefined;
      return [cycle, coefWords(ask)].filter(Boolean).join(", ");
    }
  }
}

type Setter = (next: Partial<Case>) => void;

// Variant 3: each part of the sentence may take other values, each on a line of its own after
// "ou". An hour is found when each part has one of its values met: the alert is judged as every
// combination of them, which is what the cases of variants 1 and 2 are.
const PARTS = [
  "waveHeightMeters",
  "wavePeakPeriodSeconds",
  "waveDirectionDegrees",
  "windSpeedMetersPerSecond",
  "windDirectionDegrees",
  "tide",
] as const;
type Part = (typeof PARTS)[number];
const STEPS_OF = [...PARTS, "shortest"] as const;
// An other value of a part, held as a whole case of which only that part is read.
type Alt = { id: number; one: Case };
type Alts = Partial<Record<Part, Alt[]>>;

function combinations(base: Case, alts: Alts, isSet: (key: Part, one: Case) => boolean): Case[] {
  let all: Case[] = [base];
  for (const key of PARTS) {
    // A value still to choose asks nothing yet: it would let every hour through.
    const others = (alts[key] ?? []).filter((alt) => isSet(key, alt.one));
    if (others.length === 0) continue;
    all = all.flatMap((one) => [
      one,
      ...others.map((alt) =>
        key === "tide"
          ? { ...one, tide: alt.one.tide }
          : { ...one, criteria: { ...one.criteria, [key]: alt.one.criteria[key] } },
      ),
    ]);
  }
  return all.map((one, at) => ({ ...one, id: at }));
}

/** A case in a line: what the tabs of variant 2 and the windows say of it. */
function caseLine(variant: TideVariant, one: Case) {
  const { criteria } = one;
  return (
    [
      criteria.waveHeightMeters &&
        isSetRange(criteria.waveHeightMeters) &&
        `vagues ${rangeWords("waveHeightMeters", criteria.waveHeightMeters)}`,
      criteria.wavePeakPeriodSeconds &&
        isSetRange(criteria.wavePeakPeriodSeconds) &&
        rangeWords("wavePeakPeriodSeconds", criteria.wavePeakPeriodSeconds),
      criteria.waveDirectionDegrees && `houle ${arcWords(criteria.waveDirectionDegrees)}`,
      criteria.windSpeedMetersPerSecond &&
        isSetRange(criteria.windSpeedMetersPerSecond) &&
        `vent ${rangeWords("windSpeedMetersPerSecond", criteria.windSpeedMetersPerSecond)}`,
      criteria.windDirectionDegrees && `vent ${arcWords(criteria.windDirectionDegrees)}`,
      asksTide(variant, one.tide) && `marée ${tideWords(variant, one.tide)}`,
    ]
      .filter(Boolean)
      .join(" · ") || "ne demande rien encore"
  );
}

export function PrototypeAlertEditor({
  now,
  place,
  spots,
  alert,
  tide,
  zone,
  onDone,
}: ProtoEditorProps) {
  const id = useId();
  useUnits();
  const proto = useProto();
  const wide = useMediaQuery(WIDE);
  const [dockAt, setDockAt] = useState<HTMLElement | null>(null);
  const [docked, setDocked] = useState<string | null>(null);
  const dock = useMemo(() => ({ at: dockAt, open: docked, setOpen: setDocked }), [dockAt, docked]);
  const variant = proto.tide;

  // What the place says of itself: the stages of the tide it works at.
  const breakRead = useQuery(
    orpc.v1.breaks.get.queryOptions({
      input: { id: place.id },
      enabled: place.kind === "break",
      retry: false,
      meta: { quiet: true },
    }),
  );
  const bestTides =
    (place.kind === "break"
      ? breakRead.data?.characteristics.bestTides
      : spots.find((one) => one.id === place.id)?.characteristics?.bestTides) ?? null;

  // The tide's highs and lows over the week, with their coefficients where a coast has them.
  const span = useMemo(() => {
    const start = new Date(now - DAY_MS);
    start.setMinutes(0, 0, 0);
    return { start, end: new Date(start.getTime() + 9 * DAY_MS) };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [Math.floor(now / (6 * 60 * 60 * 1000))]);
  const extremesRead = useQuery(
    orpc.v1.tides.extremes.queryOptions({
      input: { latitude: place.latitude, longitude: place.longitude, ...span },
      retry: false,
      meta: { quiet: true },
    }),
  );
  const extremes: Extreme[] = useMemo(() => extremesRead.data?.extremes ?? [], [extremesRead.data]);
  const mean = useMemo(
    () => meanRange(extremes.filter((one) => one.time.getTime() > now)),
    [extremes, now],
  );
  const hasCoefs = extremes.some((one) => one.coefficient !== null);
  const coefDays = useMemo(
    () =>
      coefficientsByDay(
        extremes.filter((one) => one.time.getTime() > now - DAY_MS / 2),
        (time) => formatDay(time, zone),
      ),
    [extremes, now, zone],
  );

  // The hours of the week with no condition: the API judges the account's hours, and the
  // prototype judges the sea.
  const preview = useQuery(
    orpc.v1.alerts.preview.queryOptions({
      input: {
        spotIds: place.kind === "spot" ? [place.id] : [],
        breakIds: place.kind === "break" ? [place.id] : [],
        criteria: {},
        shortestMinutes: 60,
        days: 7,
      },
      staleTime: 5 * 60 * 1000,
      retry: false,
      meta: { quiet: true },
    }),
  );
  const tried = preview.data?.spots[0];

  const [name, setName] = useState(alert?.name ?? place.name);
  const [shortestMinutes, setShortest] = useState(alert?.shortestMinutes ?? 120);
  const [cases, setCases] = useState<Case[]>(() => [
    { id: 0, ...(alert ? ofCriteria(alert.criteria) : { criteria: {}, tide: {} }) },
  ]);
  const [active, setActive] = useState(0);
  const [nextId, setNextId] = useState(1);
  // A new alert takes the tide the place says it works at, once that and the week's tides are
  // known, unless the first case was touched: variant A's quickness.
  const [prefilled, setPrefilled] = useState<string | null>(null);
  const [touched, setTouched] = useState(alert !== undefined);
  useEffect(() => {
    if (touched || prefilled || !bestTides?.length || !mean) return;
    const stages = bestTides as TideStage[];
    setCases((current) =>
      current.map((one, index) =>
        index === 0
          ? {
              ...one,
              tide: {
                height: heightsOfStages(stages, mean),
                stages,
                cycle: cycleOfStages(stages),
              },
            }
          : one,
      ),
    );
    setPrefilled(stagesWords(stages) ?? "toute marée");
  }, [touched, prefilled, bestTides, mean]);

  const [alts, setAlts] = useState<Alts>({});
  // The value just added, whose part opens by itself.
  const [opened, setOpened] = useState<number | null>(null);
  const addAlt = (key: Part) => {
    setTouched(true);
    // An other value starts with nothing chosen: a copy of the first would say it twice.
    const one = structuredClone(cases[0]!);
    if (key === "tide") one.tide = {};
    else delete one.criteria[key];
    setAlts((current) => ({
      ...current,
      [key]: [...(current[key] ?? []), { id: nextId, one }],
    }));
    setOpened(nextId);
    setNextId((value) => value + 1);
  };
  const setAlt = (key: Part, altId: number, next: Partial<Case>) =>
    setAlts((current) => ({
      ...current,
      [key]: (current[key] ?? []).map((alt) =>
        alt.id === altId ? { ...alt, one: { ...alt.one, ...next } } : alt,
      ),
    }));
  const removeAlt = (key: Part, altId: number) =>
    setAlts((current) => ({
      ...current,
      [key]: (current[key] ?? []).filter((alt) => alt.id !== altId),
    }));

  const update = (index: number, next: Partial<Case>) => {
    setTouched(true);
    setCases((current) => current.map((one, at) => (at === index ? { ...one, ...next } : one)));
  };
  const addCase = () => {
    setTouched(true);
    // A new case starts as a copy of the last: a few parts away from it.
    setCases((current) => [...current, { ...structuredClone(current.at(-1)!), id: nextId }]);
    setActive(cases.length);
    setNextId((value) => value + 1);
  };
  const removeCase = (index: number) => {
    setCases((current) => current.filter((_, at) => at !== index));
    setActive((current) => Math.max(0, Math.min(current, cases.length - 2)));
  };

  const isSetPart = (key: Part, one: Case) =>
    key === "tide"
      ? asksTide(variant, one.tide)
      : key === "waveDirectionDegrees" || key === "windDirectionDegrees"
        ? one.criteria[key] !== undefined
        : isSetRange(one.criteria[key]);
  // Variant 3: how many steps of the sentence are said, the one at that index being the step
  // to answer. An alert that exists is said whole.
  const [revealed, setRevealed] = useState(alert ? STEPS_OF.length : 0);
  // The step that opens by itself as it comes, after "Suivant" or "Passer".
  const [autoOpen, setAutoOpen] = useState<number | null>(null);
  const judgedCases = useMemo(
    () => (proto.or === "3" ? combinations(cases[0]!, alts, isSetPart) : cases),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [proto.or, cases, alts, variant],
  );
  const judged = useMemo(
    () => judge(tried, judgedCases, variant, extremes, shortestMinutes, now),
    [tried, judgedCases, variant, extremes, shortestMinutes, now],
  );
  const asksAny = judgedCases.some((one) => asksSomething(variant, one));
  const tides = [
    ...judged.hours.flatMap((hour) => hour.tide.height ?? []),
    ...tide.map((point) => point.value),
  ];
  const seaNow = tried?.hours.find((hour) => hour.time.getTime() > now - 60 * 60 * 1000);

  function range(
    one: Case,
    index: number,
    key: RangeKey,
    any: string,
    said: (range: string) => string,
    set?: Setter,
    open?: boolean,
  ) {
    const apply = set ?? ((next: Partial<Case>) => update(index, next));
    const scale = RANGES[key];
    const label = scale.label();
    const value = one.criteria[key];
    const ends = sliderEnds(key, value);
    const thumbs = thumbsOf(key, value, ends);
    const isSet = isSetRange(value);
    return (
      <Slot
        label={label}
        isSet={isSet}
        open={open}
        words={isSet ? said(rangeWords(key, value)) : any}
        onAny={() => apply({ criteria: { ...one.criteria, [key]: undefined } })}
        value={{ said: isSet ? rangeWords(key, value) : "Peu importe" }}
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
            apply({
              criteria: {
                ...one.criteria,
                [key]: rangeAfter(key, value, thumbs, next as number[], ends),
              },
            })
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
    one: Case,
    index: number,
    key: ArcKey,
    at: number | null | undefined,
    usual: Arc,
    set?: Setter,
    open?: boolean,
  ) {
    const apply = set ?? ((next: Partial<Case>) => update(index, next));
    const value = one.criteria[key];
    const label = CRITERION_LABELS[key]();
    const around: Arc =
      at == null
        ? usual
        : {
            from: (Math.round((at - 30) / 5) * 5 + 360) % 360,
            to: (Math.round((at + 30) / 5) * 5 + 360) % 360,
          };
    const setArc = (arc: Arc | undefined) => apply({ criteria: { ...one.criteria, [key]: arc } });
    return (
      <Slot
        label={label}
        open={open}
        onAny={() => setArc(undefined)}
        value={{ said: value ? arcWords(value) : "Peu importe" }}
        isSet={value !== undefined}
        words={value ? m.alert_from_sector({ arc: arcWords(value) }) : m.alert_any_from()}
        shown={
          value && (
            <>
              {m.alert_from()} <Bearing degrees={value.from} className={underlined} />–
              <Bearing degrees={value.to} className={underlined} />
            </>
          )
        }
      >
        <CompassDial arc={value ?? around} now={at} label={label} onChange={setArc} />
      </Slot>
    );
  }

  function tidePart(one: Case, index: number, set?: Setter, open?: boolean) {
    const ask = one.tide;
    const apply = set ?? ((next: Partial<Case>) => update(index, next));
    const setAsk = (next: TideAsk) => apply({ tide: next });
    const words = tideWords(variant, ask);
    const isSet = asksTide(variant, ask);
    const any =
      variant === "a"
        ? m.alert_any_tide()
        : variant === "c"
          ? "à n'importe quel coef"
          : "à n'importe quel moment";
    const chart = tide.length > 1 && (
      <ProtoTideChart points={tide} extremes={extremes} variant={variant} ask={ask} />
    );
    const coefLine = hasCoefs && coefDays.length > 0 && (
      <span className="text-xs text-neutral-7 tabular-nums">
        Coefs :{" "}
        {coefDays
          .slice(0, 7)
          .map(([day, coef]) => `${day} ${coef}`)
          .join(" · ")}
      </span>
    );
    const trendToggle = (
      <ToggleGroup
        variant="outline"
        size="sm"
        aria-label={m.alert_label_tide_trend()}
        value={[ask.trend ?? "any"]}
        onValueChange={([pressed]) => {
          if (!pressed) return;
          setAsk({ ...ask, trend: pressed === "any" ? undefined : (pressed as Trend) });
        }}
      >
        <ToggleGroupItem value="any">{m.alert_any_trend()}</ToggleGroupItem>
        <ToggleGroupItem value="rising">
          <TideTrend trend="rising" />
        </ToggleGroupItem>
        <ToggleGroupItem value="falling">
          <TideTrend trend="falling" />
        </ToggleGroupItem>
      </ToggleGroup>
    );
    const stageToggle = (label: string) => (
      <div className="grid gap-xxs">
        <span className="text-xs text-neutral-7">{label}</span>
        <ToggleGroup
          multiple
          variant="outline"
          size="sm"
          aria-label={label}
          value={ask.stages ?? []}
          onValueChange={(pressed) => setAsk({ ...ask, stages: pressed as TideStage[] })}
        >
          {TIDE_STAGES.map((stage) => (
            <ToggleGroupItem key={stage} value={stage}>
              {STAGE_WORDS[stage]}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      </div>
    );
    const coefToggle = (
      <ToggleGroup
        multiple
        variant="outline"
        size="sm"
        aria-label="Coefficient"
        value={ask.coefs ?? []}
        onValueChange={(pressed) =>
          setAsk({ ...ask, coefs: pressed as CoefBucket[], coefRange: undefined })
        }
      >
        {COEF_KEYS.map((key) => (
          <ToggleGroupItem key={key} value={key}>
            <span className="grid text-start leading-tight">
              <span>{COEF_BUCKETS[key].word}</span>
              <span className="text-xxs text-neutral-7">{COEF_BUCKETS[key].hint}</span>
            </span>
          </ToggleGroupItem>
        ))}
      </ToggleGroup>
    );

    let body: ReactNode;
    if (variant === "a") {
      const key = "tideHeightMeters" as const;
      const ends = sliderEnds(
        key,
        ask.height,
        tides.length > 0
          ? [Math.floor(Math.min(...tides) * 2) / 2, Math.ceil(Math.max(...tides) * 2) / 2]
          : undefined,
      );
      const thumbs = thumbsOf(key, ask.height, ends);
      const quick: { label: string; stages: TideStage[] }[] = [
        { label: "Basse", stages: ["low", "mid_low"] },
        { label: "Mi-marée", stages: ["mid_low", "mid", "mid_high"] },
        { label: "Haute", stages: ["mid_high", "high"] },
        ...(bestTides?.length
          ? [{ label: "Comme le spot", stages: bestTides as TideStage[] }]
          : []),
      ];
      body = (
        <>
          {chart}
          {mean && (
            <div className="flex flex-wrap gap-xs">
              {quick.map((choice) => (
                <Button
                  key={choice.label}
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => setAsk({ ...ask, height: heightsOfStages(choice.stages, mean) })}
                >
                  {choice.label}
                </Button>
              ))}
            </div>
          )}
          <Slider
            value={thumbs}
            min={ends[0]}
            max={ends[1]}
            step={RANGES[key].step}
            getAriaLabel={(at) => (at === 0 ? "Hauteur la plus basse" : "Hauteur la plus haute")}
            onValueChange={(next) =>
              setAsk({
                ...ask,
                height: rangeAfter(key, ask.height, thumbs, next as number[], ends),
              })
            }
          />
          {trendToggle}
          <span className="text-xs text-neutral-7">
            Les choix rapides coupent la marée moyenne de la semaine en cinq. La hauteur reste fixe
            : un jour de gros coef, « mi-marée » tombe plus tôt.
          </span>
        </>
      );
    } else if (variant === "b") {
      body = (
        <>
          {chart}
          {stageToggle("À quel moment")}
          {trendToggle}
          <span className="text-xs text-neutral-7">
            Lu sur chaque marée, entre sa basse et sa haute : suit le coefficient sans rien régler.
          </span>
        </>
      );
    } else if (variant === "c") {
      body = (
        <>
          {chart}
          {hasCoefs ? (
            <>
              {coefToggle}
              <details className="grid gap-xs">
                <summary className="w-fit cursor-pointer text-xs text-neutral-8">
                  Plus précis
                </summary>
                <CoefSlider ask={ask} onChange={setAsk} />
              </details>
              {coefLine}
            </>
          ) : (
            <span className="text-xs text-neutral-7">
              Pas de coefficient sur cette côte : seul le moment compte.
            </span>
          )}
          {stageToggle("Et à quel moment (facultatif)")}
        </>
      );
    } else {
      body = (
        <>
          <CycleDial value={ask.cycle ?? []} onChange={(cycle) => setAsk({ ...ask, cycle })} />
          {chart}
          {hasCoefs && (
            <>
              {coefToggle}
              {coefLine}
            </>
          )}
        </>
      );
    }
    return (
      <Slot
        label="Marée"
        isSet={isSet}
        isWide
        open={open}
        words={isSet ? words : any}
        onAny={() => setAsk({})}
        value={{ said: isSet ? words : "Peu importe", long: true }}
      >
        {body}
      </Slot>
    );
  }

  function part(key: Part, one: Case, index: number, set?: Setter, open?: boolean) {
    // An other value says its value alone: the verb stands on the line above.
    const bare = (said: (range: string) => string) => (set ? (range: string) => range : said);
    switch (key) {
      case "waveHeightMeters":
        return range(
          one,
          index,
          key,
          set ? "à choisir" : m.alert_any_height(),
          bare((said) => m.alert_height_of({ range: said })),
          set,
          open,
        );
      case "wavePeakPeriodSeconds":
        return range(
          one,
          index,
          key,
          set ? "à choisir" : m.alert_any_period(),
          bare((said) => m.alert_period_of({ range: said })),
          set,
          open,
        );
      case "waveDirectionDegrees":
        return sector(
          one,
          index,
          key,
          seaNow?.waveDirectionDegrees,
          { from: 250, to: 310 },
          set,
          open,
        );
      case "windSpeedMetersPerSecond":
        return range(
          one,
          index,
          key,
          set ? "à choisir" : m.alert_any_wind(),
          bare((said) => m.alert_wind_at({ range: said })),
          set,
          open,
        );
      case "windDirectionDegrees":
        return sector(
          one,
          index,
          key,
          seaNow?.windDirectionDegrees,
          { from: 45, to: 135 },
          set,
          open,
        );
      case "tide":
        return tidePart(one, index, set, open);
    }
  }

  // Variant 3: the "+" after a value that is set, and the other values of its part, a line each.
  const iconButton = (label: string, icon: ReactNode, onPress: () => void) => (
    <button
      type="button"
      aria-label={label}
      onPointerDown={apart.onPointerDown}
      onClick={(event) => {
        apart.onClick(event);
        onPress();
      }}
      className="focus-ring ms-xxs inline-flex size-6 -translate-y-0.5 items-center justify-center rounded-full align-middle text-neutral-7 outline-none hover:text-neutral-10"
    >
      {icon}
    </button>
  );
  const plusOf = (key: Part) =>
    iconButton(
      "Ajouter une autre valeur",
      <CirclePlusIcon data-slot="icon" aria-hidden className="size-4.5" />,
      () => addAlt(key),
    );
  const removeOf = (key: Part, altId: number) =>
    iconButton(
      "Retirer cette valeur",
      <CircleXIcon data-slot="icon" aria-hidden className="size-4.5" />,
      () => removeAlt(key, altId),
    );
  const guideOf = (step: number): GuideOf => ({
    current: step === revealed,
    last: step === STEPS_OF.length - 1,
    onClosed: (byButton) => {
      if (step !== revealed) return;
      setRevealed(step + 1);
      setAutoOpen(byButton && step + 1 < STEPS_OF.length ? step + 1 : null);
    },
  });
  // An other value left with nothing chosen goes as its part closes.
  const altGuide = (key: Part, alt: Alt): GuideOf => ({
    current: false,
    last: false,
    onAny: () => removeAlt(key, alt.id),
    anyLabel: "Retirer",
    onClosed: () => {
      if (!isSetPart(key, alt.one)) removeAlt(key, alt.id);
    },
  });
  // A step of the sentence: its part, then its other values. The "+" stands after the last of
  // them once that one is set, and the comma keeps to the first when it stands alone.
  const guided = (key: Part, step: number, comma: boolean) => {
    const base = cases[0]!;
    const lines = alts[key] ?? [];
    // On a phone, a value still to choose says nothing: the sentence gives it no room until it
    // is chosen. A popover needs a word to hold to, so a wide screen says "à choisir".
    const unsaid = (alt: Alt) => !wide && !isSetPart(key, alt.one);
    const lastSaid = lines.filter((alt) => !unsaid(alt)).at(-1);
    const plus = isSetPart(key, lastSaid ? lastSaid.one : base) && plusOf(key);
    // The "+" and the comma follow the last value the sentence says.
    const ending = (
      <>
        {plus}
        {comma && ","}
      </>
    );
    return (
      <>
        <Guide.Provider value={guideOf(step)}>
          <After.Provider value={lastSaid ? null : ending}>
            {part(key, base, 0, undefined, autoOpen === step)}
          </After.Provider>
        </Guide.Provider>
        {lines.map((alt) => (
          <Fragment key={alt.id}>
            {!unsaid(alt) && (
              <>
                {" "}
                <span className="text-neutral-7">ou</span>{" "}
              </>
            )}
            <Unsaid.Provider value={unsaid(alt)}>
              <Guide.Provider value={altGuide(key, alt)}>
                <After.Provider
                  value={
                    <>
                      {removeOf(key, alt.id)}
                      {alt === lastSaid && ending}
                    </>
                  }
                >
                  {part(key, alt.one, 0, (next) => setAlt(key, alt.id, next), alt.id === opened)}
                </After.Provider>
              </Guide.Provider>
            </Unsaid.Provider>
          </Fragment>
        ))}
        {comma && " "}
      </>
    );
  };
  const shows = (step: number) => step <= revealed;

  // A part, its "+" and its other values. The "+" and the comma keep to the part's last word,
  // and a part whose other values stand on lines of their own takes no comma: what follows
  // starts the next line.
  const said = (key: Part, one: Case, index: number, comma = true) => (
    <>
      <After.Provider value={comma && ","}>{part(key, one, index)}</After.Provider>
      {comma && " "}
    </>
  );

  function sentence(one: Case, index: number, lead: string, ending: ReactNode) {
    return (
      <>
        {lead} {said("waveHeightMeters", one, index)}
        {said("wavePeakPeriodSeconds", one, index)}
        {said("waveDirectionDegrees", one, index)}
        {m.alert_says_wind()} {said("windSpeedMetersPerSecond", one, index)}
        {said("windDirectionDegrees", one, index)}
        {m.alert_says_tide()} {said("tide", one, index, false)}
        {ending}
      </>
    );
  }

  const shortestOf = (open = false) => (
    <Slot
      label={m.alert_label_shortest()}
      isSet
      open={open}
      words={m.alert_hours({ count: shortestMinutes / 60 })}
    >
      <ToggleGroup
        variant="outline"
        size="sm"
        aria-label={m.alert_label_shortest()}
        value={[String(shortestMinutes / 60)]}
        onValueChange={([pressed]) => pressed && setShortest(Number(pressed) * 60)}
      >
        {SHORTEST_HOURS.map((hours) => (
          <ToggleGroupItem key={hours} value={String(hours)}>
            {m.alert_hours({ count: hours })}
          </ToggleGroupItem>
        ))}
      </ToggleGroup>
    </Slot>
  );
  const shortestSlot = shortestOf();
  const caseDot = (index: number) =>
    cases.length > 1 && (
      <span
        aria-hidden
        className={cn(
          "inline-block size-2 rounded-full align-middle",
          CASE_COLORS[index % CASE_COLORS.length],
        )}
      />
    );

  return (
    <Dock.Provider value={dock}>
      <div className="flex min-h-0 flex-1 flex-col">
        <div className="grid min-h-0 flex-1 content-start gap-l overflow-y-auto overscroll-contain pb-m">
          <div className="grid gap-xs">
            <Label htmlFor={`${id}-name`}>{m.alert_name_label()}</Label>
            <Input
              id={`${id}-name`}
              value={name}
              maxLength={80}
              onChange={(event) => setName(event.currentTarget.value)}
            />
          </div>

          {proto.or === "3" ? (
            // Variant 3: one sentence, said a part at a time, whose parts each take other values
            // with "+".
            <p className="text-l text-pretty">
              {m.alert_says_waves()} {guided("waveHeightMeters", 0, shows(1))}
              {shows(1) && guided("wavePeakPeriodSeconds", 1, shows(2))}
              {shows(2) && guided("waveDirectionDegrees", 2, shows(3))}
              {shows(3) && (
                <>
                  {m.alert_says_wind()} {guided("windSpeedMetersPerSecond", 3, shows(4))}
                </>
              )}
              {shows(4) && guided("windDirectionDegrees", 4, shows(5))}
              {shows(5) && (
                <>
                  {m.alert_says_tide()} {guided("tide", 5, shows(6))}
                </>
              )}
              {shows(6) && (
                <>
                  {m.alert_says_for()}{" "}
                  <Guide.Provider value={guideOf(6)}>{shortestOf(autoOpen === 6)}</Guide.Provider>.
                </>
              )}
            </p>
          ) : proto.or === "1" ? (
            // Variant 1: the cases follow one another in the sentence, each a whole sentence.
            <div className="grid gap-s">
              {cases.map((one, index) => (
                <div key={one.id} className="grid gap-xxs">
                  <p className="text-l text-pretty">
                    {caseDot(index)}{" "}
                    {sentence(
                      one,
                      index,
                      index === 0 ? m.alert_says_waves() : "Ou quand les vagues",
                      ",",
                    )}
                  </p>
                  {cases.length > 1 && (
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      className="w-fit"
                      onClick={() => removeCase(index)}
                    >
                      <XIcon data-slot="icon" aria-hidden />
                      Retirer ce cas
                    </Button>
                  )}
                </div>
              ))}
              <p className="text-l text-pretty">
                <button
                  type="button"
                  onClick={addCase}
                  className={cn(
                    "focus-ring rounded-(--radius-xs) text-neutral-7 outline-none",
                    underlined,
                  )}
                >
                  + ou quand…
                </button>{" "}
                {m.alert_says_for()} {shortestSlot}.
              </p>
            </div>
          ) : (
            // Variant 2: one case at a time, behind a row of tabs, the others in a line each.
            <div className="grid gap-s">
              <div className="flex flex-wrap items-center gap-xs">
                <ToggleGroup
                  variant="outline"
                  size="sm"
                  aria-label="Cas"
                  value={[String(active)]}
                  onValueChange={([pressed]) => pressed !== undefined && setActive(Number(pressed))}
                >
                  {cases.map((one, index) => (
                    <ToggleGroupItem key={one.id} value={String(index)}>
                      {caseDot(index)} {index === 0 ? "Quand" : "Ou quand"}
                    </ToggleGroupItem>
                  ))}
                </ToggleGroup>
                <Button type="button" size="sm" variant="ghost" onClick={addCase}>
                  <PlusIcon data-slot="icon" aria-hidden />
                  Ou…
                </Button>
              </div>
              {cases[active] && (
                <p className="text-l text-pretty">
                  {sentence(
                    cases[active],
                    active,
                    active === 0 ? m.alert_says_waves() : "Ou quand les vagues",
                    <>
                      , {m.alert_says_for()} {shortestSlot}.
                    </>,
                  )}
                </p>
              )}
              {cases.length > 1 && (
                <ul className="grid gap-xxs text-s">
                  {cases.map((one, index) =>
                    index === active ? null : (
                      <li key={one.id} className="flex items-center justify-between gap-s">
                        <button
                          type="button"
                          className="text-start text-neutral-8"
                          onClick={() => setActive(index)}
                        >
                          {caseDot(index)} {index === 0 ? "Quand" : "Ou quand"}{" "}
                          {caseLine(variant, one)}
                        </button>
                        <Button
                          type="button"
                          size="icon-sm"
                          variant="ghost"
                          aria-label="Retirer ce cas"
                          onClick={() => removeCase(index)}
                        >
                          <XIcon data-slot="icon" aria-hidden />
                        </Button>
                      </li>
                    ),
                  )}
                </ul>
              )}
            </div>
          )}

          {/* What the cases give over the week: the prototype judges the hours itself. */}
          <div
            className="edge grid gap-s rounded-(--radius-s) p-s [--edge-color:var(--neutral-4)]"
            aria-live="polite"
          >
            {!asksAny ? (
              <p className="text-s text-neutral-7">{m.alert_preview_no_condition()}</p>
            ) : preview.isError ? (
              <p className="text-s text-neutral-7">{m.alert_preview_failed()}</p>
            ) : !tried ? (
              <p className="text-s text-neutral-7">{m.alert_preview_pending()}</p>
            ) : !tried.hasSea ? (
              <p className="text-s text-neutral-7">{m.alert_preview_no_sea()}</p>
            ) : (
              <>
                <p className="font-medium">
                  {judged.pieces.length === 0
                    ? m.alert_preview_none()
                    : judged.pieces.length === 1
                      ? m.alert_preview_one()
                      : m.alert_preview_many({ count: judged.pieces.length })}
                </p>
                <HourStrip
                  hours={judged.hours.map((hour) => ({
                    time: hour.time,
                    unmet: hour.cases.length > 0 ? [] : ["no"],
                  }))}
                  open={judged.pieces}
                  zone={zone}
                  label={
                    judged.pieces.map((piece) => stretchWords(piece, zone)).join(", ") ||
                    m.alert_preview_none()
                  }
                />
                {judged.pieces.length > 0 && (
                  <ul className="grid gap-xxs text-s">
                    {judged.pieces.slice(0, LISTED).map((piece) => {
                      const first = piece.first;
                      const stage = first.tide.stage;
                      return (
                        <li key={piece.start.getTime()} className="grid gap-0">
                          <span className="flex items-center gap-xs tabular-nums">
                            {cases.length > 1 && (
                              <span className="inline-flex gap-[2px]">
                                {piece.cases.map((at) => (
                                  <span key={at}>{caseDot(at)}</span>
                                ))}
                              </span>
                            )}
                            {stretchWords(piece, zone)}
                          </span>
                          <span className="text-xs text-neutral-7 tabular-nums">
                            {[
                              first.waveHeightMeters !== null &&
                                formatHeight(first.waveHeightMeters),
                              first.wavePeakPeriodSeconds !== null &&
                                formatSeconds(first.wavePeakPeriodSeconds),
                              first.windSpeedMetersPerSecond !== null &&
                                formatWind(toKnots(first.windSpeedMetersPerSecond)),
                              first.tide.height !== null &&
                                `marée ${formatHeight(first.tide.height)}`,
                              stage &&
                                `${STAGE_WORDS[stage]}${first.tide.trend && stage !== "low" && stage !== "high" ? (first.tide.trend === "rising" ? " ↑" : " ↓") : ""}`,
                              first.tide.coefficient !== null && `coef ${first.tide.coefficient}`,
                            ]
                              .filter(Boolean)
                              .join(" · ")}
                          </span>
                        </li>
                      );
                    })}
                    {judged.pieces.length > LISTED && (
                      <li className="text-neutral-7">
                        {m.alert_preview_more({ count: judged.pieces.length - LISTED })}
                      </li>
                    )}
                  </ul>
                )}
                {!tried.hasTide && cases.some((one) => asksTide(variant, one.tide)) && (
                  <p className="text-s text-neutral-7">{m.alert_no_tide({ spot: place.name })}</p>
                )}
              </>
            )}
          </div>
        </div>

        <div
          ref={setDockAt}
          className={cn("border-t border-neutral-4 pt-s", docked === null && "hidden")}
        />
        <div className={cn("grid gap-xs pt-s", docked !== null && "hidden")}>
          <p className="text-xs text-neutral-7">Prototype : rien n'est enregistré.</p>
          <div className="flex gap-xs">
            <Button type="button" className="flex-1" disabled>
              {m.alert_save()}
            </Button>
            <Button type="button" variant="outline" onClick={onDone}>
              {m.action_close()}
            </Button>
          </div>
        </div>
      </div>
    </Dock.Provider>
  );
}

function CoefSlider({ ask, onChange }: { ask: TideAsk; onChange: (next: TideAsk) => void }) {
  const value: [number, number] = [ask.coefRange?.min ?? 20, ask.coefRange?.max ?? 120];
  return (
    <div className="grid gap-xxs">
      <Slider
        value={value}
        min={20}
        max={120}
        step={5}
        getAriaLabel={(at) => (at === 0 ? "Coef le plus petit" : "Coef le plus grand")}
        onValueChange={(next) => {
          const [min, max] = next as number[];
          onChange({
            ...ask,
            coefs: undefined,
            coefRange: {
              ...(min !== undefined && min > 20 ? { min } : {}),
              ...(max !== undefined && max < 120 ? { max } : {}),
            },
          });
        }}
      />
      <span className="text-xs text-neutral-7 tabular-nums">
        {value[0]}–{value[1]}
      </span>
    </div>
  );
}

const STEPS = 96;

/** The tide of the two days ahead, full where a case's tide is met, pale elsewhere. */
function ProtoTideChart({
  points,
  extremes,
  variant,
  ask,
}: {
  points: TidePoint[];
  extremes: Extreme[];
  variant: TideVariant;
  ask: TideAsk;
}) {
  const colors = useMemo(() => {
    if (!asksTide(variant, ask) || points.length < 2) return points.length ? [TIDE_COLOR] : [];
    return Array.from({ length: STEPS }, (_, step) => {
      const point = points[Math.round((step / (STEPS - 1)) * (points.length - 1))]!;
      return tideMeets(variant, ask, tideContextAt(point.time, point.value, extremes))
        ? TIDE_COLOR
        : TIDE_PAST_COLOR;
    });
  }, [points, extremes, variant, ask]);
  return (
    <SeaChart
      className="h-28"
      label="Marée des deux jours qui viennent"
      points={points}
      colors={colors}
      formatValue={(value) => formatHeight(value)}
      yAxis={false}
      tooltip={false}
    />
  );
}
