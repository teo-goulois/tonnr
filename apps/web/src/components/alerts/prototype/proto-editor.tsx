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
import { PlusIcon, XIcon } from "@repo/ui/icon";
import { cn } from "@repo/ui/lib/utils";
import { TIDE_STAGES, type TideStage } from "@repo/config/sea-words";
import { useQuery } from "@tanstack/react-query";
import { type ReactNode, useEffect, useId, useMemo, useState } from "react";

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

/** A part of the sentence that opens what changes it: the editor's own, copied. */
function Slot({
  label,
  words,
  shown = words,
  isSet,
  isWide = false,
  children,
}: {
  label: string;
  words: string;
  shown?: ReactNode;
  isSet: boolean;
  isWide?: boolean;
  children: ReactNode;
}) {
  return (
    <Popover>
      <PopoverTrigger
        nativeButton={false}
        render={
          <span
            aria-label={`${label} : ${words}`}
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

  const judged = useMemo(
    () => judge(tried, cases, variant, extremes, shortestMinutes, now),
    [tried, cases, variant, extremes, shortestMinutes, now],
  );
  const asksAny = cases.some((one) => asksSomething(variant, one));
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
  ) {
    const scale = RANGES[key];
    const label = scale.label();
    const value = one.criteria[key];
    const ends = sliderEnds(key, value);
    const thumbs = thumbsOf(key, value, ends);
    const isSet = isSetRange(value);
    return (
      <Slot label={label} isSet={isSet} words={isSet ? said(rangeWords(key, value)) : any}>
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
            update(index, {
              criteria: {
                ...one.criteria,
                [key]: rangeAfter(key, value, thumbs, next as number[], ends),
              },
            })
          }
        />
        <span className="text-xs text-neutral-7">{m.alert_slider_hint()}</span>
      </Slot>
    );
  }

  function sector(
    one: Case,
    index: number,
    key: ArcKey,
    at: number | null | undefined,
    usual: Arc,
  ) {
    const value = one.criteria[key];
    const label = CRITERION_LABELS[key]();
    const around: Arc =
      at == null
        ? usual
        : {
            from: (Math.round((at - 30) / 5) * 5 + 360) % 360,
            to: (Math.round((at + 30) / 5) * 5 + 360) % 360,
          };
    const setArc = (arc: Arc | undefined) =>
      update(index, { criteria: { ...one.criteria, [key]: arc } });
    return (
      <Slot
        label={label}
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
        {value ? (
          <>
            <CompassDial arc={value} now={at} label={label} onChange={setArc} />
            <Button type="button" size="sm" variant="outline" onClick={() => setArc(undefined)}>
              {m.alert_sector_any()}
            </Button>
          </>
        ) : (
          <Button type="button" size="sm" onClick={() => setArc(around)}>
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

  function tidePart(one: Case, index: number) {
    const ask = one.tide;
    const setAsk = (next: TideAsk) => update(index, { tide: next });
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
    const note = index === 0 && prefilled && !touched && (
      <span className="text-xs text-neutral-7">Rempli d'après le spot : {prefilled}.</span>
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
          <span className="text-xs text-neutral-7">
            Touchez les parties de la marée qui marchent.
          </span>
        </>
      );
    }
    return (
      <Slot label="Marée" isSet={isSet} isWide words={isSet ? words : any}>
        {note}
        {body}
        {isSet && (
          <Button type="button" size="sm" variant="ghost" onClick={() => setAsk({})}>
            Toute marée
          </Button>
        )}
      </Slot>
    );
  }

  function sentence(one: Case, index: number, lead: string, ending: ReactNode) {
    return (
      <>
        {lead}{" "}
        {range(one, index, "waveHeightMeters", m.alert_any_height(), (said) =>
          m.alert_height_of({ range: said }),
        )}
        ,{" "}
        {range(one, index, "wavePeakPeriodSeconds", m.alert_any_period(), (said) =>
          m.alert_period_of({ range: said }),
        )}
        ,{" "}
        {sector(one, index, "waveDirectionDegrees", seaNow?.waveDirectionDegrees, {
          from: 250,
          to: 310,
        })}
        , {m.alert_says_wind()}{" "}
        {range(one, index, "windSpeedMetersPerSecond", m.alert_any_wind(), (said) =>
          m.alert_wind_at({ range: said }),
        )}
        ,{" "}
        {sector(one, index, "windDirectionDegrees", seaNow?.windDirectionDegrees, {
          from: 45,
          to: 135,
        })}
        , {m.alert_says_tide()} {tidePart(one, index)}
        {ending}
      </>
    );
  }

  const shortestSlot = (
    <Slot
      label={m.alert_label_shortest()}
      isSet
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

        {proto.or === "1" ? (
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
                            first.waveHeightMeters !== null && formatHeight(first.waveHeightMeters),
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

      <div className="grid gap-xs pt-s">
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
