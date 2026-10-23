import type { ArcKey } from "@repo/client/alerts/alert-words";
import { onCompass, startingArc } from "@repo/client/alerts/compass";
import {
  SHORTEST_HOURS,
  STEPS,
  isArcPart,
  isSetValue,
  othersOf,
  tideAt,
  valueAt,
} from "@repo/client/alerts/editing";
import { MAX_ALTERNATIVES } from "@repo/conditions/spots/criteria";
import { COEFFICIENT_BANDS, type TideSegment } from "@repo/config/sea-words";
import { CirclePlusIcon } from "@repo/ui/icon";
import { router } from "expo-router";
import { useEffect, useId, useRef, useState } from "react";
import { InputAccessoryView, Keyboard, Platform, View } from "react-native";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";

import { Button } from "@/components/ui/button";
import { Chip, ChipRow } from "@/components/ui/chip";
import { edge } from "@/components/ui/edge";
import { Input } from "@/components/ui/input";
import { MorphText } from "@/components/ui/morph-text";
import { SheetFooter, SheetRoot } from "@/components/ui/sheet";
import { Text } from "@/components/ui/text";
import { Toggle, ToggleGroup } from "@/components/ui/toggle";
import { formatNumber } from "@/lib/format";
import { useTheme } from "@/lib/theme";
import { useUnits } from "@/lib/units";
import { m } from "@/paraglide/messages";

import { type PartKey, type Writing, readWriting, useWriting } from "./bridge";
import { Compass } from "./compass";
import { CycleDial } from "./cycle-dial";
import { partLabel, partSaid } from "./part-words";
import { RangeSlider } from "./range-slider";
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
// editor's as the web's drawer rises over its sheet, and holds what the drawer holds on a phone:
// the part's name and its value big at the top, in the middle, the value's figures moving to what
// they become; under them the row of the part's values, there from the first with "another
// value", which waits until the value in hand is set; the controls of the part, the web's, and the
// windows of the week as they move, whose place is kept before there are any, which scroll on a
// small phone; and at its foot two buttons, an outlined "any", which leaves the part asking
// nothing, or "remove" for an other value, and "done". Choosing a value moves nothing in it. An
// other value is also added by the "+" of the sentence and opens here at its index, as the web's
// drawer opens for it. As a new alert is said a part at a time, "done" goes on to the next part.
// The sheet reads and writes the editor through `bridge.ts`. Decision 031, "The editor".

/** One end of a sector, typed, for what the dial's steps are too coarse for. */
function DegreeField({
  word,
  label,
  degrees,
  keyboard,
  onChange,
}: {
  word: string;
  label: string;
  degrees: number;
  /** The bar over the number pad that closes it, on iOS, whose pad has no key that does. */
  keyboard: string | undefined;
  onChange: (degrees: number) => void;
}) {
  const { space } = useTheme();
  // What is typed, which may be empty for a moment; the dial's moves write over it.
  const [typed, setTyped] = useState(String(degrees));
  const [isEditing, setEditing] = useState(false);
  useEffect(() => {
    if (!isEditing) setTyped(String(degrees));
  }, [degrees, isEditing]);
  return (
    <View style={{ flex: 1, gap: space.xxs }}>
      <Text
        size="xs"
        tone="muted"
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
      >
        {word}
      </Text>
      <Input
        value={typed}
        end="°"
        keyboardType="number-pad"
        returnKeyType="done"
        maxLength={3}
        inputAccessoryViewID={keyboard}
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
      />
    </View>
  );
}

/**
 * The bar over the number pad of the degrees, on iOS, as Safari's over the web's field: its one
 * button closes the pad. Android's pad has a key of its own that does.
 */
function DegreesKeyboard({ id }: { id: string }) {
  const { colors, space } = useTheme();
  if (Platform.OS !== "ios") return null;
  return (
    <InputAccessoryView nativeID={id} backgroundColor={colors["neutral-2"]}>
      <View
        style={[
          {
            flexDirection: "row",
            justifyContent: "flex-end",
            paddingHorizontal: space.xs,
            paddingVertical: space.xxs,
          },
          edge(colors["neutral-4"]),
        ]}
      >
        <Button variant="ghost" size="xs" onPress={() => Keyboard.dismiss()}>
          {m.native_alert_degrees_done()}
        </Button>
      </View>
    </InputAccessoryView>
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
  partKey: ArcKey & Part;
  index: number;
}) {
  const { space } = useTheme();
  const keyboard = useId();
  const label = partLabel(partKey);
  const value = valueAt(writing.criteria, partKey, index) as Arc | undefined;
  const at = writing.hourNow?.[partKey];
  // Around where it comes from now, when the forecast says, or around the usual.
  const shown = value ?? startingArc(partKey, at);
  const set = (arc: Arc) => writing.setValue(partKey, index, arc);
  return (
    <>
      <Compass arc={shown} now={at} label={label} onChange={set} />
      {/* The bar over the pad stands in the fields' own box, which lays no room between. */}
      <View>
        <View style={{ flexDirection: "row", gap: space.xs }}>
          <DegreeField
            word={m.alert_degrees_from()}
            label={m.alert_sector_from({ label })}
            degrees={shown.from}
            keyboard={Platform.OS === "ios" ? keyboard : undefined}
            onChange={(from) => set({ ...shown, from })}
          />
          <DegreeField
            word={m.alert_degrees_to()}
            label={m.alert_sector_to({ label })}
            degrees={shown.to}
            keyboard={Platform.OS === "ios" ? keyboard : undefined}
            onChange={(to) => set({ ...shown, to })}
          />
        </View>
        <DegreesKeyboard id={keyboard} />
      </View>
    </>
  );
}

