import {
  SHORTEST_HOURS,
  STEPS,
  isArcPart,
  isSetValue,
  othersOf,
  tideAsksOf,
  tideAt,
  valueAt,
} from "@repo/client/alerts/editing";
import { type ShoreWind, shoreWind } from "@repo/conditions/shore-wind";
import { MAX_ALTERNATIVES } from "@repo/conditions/spots/criteria";
import { COEFFICIENT_BANDS, type TideSegment } from "@repo/config/sea-words";
import { CirclePlusIcon } from "@repo/ui/icon";
import { router } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Button } from "@/components/ui/button";
import { Chip, ChipRow } from "@/components/ui/chip";
import { TARGET } from "@/components/ui/metrics";
import { Segmented } from "@/components/ui/segmented";
import { Text } from "@/components/ui/text";
import { formatNumber } from "@/lib/format";
import { useTheme } from "@/lib/theme";
import { useUnits } from "@/lib/units";
import { m } from "@/paraglide/messages";

import { type PartKey, type Writing, readWriting, useWriting } from "./bridge";
import { Compass } from "./compass";
import { onCompass, sameArc, shoreSectors } from "./compass-angles";
import { CycleDial } from "./cycle-dial";
import { partLabel, partSaid, sectorWords } from "./part-words";
import { RangeSlider } from "./range-slider";
import { AlertTideChart } from "./tide-chart";
import { LiveCount } from "./week-preview";
import {
  type Arc,
  BAND_FIGURES,
  type Part,
  RANGES,
  type Range,
  type RangeKey,
  durationWords,
  isSetRange,
  rangeAfter,
  sliderEnds,
  thumbsOf,
  tideWords,
} from "./words";

// What changes a part of an alert's sentence, in a sheet of the platform's that rises over the
// editor's as the web's drawer rises over its sheet: the part's name and its value big at the
// top, the controls a phone has for it, the windows of the week as they move, and two buttons,
// "any", which leaves the part asking nothing, and "done". A part takes other values, chosen
// above its controls and added with a "+", and one of them is taken out with "remove". As a new
// alert is said a part at a time, "next" goes on to the next part in the same sheet. The sheet
// reads and writes the editor through `bridge.ts`. Decision 031, "The editor".

const SHORE_WORDS: Record<ShoreWind, () => string> = {
  offshore: m.wind_offshore,
  cross_offshore: m.wind_cross_offshore,
  cross_shore: m.wind_cross_shore,
  cross_onshore: m.wind_cross_onshore,
  onshore: m.wind_onshore,
};

// Where the swell or the wind comes from at this hour, by the part's own figure.
const NOW_OF: Partial<
  Record<Part, "waveDirectionDegrees" | "primarySwellDirectionDegrees" | "windDirectionDegrees">
> = {
  waveDirectionDegrees: "waveDirectionDegrees",
  primarySwellDirectionDegrees: "primarySwellDirectionDegrees",
  windDirectionDegrees: "windDirectionDegrees",
};

/** A sector around a bearing, sixty degrees wide, on the dial's steps. */
const around = (at: number): Arc => ({
  from: onCompass(Math.round((at - 30) / 5) * 5),
  to: onCompass(Math.round((at + 30) / 5) * 5),
});

/** One end of a sector, typed, for what the dial's steps are too coarse for. */
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
  const { colors, space, radius } = useTheme();
  // What is typed, which may be empty for a moment; the dial's moves write over it.
  const [typed, setTyped] = useState(String(degrees));
  const [isEditing, setEditing] = useState(false);
  useEffect(() => {
    if (!isEditing) setTyped(String(degrees));
  }, [degrees, isEditing]);
  return (
    <View style={{ flex: 1, gap: space.xxs }}>
      <Text size="xs" tone="muted">
        {word}
      </Text>
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          minHeight: TARGET,
          paddingHorizontal: space.s,
          borderRadius: radius.xs,
          borderCurve: "continuous",
          backgroundColor: colors["neutral-3"],
        }}
      >
        <TextInput
          value={typed}
          keyboardType="number-pad"
          maxLength={3}
          accessibilityLabel={label}
          onFocus={() => setEditing(true)}
          onBlur={() => {
            setEditing(false);
            setTyped(String(degrees));
          }}
          onChangeText={(text) => {
            setTyped(text);
            const number = Number(text);
            if (text === "" || !Number.isFinite(number)) return;
            onChange(onCompass(Math.round(number)));
          }}
          className="text-m font-normal text-neutral-10"
          style={{ flex: 1, paddingVertical: space.xs, fontVariant: ["tabular-nums"] }}
        />
        <Text tone="muted">°</Text>
      </View>
    </View>
  );
}

