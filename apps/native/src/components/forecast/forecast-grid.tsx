import { ChevronLeftIcon, ChevronRightIcon } from "@repo/ui/icon";
import {
  type ComponentRef,
  type ReactNode,
  memo,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  Platform,
  Pressable,
  type StyleProp,
  View,
  type ViewStyle,
} from "react-native";
import { GestureDetector, ScrollView, usePanGesture } from "react-native-gesture-handler";
import Animated, {
  Easing,
  type SharedValue,
  useAnimatedRef,
  useAnimatedStyle,
  useReducedMotion,
  useScrollOffset,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import Svg, { Line } from "react-native-svg";

import { type Palette, usePalette } from "@/components/account/display";
import { useReadingLock } from "@/components/charts/reading";
import { Glyph } from "@/components/shared/glyph";
import { feel } from "@/components/ui/haptics";
import { Skeleton } from "@/components/ui/skeleton";
import { Text } from "@/components/ui/text";
import { compassName, formatClock, formatDay } from "@/lib/format";
import { useTheme } from "@/lib/theme";
import { useUnits } from "@/lib/units";
import { m } from "@/paraglide/messages";

import { DirectionArrow, LineGlyph } from "./bearing";
import {
  type Column,
  GRID_ROWS,
  type GridRow,
  STEP_HOURS,
  columnAt,
  dayLengths,
  gridColumns,
  homeOffset,
} from "./grid";
import {
  HOUR_MS,
  type Metric,
  type NumericKey,
  type Sample,
  cellColors,
  directionAt,
  formatMetric,
  inPalette,
  metrics,
  swellMetric,
  valueAt,
  weatherMetrics,
} from "./metrics";

// The days ahead as a table to scroll sideways, as the web's `ForecastGrid` draws it: a column
// every three hours, a row for each value, each cell in the color of what it says, Windguru's or
// the app's. The names of the rows stay at the left while the hours scroll, and a press on them
// folds them. A press on an hour or a day shows every hour, and another goes back; a press held
// still reads the hour under it, felt at each column it crosses; a line stands at now. Pulled
// past its start and held, or by a press held on what that pull shows, it shows the day before.
// A screen reader reads it as one element, an hour at a time.

export { GRID_ROWS, type GridRow } from "./grid";

const COLUMN = 34;
const LABELS = 68;
const ROW = 26;
// The sea's bearing has its degrees under its arrow.
const DEGREES_ROW = 38;
const MODEL_ROW = 20;
const SPACER = 8;
const HEAD_ROW = 24;
const BAND_ROW = 20;
// How far from its hour a buoy's reading still stands for it.
const MEASURED_REACH = 1.5 * HOUR_MS;
// How long a press holds still before it reads the hours under it instead of scrolling.
const HOLD_MS = 350;
// How far a pull goes past the start before it offers the day before, and how long it is held.
const OVERPULL = 48;
const EARLIER_MS = 1500;
// Where the phone keeps whether the rows say their names, as the web's browser does.
const NAMED_KEY = "tonnr:grid-names";

type DirectionKey = "waveDirection" | "swellDirection" | "windDirection";

/** A row of the table, as both the names and the columns draw it. */
type Spec =
  | {
      kind: "value";
      key: string;
      height: number;
      metric: Metric;
      // The metric in the palette's colors.
      colored: Metric;
      numeric: NumericKey;
      label: string;
      unit?: string;
    }
  | { kind: "model"; key: string; height: number; metric: Metric; numeric: NumericKey }
  | { kind: "direction"; key: string; height: number; direction: DirectionKey; degrees: boolean }
  | { kind: "spacer"; key: string; height: number };

type Read = { model: Sample[]; buoy: Sample[]; now: number; step: number };

/** What a row says at a column: a figure, and whether the buoy measured it. */
function valueOf(spec: Extract<Spec, { kind: "value" }>, column: Column, read: Read) {
  const measured =
    column.time > read.now + read.step / 2
      ? undefined
      : valueAt(read.buoy, spec.numeric, column.time, MEASURED_REACH);
  const value = measured ?? valueAt(read.model, spec.numeric, column.time, read.step / 2);
  // An hour without rain leaves its cell empty, as a clear sky does.
  if (
    value !== undefined &&
    spec.metric.hideZero &&
    Number(value.toFixed(spec.metric.digits)) === 0
  ) {
    return { value: undefined, measured: false };
  }
  return { value, measured: measured !== undefined };
}

/** What the model said at an hour the buoy measured, for the row under the buoy's. */
function modelledOf(spec: Extract<Spec, { kind: "model" }>, column: Column, read: Read) {
  const measured =
    column.time > read.now + read.step / 2
      ? undefined
      : valueAt(read.buoy, spec.numeric, column.time, MEASURED_REACH);
  return measured === undefined
    ? undefined
    : valueAt(read.model, spec.numeric, column.time, read.step / 2);
}

function bearingOf(direction: DirectionKey, column: Column, read: Read) {
  return (
    (column.time <= read.now + read.step / 2
      ? directionAt(read.buoy, direction, column.time, MEASURED_REACH)
      : undefined) ?? directionAt(read.model, direction, column.time, read.step / 2)
  );
}

/** The rows the table draws, from the density's choice and what the model gives. */
function specsOf({
  rows,
  palette,
  hasSwell,
  compares,
  measured,
}: {
  rows: GridRow[];
  palette: Palette;
  hasSwell: boolean;
  compares: (key: NumericKey) => boolean;
  measured: boolean;
}): Spec[] {
  const all = metrics();
  const weather = weatherMetrics();
  const swell = swellMetric();
  const specs: Spec[] = [];
  const values = (metric: Metric, label = metric.label, numeric: NumericKey = metric.key) => {
    specs.push({
      kind: "value",
      key: `${numeric}`,
      height: ROW,
      metric,
      colored: inPalette(metric, palette),
      numeric,
      label,
      unit: numeric === "gust" ? undefined : metric.unit,
    });
    if (rows.includes("model") && compares(numeric)) {
      specs.push({ kind: "model", key: `${numeric}-model`, height: MODEL_ROW, metric, numeric });
    }
  };
  const direction = (key: DirectionKey) =>
    specs.push({
      kind: "direction",
      key,
      // The sea's bearing is written in degrees under its arrow: a few degrees tell whether a
      // swell reaches into a bay. The wind's arrow is enough.
      height: key === "windDirection" ? ROW : DEGREES_ROW,
      direction: key,
      degrees: key !== "windDirection",
    });

  if (measured) specs.push({ kind: "spacer", key: "after-measured", height: SPACER });
  values(all.height);
  values(all.period);
  if (rows.includes("energy")) values(all.energy);
  direction("waveDirection");
  // The swell apart from the wind sea, under the whole sea it is a part of.
  if (hasSwell) {
    values(swell);
    direction("swellDirection");
  }
  specs.push({ kind: "spacer", key: "after-sea", height: SPACER });
  values(all.wind);
  if (rows.includes("gusts")) values(all.wind, m.details_gusts(), "gust");
  direction("windDirection");
  specs.push({ kind: "spacer", key: "after-wind", height: SPACER });
  values(weather.cloud);
  values(weather.rain);
  values(weather.air);
  return specs;
}

let named: boolean | undefined;

function storedNamed() {
  try {
    return localStorage.getItem(NAMED_KEY) !== "false";
  } catch {
    return true;
  }
}

/** Whether the rows say their names, kept on the phone. */
function useNamed() {
  const [value, setValue] = useState(() => {
    named ??= storedNamed();
    return named;
  });
  return [
    value,
    (next: boolean) => {
      named = next;
      setValue(next);
      try {
        localStorage.setItem(NAMED_KEY, String(next));
      } catch {
        // A phone that keeps nothing still folds the names until the app is closed.
      }
    },
  ] as const;
}

/**
 * A name over a part of the table that follows it while any column of the part is in view, as
 * the web's sticky names do: it stands at the part's start, keeps to the left edge of the hours
 * once that start has scrolled by, and stops where the part ends. It moves on the scroll's own
 * frames, from `offset`, how far the table has scrolled.
 */
function Sticky({
  offset,
  start,
  width,
  inset = 0,
  style,
  children,
}: {
  offset: SharedValue<number>;
  // Where the part starts among the columns, and how wide it is.
  start: number;
  width: number;
  // The room the part leaves before its name.
  inset?: number;
  style?: StyleProp<ViewStyle>;
  children: ReactNode;
}) {
  const own = useSharedValue(0);
  const follows = useAnimatedStyle(() => ({
    transform: [
      {
        translateX: Math.min(
          Math.max(offset.get() - start, 0),
          Math.max(0, width - inset - own.get()),
        ),
      },
    ],
  }));
  return (
    <Animated.View
      onLayout={(event) => own.set(event.nativeEvent.layout.width)}
      style={[{ flexDirection: "row", alignItems: "center" }, style, follows]}
    >
      {children}
    </Animated.View>
  );
}

/** One hour of the table, every row of it. */
const GridColumn = memo(function GridColumn({
  column,
  specs,
  read,
}: {
  column: Column;
  specs: Spec[];
  read: Read;
}) {
  const { colors } = useTheme();
  // Every other day has a shade under what has no color of its own, as its name has above.
  const ground = column.day % 2 === 1 ? colors["neutral-2"] : undefined;
  return (
    <View style={{ width: COLUMN }}>
      {specs.map((spec) => {
        if (spec.kind === "spacer") {
          return <View key={spec.key} style={{ height: spec.height, backgroundColor: ground }} />;
        }
        if (spec.kind === "direction") {
          const bearing = bearingOf(spec.direction, column, read);
          return (
            <View
              key={spec.key}
              style={{
                height: spec.height,
                alignItems: "center",
                justifyContent: "center",
                gap: 1,
                backgroundColor: ground,
              }}
            >
              {bearing !== undefined && (
                <DirectionArrow fromDegrees={bearing} size={14} color={colors["neutral-9"]} />
              )}
              {bearing !== undefined && spec.degrees && (
                <Text size="xxs" tone="muted" numeric dense numberOfLines={1}>
                  {`${Math.round(((bearing % 360) + 360) % 360) % 360}°`}
                </Text>
              )}
            </View>
          );
        }
        if (spec.kind === "model") {
          const modelled = modelledOf(spec, column, read);
          return (
            <View
              key={spec.key}
              style={{
                height: spec.height,
                alignItems: "center",
                justifyContent: "center",
                backgroundColor: ground,
              }}
            >
              {modelled !== undefined && (
                <Text size="xs" tone="muted" numeric dense numberOfLines={1}>
                  {formatMetric(spec.metric, modelled, false)}
                </Text>
              )}
            </View>
          );
        }
        const { value, measured } = valueOf(spec, column, read);
        const look =
          value === undefined || spec.colored.plain ? undefined : cellColors(spec.colored, value);
        const bold = measured || (value !== undefined && spec.colored.strong?.(value) === true);
        return (
          <View
            key={spec.key}
            style={{
              height: spec.height,
              alignItems: "center",
              justifyContent: "center",
              paddingHorizontal: 1,
              backgroundColor: look?.background ?? ground,
            }}
          >
            {value !== undefined && (
              <Text
                size="xs"
                weight={bold ? "heavy" : "regular"}
                numeric
                dense
                numberOfLines={1}
                adjustsFontSizeToFit
                minimumFontScale={0.75}
                style={look?.color ? { color: look.color } : undefined}
              >
                {formatMetric(spec.metric, value, false)}
              </Text>
            )}
          </View>
        );
      })}
    </View>
  );
});

type ForecastGridProps = {
  model: Sample[];
  // What the buoy measured. Where it has a reading, the table shows it in place of the model's
  // figure, in bold, and the model's under it when the density says.
  measured?: Sample[];
  start: number;
  end: number;
  now: number;
  stepHours?: number;
  place?: { latitude: number; longitude: number };
  // How many columns of the past stay in view before the one of now, when the table opens.
  lead?: number;
  isLoading?: boolean;
  // The rows beyond the waves, their period, the wind and the weather: decision 061.
  rows?: GridRow[];
  // Told how to bring the table back to now while it is scrolled away from it, and that there
  // is nothing to bring back once it is there.
  onAway?: (back: (() => void) | undefined) => void;
  // Shows a day more of the past, while the model holds one.
  onEarlier?: () => void;
};

export function ForecastGrid({
  model,
  measured,
  start,
  end,
  now,
  stepHours = STEP_HOURS,
  place,
  lead = 0,
  isLoading = false,
  rows = GRID_ROWS,
  onAway,
  onEarlier,
}: ForecastGridProps) {
  // Drawn again when the reader changes units: the rows are written in them.
  const units = useUnits();
  const palette = usePalette();
  const { colors, space } = useTheme();
  const reducedMotion = useReducedMotion();
  const lock = useReadingLock();
  const [isNamed, setNamed] = useNamed();
  const labels = isNamed ? LABELS : 0;

  // A press on a day or an hour shows every hour, and another goes back to the table's step.
  const [hourly, setHourly] = useState(false);
  const shownStep = hourly ? 1 : stepHours;
  const step = shownStep * HOUR_MS;
  const columns = useMemo(
    () => gridColumns({ start, end, now, stepHours: shownStep, place }),
    [start, end, now, shownStep, place],
  );
  const days = useMemo(() => dayLengths(columns), [columns]);
  const buoy = useMemo(() => measured ?? [], [measured]);
  const hasSwell = rows.includes("swell") && model.some((sample) => sample.swell !== null);
  const read = useMemo<Read>(() => ({ model, buoy, now, step }), [model, buoy, now, step]);
  // The hours the buoy has a wave height for: the table shows them as measured.
  const measuredFlags = useMemo(
    () =>
      columns.map(
        (column) =>
          column.time <= now + step / 2 &&
          valueAt(buoy, "height", column.time, MEASURED_REACH) !== undefined,
      ),
    [columns, buoy, now, step],
  );
  const lastMeasured = measuredFlags.lastIndexOf(true);
  const specs = useMemo(
    () =>
      specsOf({
        rows,
        palette,
        hasSwell,
        compares: (key) => buoy.some((sample) => sample[key] !== null),
        measured: lastMeasured >= 0,
      }),
    // The rows are written in the reader's units.
    // oxlint-disable-next-line react-hooks/exhaustive-deps
    [rows, palette, hasSwell, buoy, lastMeasured >= 0, units],
  );
  const headHeight = 2 * HEAD_ROW + (lastMeasured >= 0 ? BAND_ROW : 0);
  const bodyHeight = specs.reduce((sum, spec) => sum + spec.height, 0);

  const nowIndex = columns.findIndex((column) => column.isNow);
  const home = homeOffset(columns, lead, COLUMN);
  const scroller = useAnimatedRef<ComponentRef<typeof ScrollView>>();
  // How far the table has scrolled, on the scroll's own frames, for the names that follow it. It
  // is listened to once the table is drawn.
  const offset = useScrollOffset(!isLoading && columns.length > 0 ? scroller : null);
  const scrollX = useRef(0);
  const viewWidth = useRef(0);
  // Where the pressed hour stood in the view, to keep it there once the step changes; and where
  // the table is to stand once its new columns are laid out.
  const anchor = useRef<{ time: number; offset: number } | null>(null);
  const pendingX = useRef<number | null>(null);
  const placed = useRef(false);
  const away = useRef(false);
  const dragging = useRef(false);
  // The hour a screen reader is on, and the one a finger reads.
  const [focus, setFocus] = useState<number>();
  const [reading, setReading] = useState<number>();
  const readColumn = useRef<number | undefined>(undefined);
  // The day before, once a pull offered it, and the hold that takes it while it lasts.
  const [offered, setOffered] = useState(false);
  const [holding, setHolding] = useState<"pull" | "press">();
  const holdTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const holdBy = useRef<"pull" | "press">(undefined);
  const fill = useSharedValue(0);

  function scrollTo(x: number, animated = false) {
    scroller.current?.scrollTo({ x: Math.max(0, x), animated });
    // The names that follow the table stand where it goes at once, before it says it moved: it
    // may move before it is listened to.
    if (!animated) {
      offset.set(
        Math.min(Math.max(0, x), Math.max(0, columns.length * COLUMN - viewWidth.current)),
      );
    }
  }

  // The table opens with now at its left, after the columns of the past it keeps. Once the step
  // changes, or the day before comes in, the hour that was pressed comes back where it stood.
  useLayoutEffect(() => {
    if (isLoading || columns.length === 0) return;
    const kept = anchor.current;
    anchor.current = null;
    if (kept) {
      const index = Math.max(
        0,
        columns.findIndex((column) => column.time >= kept.time),
      );
      pendingX.current = index * COLUMN - kept.offset;
    } else if (!placed.current) {
      pendingX.current = home;
    } else return;
    placed.current = true;
    scrollTo(pendingX.current);
    // Only a new span of time moves the table: the minutes that pass do not.
    // oxlint-disable-next-line react-hooks/exhaustive-deps
  }, [isLoading, columns.length, home]);

  useEffect(() => () => clearTimeout(holdTimer.current), []);
  useEffect(() => {
    fill.set(
      reducedMotion
        ? 0
        : withTiming(holding ? 1 : 0, {
            duration: holding ? EARLIER_MS : 150,
            easing: Easing.linear,
          }),
    );
  }, [holding, reducedMotion, fill]);
  const filled = useAnimatedStyle(() => ({ width: `${fill.get() * 100}%` }));

  function earlier() {
    clearTimeout(holdTimer.current);
    holdTimer.current = undefined;
    holdBy.current = undefined;
    setHolding(undefined);
    setOffered(false);
    if (!onEarlier || columns.length === 0) return;
    feel("done");
    // What was the first hour stays where it stood: the day before comes in on its left.
    anchor.current = { time: columns[0]!.time, offset: 0 };
    onEarlier();
  }
  function startHold(by: "pull" | "press") {
    if (!onEarlier || holdTimer.current !== undefined) return;
    setOffered(true);
    setHolding(by);
    holdBy.current = by;
    holdTimer.current = setTimeout(earlier, EARLIER_MS);
  }
  function stopHold(by: "pull" | "press") {
    if (holdBy.current !== by) return;
    clearTimeout(holdTimer.current);
    holdTimer.current = undefined;
    holdBy.current = undefined;
    setHolding(undefined);
  }

  function onScroll(event: NativeSyntheticEvent<NativeScrollEvent>) {
    const x = event.nativeEvent.contentOffset.x;
    scrollX.current = x;
    if (offered && x > COLUMN * 2) setOffered(false);
    const next = nowIndex >= 0 && Math.abs(x - home) > COLUMN * 2;
    if (next !== away.current) {
      away.current = next;
      onAway?.(next ? () => scrollTo(home, !reducedMotion) : undefined);
    }
    // Pulled past the start and held there, the table takes the day before. A phone that
    // bounces says how far: iOS.
    if (dragging.current && onEarlier) {
      if (x < -OVERPULL) startHold("pull");
      else stopHold("pull");
    }
  }

  // A press held still reads the hour under it, felt at each column it crosses, and holds still
  // what scrolls around it.
  const readAt = (x: number) => {
    if (columns.length === 0) return;
    const clamped = Math.min(Math.max(x, 0), columns.length * COLUMN - 1);
    const index = columnAt(columns, clamped, COLUMN);
    if (index !== readColumn.current) {
      if (readColumn.current !== undefined) feel("select");
      readColumn.current = index;
    }
    setReading(columns[0]!.time + (clamped / COLUMN - 0.5) * step);
  };
  const reader = useRef({ readAt, lock });
  reader.current = { readAt, lock };
  const press = usePanGesture({
    activateAfterLongPress: HOLD_MS,
    runOnJS: true,
    onActivate: (event) => {
      feel("hold");
      readColumn.current = undefined;
      reader.current.lock(true);
      reader.current.readAt(event.x);
    },
    onUpdate: (event) => reader.current.readAt(event.x),
    onFinalize: () => {
      readColumn.current = undefined;
      setReading(undefined);
      reader.current.lock(false);
    },
  });

  // Every hour, or the table's step again, with the hour pressed kept where it stands.
  function toggleHours(time: number) {
    const index = columns.findIndex((column) => column.time >= time);
    anchor.current = { time, offset: Math.max(0, index) * COLUMN - scrollX.current };
    feel("select");
    // The hour a screen reader was on is another column once the step changes: it goes back to
    // now's.
    setFocus(undefined);
    setHourly((every) => !every);
  }

  if (isLoading) return <Skeleton height={256} />;
  if (columns.length === 0) return null;

  const width = columns.length * COLUMN;
  // Where a moment stands on the sheet of columns: a column is drawn around its hour.
  const xOf = (time: number) => ((time - columns[0]!.time) / step + 0.5) * COLUMN;
  const nowX =
    now >= columns[0]!.time - step / 2 && now <= columns.at(-1)!.time + step / 2
      ? xOf(now)
      : undefined;
  const stepLabel = hourly ? m.details_every_step({ hours: stepHours }) : m.details_every_hour();
  const shownFocus = focus ?? Math.max(0, nowIndex);

  // What a screen reader hears of an hour: its moment, then each row's figure.
  const describe = (index: number) => {
    const column = columns[index];
    if (!column) return "";
    const time = new Date(column.time);
    const parts: string[] = [`${formatDay(time)} ${formatClock(time)}`];
    for (const spec of specs) {
      if (spec.kind === "value") {
        const { value } = valueOf(spec, column, read);
        if (value !== undefined) parts.push(`${spec.label} ${formatMetric(spec.metric, value)}`);
      } else if (spec.kind === "direction") {
        const bearing = bearingOf(spec.direction, column, read);
        if (bearing !== undefined && parts.length > 1) {
          parts[parts.length - 1] += `, ${m.alert_from()} ${compassName(bearing)}`;
        }
      }
    }
    return parts.join(". ");
  };
  const goTo = (index: number) => {
    if (index < 0 || index >= columns.length) return;
    setFocus(index);
    scrollTo(index * COLUMN - Math.max(0, viewWidth.current / 2 - COLUMN));
  };

  // A name and its unit, beside its row.
  const names = (
    <View style={{ width: LABELS }}>
      {/* The corner over the days and the hours is empty: each day's name follows its hours. */}
      <View style={{ height: headHeight }} />
      {specs.map((spec) => (
        <View
          key={spec.key}
          style={{
            height: spec.height,
            flexDirection: "row",
            alignItems: "center",
            gap: space.xxs,
            paddingRight: space.xxs,
          }}
        >
          {spec.kind === "value" && (
            <Text size="xs" numberOfLines={1} dense adjustsFontSizeToFit minimumFontScale={0.8}>
              {spec.label}
              {spec.unit ? (
                <Text size="xs" style={{ color: colors["neutral-6"] }}>{` ${spec.unit}`}</Text>
              ) : null}
            </Text>
          )}
          {spec.kind === "model" && (
            <>
              <LineGlyph dashed />
              <Text size="xs" tone="muted" numberOfLines={1} dense>
                {m.details_model()}
              </Text>
            </>
          )}
          {spec.kind === "direction" && (
            <Text size="xs" tone="muted" numberOfLines={1} dense adjustsFontSizeToFit>
              {m.details_direction()}
            </Text>
          )}
        </View>
      ))}
    </View>
  );

  return (
    <View style={{ position: "relative" }}>
      <View style={{ flexDirection: "row" }}>
        {/* The names fold to give the hours their room, and come back from the edge. */}
        {isNamed ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={m.details_row_names()}
            accessibilityState={{ expanded: true }}
            onPress={() => {
              feel("select");
              setNamed(false);
            }}
            style={({ pressed }) => ({
              backgroundColor: pressed ? colors["neutral-2"] : colors["neutral-1"],
            })}
          >
            {names}
          </Pressable>
        ) : (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={m.details_row_names_show()}
            accessibilityState={{ expanded: false }}
            hitSlop={{ right: 12 }}
            onPress={() => {
              feel("select");
              setNamed(true);
            }}
            style={{ width: 14, justifyContent: "center", alignItems: "center" }}
          >
            <Glyph icon={ChevronRightIcon} size={12} color={colors["neutral-7"]} />
          </Pressable>
        )}

        <View
          style={{ flex: 1 }}
          onLayout={(event) => {
            viewWidth.current = event.nativeEvent.layout.width;
          }}
          // A screen reader goes from one hour to the next, and hears each hour's figures.
          accessible
          accessibilityRole="adjustable"
          accessibilityLabel={m.details_week()}
          accessibilityValue={{ text: describe(shownFocus) }}
          accessibilityActions={[
            { name: "increment" },
            { name: "decrement" },
            { name: "hours", label: stepLabel },
          ]}
          onAccessibilityAction={(event) => {
            const action = event.nativeEvent.actionName;
            if (action === "increment") goTo(shownFocus + 1);
            if (action === "decrement") goTo(shownFocus - 1);
            if (action === "hours") toggleHours(columns[shownFocus]?.time ?? columns[0]!.time);
          }}
        >
          <ScrollView
            ref={scroller}
            horizontal
            showsHorizontalScrollIndicator={false}
            scrollEnabled={reading === undefined}
            scrollEventThrottle={16}
            onScroll={onScroll}
            onScrollBeginDrag={(event) => {
              dragging.current = true;
              // A phone that does not bounce has no pull to measure: being at the start offers it.
              if (
                Platform.OS === "android" &&
                onEarlier &&
                event.nativeEvent.contentOffset.x <= 0
              ) {
                setOffered(true);
              }
            }}
            onScrollEndDrag={() => {
              dragging.current = false;
              stopHold("pull");
            }}
            onContentSizeChange={() => {
              if (pendingX.current === null) return;
              scrollTo(pendingX.current);
              pendingX.current = null;
            }}
          >
            <GestureDetector gesture={press}>
              <View style={{ width }}>
                {/* The days, each a band over its hours whose name follows them: a press shows
                    every hour, or the step. */}
                <View style={{ flexDirection: "row", height: HEAD_ROW }}>
                  {[...days.entries()].map(([day, count]) => {
                    const index = columns.findIndex((column) => column.day === day);
                    const first = columns[index]!;
                    return (
                      <Pressable
                        key={first.time}
                        onPress={() => toggleHours(first.time)}
                        style={{
                          width: count * COLUMN,
                          justifyContent: "center",
                          alignItems: "flex-start",
                          overflow: "hidden",
                          backgroundColor: day % 2 === 1 ? colors["neutral-2"] : undefined,
                        }}
                      >
                        {count > 1 && (
                          <Sticky
                            offset={offset}
                            start={index * COLUMN}
                            width={count * COLUMN}
                            style={{ paddingHorizontal: space.xxs }}
                          >
                            <Text size="xs" weight="medium" numberOfLines={1} dense>
                              {formatDay(new Date(first.time))}
                            </Text>
                          </Sticky>
                        )}
                      </Pressable>
                    );
                  })}
                </View>
                <View style={{ flexDirection: "row", height: HEAD_ROW }}>
                  {columns.map((column) => (
                    <Pressable
                      key={column.time}
                      onPress={() => toggleHours(column.time)}
                      style={{
                        width: COLUMN,
                        alignItems: "center",
                        justifyContent: "center",
                        backgroundColor: column.day % 2 === 1 ? colors["neutral-2"] : undefined,
                      }}
                    >
                      <View
                        style={{
                          paddingHorizontal: 4,
                          borderRadius: 9999,
                          backgroundColor: column.isNow ? colors["neutral-10"] : undefined,
                        }}
                      >
                        <Text
                          size="xs"
                          weight={column.isNow ? "medium" : "regular"}
                          numeric
                          dense
                          style={{
                            color: column.isNow
                              ? colors["neutral-1"]
                              : column.night
                                ? colors["neutral-6"]
                                : colors["neutral-9"],
                          }}
                        >
                          {String(new Date(column.time).getHours()).padStart(2, "0")}
                        </Text>
                      </View>
                    </Pressable>
                  ))}
                </View>
                {lastMeasured >= 0 && (
                  // Which hours are the buoy's and which the model's, said once above the figures,
                  // each name following its hours.
                  <View style={{ flexDirection: "row", height: BAND_ROW }}>
                    <View
                      style={{
                        width: (lastMeasured + 1) * COLUMN,
                        justifyContent: "center",
                        alignItems: "flex-start",
                        borderBottomWidth: 2,
                        borderBottomColor: colors["neutral-10"],
                      }}
                    >
                      <Sticky
                        offset={offset}
                        start={0}
                        width={(lastMeasured + 1) * COLUMN}
                        style={{ gap: space.xxs, paddingRight: space.xs }}
                      >
                        <LineGlyph />
                        <Text size="xs" weight="medium" numberOfLines={1} dense>
                          {m.details_buoy()}
                        </Text>
                      </Sticky>
                    </View>
                    {lastMeasured + 1 < columns.length && (
                      <View
                        style={{
                          flex: 1,
                          justifyContent: "center",
                          alignItems: "flex-start",
                          paddingLeft: space.xs,
                        }}
                      >
                        <Sticky
                          offset={offset}
                          start={(lastMeasured + 1) * COLUMN}
                          width={(columns.length - lastMeasured - 1) * COLUMN}
                          inset={space.xs}
                          style={{ gap: space.xxs, paddingRight: space.xs }}
                        >
                          <LineGlyph dashed />
                          <Text size="xs" tone="muted" numberOfLines={1} dense>
                            {m.details_model()}
                          </Text>
                        </Sticky>
                        {/* The model's hours are underlined in dashes, drawn as a line of a chart
                            is: iOS draws no dashed border on one side alone, and a line is drawn
                            alike on both platforms. */}
                        <Svg
                          width={(columns.length - lastMeasured - 1) * COLUMN}
                          height={1}
                          pointerEvents="none"
                          style={{ position: "absolute", left: 0, bottom: 0 }}
                        >
                          <Line
                            x1={0}
                            x2={(columns.length - lastMeasured - 1) * COLUMN}
                            y1={0.5}
                            y2={0.5}
                            stroke={colors["neutral-6"]}
                            strokeWidth={1}
                            strokeDasharray="3 3"
                          />
                        </Svg>
                      </View>
                    )}
                  </View>
                )}
                <View style={{ flexDirection: "row" }}>
                  {columns.map((column) => (
                    <GridColumn key={column.time} column={column} specs={specs} read={read} />
                  ))}
                </View>

                {nowX !== undefined && (
                  <View
                    pointerEvents="none"
                    style={{
                      position: "absolute",
                      left: nowX,
                      top: headHeight,
                      height: bodyHeight,
                      width: 1,
                      backgroundColor: colors["neutral-5"],
                    }}
                  />
                )}
                {reading !== undefined && (
                  <View
                    pointerEvents="none"
                    style={{ position: "absolute", top: 0, bottom: 0, left: xOf(reading) - 1 }}
                  >
                    <View
                      style={{
                        position: "absolute",
                        top: 0,
                        bottom: 0,
                        width: 2,
                        backgroundColor: colors["neutral-10"],
                      }}
                    />
                    <View
                      style={{
                        position: "absolute",
                        top: 0,
                        left: Math.min(
                          Math.max(-xOf(reading) + scrollX.current + 4, -48),
                          scrollX.current + viewWidth.current - xOf(reading) - 100,
                        ),
                        width: 96,
                        alignItems: "center",
                        paddingVertical: 1,
                        borderRadius: 9999,
                        backgroundColor: colors["neutral-10"],
                      }}
                    >
                      <Text
                        size="xs"
                        weight="medium"
                        numeric
                        dense
                        numberOfLines={1}
                        style={{ color: colors["neutral-1"] }}
                      >
                        {`${formatDay(new Date(reading))} ${formatClock(
                          new Date(Math.round(reading / (5 * 60_000)) * 5 * 60_000),
                        )}`}
                      </Text>
                    </View>
                  </View>
                )}
              </View>
            </GestureDetector>
          </ScrollView>
        </View>
      </View>

      {offered && onEarlier && (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={m.details_earlier_hold()}
          // A screen reader has no hold: its press takes the day at once.
          accessibilityActions={[{ name: "activate" }]}
          onAccessibilityAction={(event) => {
            if (event.nativeEvent.actionName === "activate") earlier();
          }}
          onPressIn={() => startHold("press")}
          onPressOut={() => stopHold("press")}
          hitSlop={8}
          style={{
            position: "absolute",
            left: labels + 8,
            top: headHeight + bodyHeight / 2 - 16,
            minHeight: 32,
            flexDirection: "row",
            alignItems: "center",
            gap: space.xxs,
            overflow: "hidden",
            paddingLeft: space.xs,
            paddingRight: space.s,
            borderRadius: 9999,
            backgroundColor: colors["neutral-10"],
          }}
        >
          {/* Fills while the hold lasts, and empties at once when it stops. */}
          <Animated.View
            pointerEvents="none"
            style={[
              {
                position: "absolute",
                top: 0,
                bottom: 0,
                left: 0,
                backgroundColor: colors["neutral-1"],
                opacity: 0.25,
              },
              filled,
            ]}
          />
          <Glyph icon={ChevronLeftIcon} size={12} color={colors["neutral-1"]} />
          <Text size="xs" weight="medium" dense style={{ color: colors["neutral-1"] }}>
            {m.details_earlier_hold()}
          </Text>
        </Pressable>
      )}
    </View>
  );
}