/** The name of a group of toggles, small and grey over it, as the web's. */
function GroupName({ children }: { children: string }) {
  return (
    <Text
      size="xs"
      tone="muted"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      {children}
    </Text>
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
  return (
    <>
      <CycleDial value={ask.tideCycle ?? []} onChange={(tideCycle) => choose({ tideCycle })} />
      {before ? (
        <Text size="xs" tone="muted">
          {m.alert_tide_before({ words: before })}
        </Text>
      ) : null}
      {writing.hasCoefficients ? (
        <View style={{ gap: space.xxs }}>
          <GroupName>{m.alert_label_coefficient()}</GroupName>
          <ToggleGroup label={m.alert_label_coefficient()}>
            {COEFFICIENT_BANDS.map((band) => {
              const on = ask.tideCoefficients?.includes(band) ?? false;
              return (
                <Toggle
                  key={band}
                  label={BAND_FIGURES[band]}
                  pressed={on}
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
          </ToggleGroup>
        </View>
      ) : null}
    </>
  );
}

function ShortestControls({ writing }: { writing: Writing }) {
  const { colors } = useTheme();
  const hours = writing.shortestMinutes / 60;
  const tooShort = writing.tideLasts !== null && writing.tideLasts < writing.shortestMinutes;
  return (
    <>
      <ToggleGroup label={m.alert_label_shortest()}>
        {SHORTEST_HOURS.map((one) => (
          <Toggle
            key={one}
            label={m.alert_hours({ count: one })}
            pressed={one === hours}
            onPress={() => {
              if (one !== hours) writing.setShortest(one * 60);
            }}
          />
        ))}
      </ToggleGroup>
      {writing.tideLasts !== null ? (
        // Darker when no window that long can come, as the web says it.
        <Text size="xs" tone="muted" style={tooShort ? { color: colors["neutral-9"] } : undefined}>
          {m.alert_tide_lasts({ lasts: durationWords(writing.tideLasts) })}
        </Text>
      ) : null}
    </>
  );
}

type PartSheetProps = { partKey: PartKey; index: number };

export function PartSheet({ partKey, index }: PartSheetProps) {
  const writing = useWriting();
  const { colors, space } = useTheme();
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
  // Done: the next part of a new alert takes this one's place, as the web's next drawer opens
  // once this one closed; otherwise the sheet closes.
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
  // "Another value" stands beside the values from the first, and waits for this one to be set:
  // the row is there whatever is chosen, so that choosing moves nothing under it.
  const offersAnother = isValue && index <= others && others < MAX_ALTERNATIVES;
  const canAdd = offersAnother && isSetValue(writing.criteria, partKey, index);
  // The tide's words are long: they wrap a step smaller and do not move.
  const isLong = partKey === "tide";

  return (
    // The controls' scroll view stands under the head: SheetRoot keeps react-native-screens from
    // moving it over it. The sheet is as tall as what it holds, and no taller than the screen,
    // where what scrolls gives way.
    <SheetRoot style={{ flexShrink: 1, backgroundColor: colors["cte-canvas"] }}>
      <View
        style={{
          alignItems: "center",
          gap: space.xxs,
          // The web's grab bar and the room under it, where iOS draws its own.
          paddingTop: space.m + space.xxs,
          paddingHorizontal: space.m,
        }}
      >
        <Text
          size="s"
          tone="muted"
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
          style={{ textAlign: "center" }}
        >
          {label}
        </Text>
        <View
          accessible
          accessibilityRole="header"
          accessibilityLiveRegion="polite"
          accessibilityLabel={`${label}: ${said?.spoken ?? value}`}
          style={{ alignSelf: "stretch" }}
        >
          {isLong ? (
            <Text size="m" weight="medium" style={{ textAlign: "center" }}>
              {value}
            </Text>
          ) : (
            <MorphText size="l" weight="medium" numeric align="center" accessible={false}>
              {value}
            </MorphText>
          )}
        </View>
      </View>

      {/* The part's values, from the first, with "Another value" waiting for this one to be set:
          the row is there whatever is chosen, so that choosing moves nothing under it. */}
      {isValue ? (
        <View style={{ paddingHorizontal: space.m, paddingTop: space.m }}>
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
            {offersAnother ? (
              <Chip
                label={m.native_alert_part_another()}
                iconLabel={m.alert_add_value({ label })}
                icon={CirclePlusIcon}
                selected={false}
                disabled={!canAdd}
                onPress={() => router.setParams({ index: String(others + 1) })}
              />
            ) : null}
          </ChipRow>
        </View>
      ) : null}

      <KeyboardAwareScrollView
        keyboardShouldPersistTaps="handled"
        alwaysBounceVertical={false}
        bottomOffset={space.l}
        contentContainerStyle={{
          gap: space.s,
          padding: space.m,
          // The foot stands a small step under what scrolls: together, the web's room.
          paddingBottom: space.m - space.xs,
        }}
      >
        {partKey === "shortest" ? (
          <ShortestControls writing={writing} />
        ) : partKey === "tide" ? (
          <TideControls writing={writing} index={index} />
        ) : isArcPart(partKey) ? (
          <SectorControls writing={writing} partKey={partKey as ArcKey & Part} index={index} />
        ) : (
          <RangeControls writing={writing} partKey={partKey as RangeKey & Part} index={index} />
        )}
        <LiveCount week={writing.week} since={since} />
      </KeyboardAwareScrollView>

      <SheetFooter pinned fit>
        {isValue ? (
          <Button
            variant="outline"
            size="l"
            fill
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
        <Button size="l" fill onPress={goOn}>
          {m.alert_part_done()}
        </Button>
      </SheetFooter>
    </SheetRoot>
  );
}