function RangeControls({
  writing,
  partKey,
  index,
}: {
  writing: Writing;
  partKey: RangeKey & Part;
  index: number;
}) {
  const scale = RANGES[partKey];
  const label = scale.label();
  const value = valueAt(writing.criteria, partKey, index) as Range | undefined;
  const ends = sliderEnds(partKey, value);
  const thumbs = thumbsOf(partKey, value, ends);
  return (
    <RangeSlider
      leastLabel={m.alert_slider_least({ label })}
      mostLabel={m.alert_slider_most({ label })}
      values={thumbs}
      min={ends[0]}
      max={ends[1]}
      step={scale.step}
      format={(shown) => scale.unit(formatNumber(shown, scale.digits))}
      onChange={(next) =>
        writing.setValue(partKey, index, rangeAfter(partKey, value, thumbs, next, ends), true)
      }
    />
  );
}

function SectorControls({
  writing,
  partKey,
  index,
}: {
  writing: Writing;
  partKey: Part;
  index: number;
}) {
  const { space } = useTheme();
  const label = partLabel(partKey);
  const value = valueAt(writing.criteria, partKey as Exclude<Part, "tide">, index) as
    | Arc
    | undefined;
  const field = NOW_OF[partKey];
  const at = field ? writing.hourNow?.[field] : null;
  const isWind = partKey === "windDirectionDegrees";
  // Around where it comes from now, when the forecast says, or around the usual.
  const shown =
    value ?? (at != null ? around(at) : isWind ? { from: 45, to: 135 } : { from: 250, to: 310 });
  const set = (arc: Arc) => writing.setValue(partKey, index, arc);
  const offshore = isWind ? writing.offshore : null;
  const sectors = offshore != null ? shoreSectors(offshore) : null;
  const words = sectorWords(shown);
  const meets =
    offshore != null
      ? [shoreWind(shown.from, offshore), shoreWind(shown.to, offshore)].map((one) =>
          SHORE_WORDS[one](),
        )
      : [];
  return (
    <View style={{ gap: space.s }}>
      <Compass arc={shown} now={at} offshore={offshore} label={label} onChange={set} />
      <View accessible style={{ alignItems: "center", gap: 2 }}>
        <Text size="s" weight="medium" numeric accessibilityLabel={words.spoken}>
          {words.shown}
        </Text>
        {meets.length > 0 ? (
          <Text size="xs" tone="muted">
            {meets[0] === meets[1] ? meets[0] : `${meets[0]} – ${meets[1]}`}
          </Text>
        ) : null}
      </View>
      {sectors ? (
        <View style={{ gap: space.xxs }}>
          <Text size="xs" tone="muted" accessibilityRole="header">
            {m.native_alert_wind_shore()}
          </Text>
          <ChipRow label={m.native_alert_wind_shore()}>
            {(
              [
                [sectors.offshore, m.wind_offshore()],
                [sectors.crossOffshore, m.native_alert_wind_to_cross_offshore()],
                [sectors.crossShore, m.native_alert_wind_to_cross_shore()],
              ] as const
            ).map(([arc, name]) => (
              <Chip
                key={name}
                label={name}
                selected={sameArc(value, arc)}
                onPress={() => set(arc)}
              />
            ))}
          </ChipRow>
        </View>
      ) : null}
      <View style={{ flexDirection: "row", gap: space.xs }}>
        <DegreeField
          word={m.alert_degrees_from()}
          label={m.alert_sector_from({ label })}
          degrees={shown.from}
          onChange={(from) => set({ ...shown, from })}
        />
        <DegreeField
          word={m.alert_degrees_to()}
          label={m.alert_sector_to({ label })}
          degrees={shown.to}
          onChange={(to) => set({ ...shown, to })}
        />
      </View>
    </View>
  );
}

function TideControls({ writing, index }: { writing: Writing; index: number }) {
  const { space } = useTheme();
  const ask = tideAt(writing.criteria, index);
  // A height and a way, from before the cycle: the cycle takes their place once it is chosen.
  const before =
    isSetRange(ask.tideHeightMeters) || ask.tideTrend !== undefined
      ? tideWords({ tideHeightMeters: ask.tideHeightMeters, tideTrend: ask.tideTrend })
      : undefined;
  const choose = (next: {
    tideCycle?: TideSegment[];
    tideCoefficients?: (typeof COEFFICIENT_BANDS)[number][];
  }) =>
    writing.setValue("tide", index, {
      tideCycle: ask.tideCycle,
      tideCoefficients: ask.tideCoefficients,
      ...next,
    });
  const cycles = tideAsksOf(writing.criteria).flatMap((one) =>
    one.tideCycle ? [one.tideCycle] : [],
  );
  const lasts =
    writing.tideLasts === null
      ? undefined
      : m.alert_tide_lasts({ lasts: durationWords(writing.tideLasts) });
  return (
    <View style={{ gap: space.s }}>
      <CycleDial value={ask.tideCycle ?? []} onChange={(tideCycle) => choose({ tideCycle })} />
      {before ? (
        <Text size="xs" tone="muted">
          {m.alert_tide_before({ words: before })}
        </Text>
      ) : null}
      {writing.hasCoefficients ? (
        <View style={{ gap: space.xxs }}>
          <Text size="xs" tone="muted" accessibilityRole="header">
            {m.alert_label_coefficient()}
          </Text>
          <ChipRow label={m.alert_label_coefficient()}>
            {COEFFICIENT_BANDS.map((band) => {
              const on = ask.tideCoefficients?.includes(band) ?? false;
              return (
                <Chip
                  key={band}
                  label={BAND_FIGURES[band]}
                  iconLabel={m.alert_label_coefficient()}
                  selected={on}
                  onPress={() =>
                    choose({
                      tideCoefficients: COEFFICIENT_BANDS.filter((one) =>
                        one === band ? !on : (ask.tideCoefficients ?? []).includes(one),
                      ),
                    })
                  }
                />
              );
            })}
          </ChipRow>
        </View>
      ) : null}
      {writing.hasTide && writing.tide.length > 1 ? (
        <View style={{ gap: space.xxs }}>
          <AlertTideChart
            tide={writing.tide}
            extremes={writing.extremes}
            cycles={cycles}
            zone={writing.zone}
            label={[m.native_alert_tide_ahead(), lasts].filter(Boolean).join(" ")}
          />
          <Text size="xs" tone="muted">
            {[m.native_alert_tide_ahead(), lasts].filter(Boolean).join(" ")}
          </Text>
        </View>
      ) : !writing.hasTide ? (
        <Text size="xs" tone="muted">
          {m.native_alert_tide_none()}
        </Text>
      ) : null}
    </View>
  );
}

function ShortestControls({ writing }: { writing: Writing }) {
  const { space } = useTheme();
  const hours = writing.shortestMinutes / 60;
  const tooShort = writing.tideLasts !== null && writing.tideLasts < writing.shortestMinutes;
  return (
    <View style={{ gap: space.s }}>
      <Segmented
        label={m.alert_label_shortest()}
        fill
        options={SHORTEST_HOURS.map((one) => ({
          value: String(one),
          label: m.alert_hours({ count: one }),
        }))}
        value={
          SHORTEST_HOURS.includes(hours as (typeof SHORTEST_HOURS)[number]) ? String(hours) : null
        }
        onChange={(chosen) => writing.setShortest(Number(chosen) * 60)}
      />
      {writing.tideLasts !== null ? (
        <Text size="xs" tone={tooShort ? "default" : "muted"}>
          {tooShort
            ? m.alert_tide_short({
                lasts: durationWords(writing.tideLasts),
                shortest: durationWords(writing.shortestMinutes),
              })
            : m.alert_tide_lasts({ lasts: durationWords(writing.tideLasts) })}
        </Text>
      ) : null}
    </View>
  );
}

type PartSheetProps = { partKey: PartKey; index: number };

export function PartSheet({ partKey, index }: PartSheetProps) {
  const writing = useWriting();
  const { space } = useTheme();
  const insets = useSafeAreaInsets();
  // The heights and the wind are written in the unit their reader chose.
  useUnits();

  // With no editor under it, the sheet has nothing to change.
  useEffect(() => {
    if (!writing && router.canGoBack()) router.back();
  }, [writing]);
  // The count as the part opened: what is chosen here is said against it.
  const [since, setSince] = useState<number | null>(() => readWriting()?.week.count ?? null);
  useEffect(() => setSince(readWriting()?.week.count ?? null), [partKey, index]);
  // Leaving a value tells the editor, which takes an empty other value away; closing the sheet
  // also says the next part of a new alert.
  const shown = useRef({ partKey, index });
  useEffect(() => {
    shown.current = { partKey, index };
    return () => readWriting()?.left(partKey, index, false);
  }, [partKey, index]);
  useEffect(
    () => () => {
      const { partKey: key, index: at } = shown.current;
      readWriting()?.left(key, at, true);
    },
    [],
  );

  if (!writing) return null;
  const label = partLabel(partKey);
  const step = (STEPS as readonly string[]).indexOf(partKey);
  const isGuided = index === 0 && step >= 0 && step === writing.revealed;
  const next = isGuided && step < STEPS.length - 1 ? STEPS[step + 1] : undefined;
  const goOn = () => {
    if (next) {
      writing.left(partKey, index, true);
      router.setParams({ part: next, index: "0" });
    } else router.back();
  };

  const isValue = partKey !== "shortest";
  const others = isValue ? othersOf(writing.criteria, partKey) : 0;
  const said = isValue ? partSaid(writing.criteria, partKey, index) : undefined;
  const value = isValue
    ? (said?.value ?? "")
    : m.alert_hours({ count: writing.shortestMinutes / 60 });
  const canAdd =
    isValue &&
    index <= others &&
    isSetValue(writing.criteria, partKey, index) &&
    others < MAX_ALTERNATIVES;

  return (
    <View
      style={{
        gap: space.m,
        paddingTop: space.l,
        paddingHorizontal: space.m,
        paddingBottom: Math.max(insets.bottom, space.m),
      }}
    >
      <View style={{ gap: space.xxs }}>
        <Text size="s" tone="muted">
          {label}
        </Text>
        <Text
          size="l"
          weight="medium"
          numeric
          accessibilityRole="header"
          accessibilityLiveRegion="polite"
          accessibilityLabel={said?.spoken ? `${label}: ${said.spoken}` : `${label}: ${value}`}
        >
          {value}
        </Text>
      </View>

      {isValue && (others > 0 || index > others || canAdd) ? (
        <ChipRow label={label} bleed={space.m}>
          {Array.from({ length: Math.max(others, index) + 1 }, (_, at) => {
            const one = at <= others ? partSaid(writing.criteria, partKey, at) : undefined;
            const name = one?.isSet
              ? one.value
              : at === 0
                ? m.alert_part_any()
                : m.alert_to_choose();
            return (
              <Chip
                // The values of a part keep their order: nothing else tells them apart.
                // oxlint-disable-next-line react/no-array-index-key
                key={at}
                label={at === 0 ? name : `${m.alert_or_word()} ${name}`}
                selected={at === index}
                onPress={() => router.setParams({ index: String(at) })}
              />
            );
          })}
          {canAdd ? (
            <Chip
              label={m.native_alert_part_another()}
              iconLabel={m.alert_add_value({ label })}
              icon={CirclePlusIcon}
              selected={false}
              onPress={() => router.setParams({ index: String(others + 1) })}
            />
          ) : null}
        </ChipRow>
      ) : null}

      {partKey === "shortest" ? (
        <ShortestControls writing={writing} />
      ) : partKey === "tide" ? (
        <TideControls writing={writing} index={index} />
      ) : isArcPart(partKey) ? (
        <SectorControls writing={writing} partKey={partKey} index={index} />
      ) : (
        <RangeControls writing={writing} partKey={partKey as RangeKey & Part} index={index} />
      )}

      <LiveCount week={writing.week} since={since} />

      <View style={{ flexDirection: "row", gap: space.xs }}>
        {isValue ? (
          <Button
            variant="secondary"
            style={{ flex: 1 }}
            onPress={() => {
              if (index === 0) {
                // "Any": the part asks nothing, and a new alert goes on to its next part.
                writing.setValue(partKey, 0, undefined);
                goOn();
                return;
              }
              if (index <= others) writing.setValue(partKey, index, undefined);
              router.back();
            }}
          >
            {index === 0 ? m.alert_part_any() : m.alert_part_remove()}
          </Button>
        ) : null}
        <Button style={{ flex: 1 }} onPress={goOn}>
          {next ? m.native_alert_part_next() : m.alert_part_done()}
        </Button>
      </View>
    </View>
  );
}
