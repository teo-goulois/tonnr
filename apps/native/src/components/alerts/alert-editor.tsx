import {
  PLACES_MOST,
  STEPS,
  askedFiguresOf,
  isSetValue,
  longestFitting,
  othersOf,
  tideAsksOf,
  tideLastsOf,
  weekDays,
  weekStateOf,
  withValue,
} from "@repo/client/alerts/editing";
import type { Alert, AlertSettings, Spot } from "@repo/client/viewer/types";
import { ChevronDownIcon, CopyIcon, PauseIcon, PlayIcon, TrashIcon } from "@repo/ui/icon";
import { router } from "expo-router";
import { useEffect, useId, useLayoutEffect, useMemo, useState } from "react";
import { BackHandler, LayoutAnimation, Pressable, View } from "react-native";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { useReducedMotion } from "react-native-reanimated";

import { TextField } from "@/components/lists/text-field";
import { StepHeader } from "@/components/place/save-lists";
import { Glyph } from "@/components/shared/glyph";
import { Button } from "@/components/ui/button";
import { feel } from "@/components/ui/haptics";
import { Row, Section } from "@/components/ui/list";
import { TARGET } from "@/components/ui/metrics";
import { SheetHeader, useSheetGuard } from "@/components/ui/sheet";
import { Surface } from "@/components/ui/surface";
import { Text } from "@/components/ui/text";
import { formatDay } from "@/lib/format";
import { useTheme } from "@/lib/theme";
import { formatHeight, useUnits } from "@/lib/units";
import { m } from "@/paraglide/messages";

import { askToDelete, isPaused } from "./alert-row";
import { type PartKey, publishWriting, withdrawWriting } from "./bridge";
import { type AlertPlace, keepCopy } from "./copies";
import { PlacePicker } from "./place-picker";
import { partLabel, partSaid } from "./part-words";
import { Sentence, type SentencePiece } from "./sentence";
import { placesWords } from "./summary";
import { useAlertActions } from "./use-alerts";
import { useOffshore, usePreview, useSaveAlert, useTideAt } from "./use-alert-editor";
import { WeekPreview } from "./week-preview";
import {
  type AlertDraft,
  CRITERION_LABELS,
  NOTHING_DRAFTED,
  type Part,
  afterAnswer,
  afterRead,
  afterSpotsRead,
  asked,
  durationWords,
  hasSeaAhead,
  heldBack,
  hoursAhead,
  isUnsaved,
  judgeTried,
  loosened,
  openPieces,
  partsToSave,
  setPart,
} from "./words";

// An alert written in a sheet of its own, the web's `AlertEditor` as a phone writes it: Cancel
// and Save in the sheet's header, its name, the places it is set on, and the alert said in one
// sentence whose parts each open a sheet of the platform's over this one, with the controls a
// phone has for them; under it, what the sentence would tell over the week ahead, judged here
// as each part moves by the rules the worker judges by, what holds its windows back, and for an
// alert that is saved its switch, its pause, a copy and deleting it. A new alert is said a part
// at a time. What is written is not lost without a question. Decision 031, "The editor".

/** An alert as an editor holds it: the parts that can be changed. */
export const draftOf = (alert: Alert): AlertDraft => ({
  name: alert.name,
  criteria: alert.criteria,
  enabled: alert.enabled,
  shortestMinutes: alert.shortestMinutes,
  spotIds: alert.spotIds,
  breakIds: alert.breakIds,
});

type AlertEditorProps = {
  now: number;
  /** The place the alert is written from. */
  place: AlertPlace;
  /** The account's spots. */
  spots: Spot[];
  /** The alert that is written: undefined for one that is not saved yet. */
  alert: Alert | undefined;
  /** What a new alert starts from: a copy of another, or a second alert of a place. */
  initial?: AlertDraft;
  /** The places a new alert starts with, named. */
  initialPlaces?: AlertPlace[];
  settings: AlertSettings | undefined;
};

export function AlertEditor({
  now,
  place,
  spots,
  alert,
  initial,
  initialPlaces,
  settings,
}: AlertEditorProps) {
  const owner = useId();
  const { colors, space } = useTheme();
  // The heights and the wind are written in the unit their reader chose.
  useUnits();
  const reduced = useReducedMotion();
  const actions = useAlertActions();
  const { save, isSaving } = useSaveAlert();

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
  // What was changed here, part by part, and what the save on its way sent: the rest follows
  // the alert as it is saved. `alert-words.ts` in packages/client holds the rules.
  const [drafting, setDrafting] = useState(NOTHING_DRAFTED);
  // Whether a spot is still the account's. A list that does not hold the spot the alert is
  // written from is not read yet, and says nothing of what is gone.
  const isKnown = useMemo(() => {
    const known = new Set(spots.map((one) => one.id));
    return place.kind === "break" || known.has(place.id)
      ? (spotId: string) => known.has(spotId)
      : () => true;
  }, [spots, place.kind, place.id]);
  const draft = useMemo(() => {
    const written = { ...saved, ...drafting.changed };
    return written.spotIds.every(isKnown)
      ? written
      : { ...written, spotIds: written.spotIds.filter(isKnown) };
  }, [saved, drafting.changed, isKnown]);
  const set = <Key extends keyof AlertDraft>(key: Key, value: AlertDraft[Key]) =>
    setDrafting((current) => setPart(current, saved, key, value));
  useEffect(() => setDrafting((current) => afterRead(current, saved)), [saved]);
  const isSaved = alert !== undefined;
  useEffect(() => {
    setDrafting((current) => afterSpotsRead(current, saved, isKnown, isSaved));
  }, [isKnown, saved, isSaved]);

  const { criteria } = draft;
  const sent = useMemo(() => asked(criteria), [criteria]);
  const asksSomething = Object.keys(sent).length > 0;
  const zone = settings?.zone ?? undefined;

  // The places of the alert, named from what is known of them: the place it is written from,
  // the copy's, the alert's, the account's spots, and the breaks added here.
  const [added, setAdded] = useState<AlertPlace[]>([]);
  const known = useMemo(() => {
    const byId = new Map<string, AlertPlace>();
    const keep = (one: AlertPlace) => byId.set(one.id, one);
    keep(place);
    initialPlaces?.forEach(keep);
    alert?.places.forEach((one) => {
      const id = one.spotId ?? one.breakId;
      if (id)
        keep({
          kind: one.spotId ? "spot" : "break",
          id,
          name: one.name,
          latitude: one.latitude,
          longitude: one.longitude,
        });
    });
    spots.forEach((one) =>
      keep({
        kind: "spot",
        id: one.id,
        name: one.name,
        latitude: one.latitude,
        longitude: one.longitude,
      }),
    );
    added.forEach(keep);
    return byId;
  }, [place, initialPlaces, alert, spots, added]);
  const places = useMemo(
    () =>
      [
        ...draft.spotIds.map((id) => ({ kind: "spot" as const, id })),
        ...draft.breakIds.map((id) => ({ kind: "break" as const, id })),
      ].map(
        (one): AlertPlace =>
          known.get(one.id) ?? {
            ...one,
            name: "",
            latitude: place.latitude,
            longitude: place.longitude,
          },
      ),
    [draft.spotIds, draft.breakIds, known, place.latitude, place.longitude],
  );
  const nameOf = (placeId: string) => known.get(placeId)?.name ?? "";
  const isFull = places.length >= PLACES_MOST;

  // What the conditions give at each place, judged here over every hour the preview gave.
  const preview = usePreview(draft.spotIds, draft.breakIds);
  const tried = useMemo(
    () =>
      [...draft.spotIds, ...draft.breakIds].flatMap((placeId) => {
        const one = preview.data?.spots.find((spot) => spot.spotId === placeId);
        return one ? [judgeTried(one, sent, draft.shortestMinutes)] : [];
      }),
    [draft.spotIds, draft.breakIds, preview.data, sent, draft.shortestMinutes],
  );
  const ahead = hoursAhead(tried.find((one) => one.spotId === place.id) ?? tried[0], now);
  const hourNow = ahead[0];
  const pieces = openPieces(tried, now);
  const held = heldBack(ahead).slice(0, 2);

  // The tide at the place, which says how long the parts of the cycle asked last.
  const tide = useTideAt(place, now);
  const tideAsks = useMemo(() => tideAsksOf(sent), [sent]);
  const tideLasts = useMemo(
    () => tideLastsOf(tideAsks, tide.tide, tide.extremes),
    [tideAsks, tide.tide, tide.extremes],
  );
  const tooShort = tideLasts !== null && tideLasts < draft.shortestMinutes;
  const fits = longestFitting(tideLasts);
  const offshore = useOffshore(place, spots);

  const weekState = weekStateOf({ asksSomething, failed: preview.isError, tried });
  const week = useMemo(
    () => ({
      count: weekState === "ready" ? pieces.length : null,
      days: weekDays(pieces, now, zone, formatDay).map((day) => day.pieces.length > 0),
    }),
    [weekState, pieces, now, zone],
  );
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

  // A new alert is said a part at a time: the part at `revealed` is the one to answer. An alert
  // that is saved, a copy or a second alert of a place is said whole.
  const [revealed, setRevealed] = useState(alert || initial ? STEPS.length : 0);
  const shows = (step: number) => step <= revealed;

  // What the sheet of a part changes, from what the editor holds when it is asked: a slider
  // that moves faster than the editor is drawn loses no step.
  const setValue = (key: Part, index: number, value: unknown, moving = false) =>
    setDrafting((current) =>
      setPart(
        current,
        saved,
        "criteria",
        withValue(current.changed.criteria ?? saved.criteria, key, index, value, moving),
      ),
    );
  const left = (key: PartKey, index: number, closing: boolean) => {
    if (key !== "shortest" && index > 0) {
      // An other value left with nothing chosen goes.
      setDrafting((current) => {
        const written = current.changed.criteria ?? saved.criteria;
        return isSetValue(written, key, index)
          ? current
          : setPart(current, saved, "criteria", withValue(written, key, index, undefined));
      });
    }
    if (closing) {
      const step = (STEPS as readonly string[]).indexOf(key);
      setRevealed((said) => (step === said ? said + 1 : said));
    }
  };
  useLayoutEffect(() => {
    publishWriting({
      owner,
      criteria,
      shortestMinutes: draft.shortestMinutes,
      revealed,
      zone,
      week,
      hourNow,
      tide: tide.tide,
      extremes: tide.extremes,
      hasTide: tide.hasTide,
      hasCoefficients: tide.hasCoefficients,
      tideLasts,
      offshore,
      setValue,
      setShortest: (minutes) => set("shortestMinutes", minutes),
      left,
    });
  });
  useEffect(() => () => withdrawWriting(owner), [owner]);
  const openPart = (key: PartKey, index = 0) =>
    router.push({ pathname: "/alert/part", params: { part: key, index: String(index) } });

  // The sentence, its parts and their other values, each after "or".
  const part = (key: Part, index: number, step?: number): SentencePiece => {
    const said = partSaid(criteria, key, index);
    return {
      kind: "part",
      part: {
        key: `${key}-${index}`,
        words: said.words,
        spoken: said.spoken,
        label: partLabel(key),
        isSet: said.isSet,
        current: step !== undefined && step === revealed && revealed < STEPS.length,
        onPress: () => openPart(key, index),
      },
    };
  };
  const said = (key: Part, after: string | undefined, step?: number): SentencePiece[] => {
    const list: SentencePiece[] = [part(key, 0, step)];
    for (let index = 1; index <= othersOf(criteria, key); index++) {
      if (isSetValue(criteria, key, index)) list.push({ kind: "or" }, part(key, index));
    }
    const last = list.at(-1);
    if (last?.kind === "part" && after) last.part.after = after;
    return list;
  };
  const words = (text: string): SentencePiece => ({ kind: "words", text });
  const comma = (step: number) => (shows(step) ? "," : undefined);
  const sentence: SentencePiece[] = [
    words(m.alert_says_waves()),
    ...said("waveHeightMeters", comma(1), 0),
    ...(shows(1) ? said("wavePeakPeriodSeconds", comma(2), 1) : []),
    ...(shows(2) ? said("waveDirectionDegrees", comma(3), 2) : []),
    ...(shows(3)
      ? [words(m.alert_says_wind()), ...said("windSpeedMetersPerSecond", comma(4), 3)]
      : []),
    ...(shows(4) ? said("windDirectionDegrees", comma(5), 4) : []),
    ...(shows(5) ? [words(m.alert_says_tide()), ...said("tide", comma(6), 5)] : []),
    ...(shows(6)
      ? [
          words(m.alert_says_lasts()),
          {
            kind: "part" as const,
            part: {
              key: "shortest",
              words: m.alert_hours({ count: draft.shortestMinutes / 60 }),
              label: partLabel("shortest"),
              isSet: true,
              current: revealed === 6,
              after: ".",
              onPress: () => openPart("shortest"),
            },
          },
        ]
      : []),
  ];

  // The swell apart from the wind sea, for whoever asks about it: open by itself on an alert
  // that already asks something of it.
  const [isAdvancedOpen, setAdvancedOpen] = useState(
    () =>
      saved.criteria.primarySwellHeightMeters !== undefined ||
      saved.criteria.primarySwellDirectionDegrees !== undefined,
  );
  const [wantsMail, setWantsMail] = useState(true);
  const [step, setStep] = useState<"sentence" | "places">("sentence");

  const parts = partsToSave(drafting, saved);
  const isDirty = !alert || Object.keys(parts).length > 0;
  const canSave = isDirty && asksSomething && draft.name.trim().length > 0 && !isSaving;
  // Something is written that leaving would lose: a part that was changed, a save that has not
  // answered, or a new alert that asks something already, as a copy does before it is touched.
  const isHeld = isUnsaved(drafting, saved) || (!alert && asksSomething);
  const guard = useSheetGuard(isHeld);
  const asksMail = !alert && settings?.byMail === null && settings.mail !== "off";

  const submit = () => {
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
    void save(alert, whole, patch, asksMail ? wantsMail : undefined).then((answer) => {
      setDrafting((current) => afterAnswer(current, sending, answer && draftOf(answer)));
      if (answer) guard.close();
    });
  };

  const animate = () => {
    if (!reduced) LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
  };

  // Android's back goes from the places to the sentence, as the button over them does.
  useEffect(() => {
    if (step !== "places") return;
    const listener = BackHandler.addEventListener("hardwareBackPress", () => {
      setStep("sentence");
      return true;
    });
    return () => listener.remove();
  }, [step]);

  if (step === "places") {
    const ids = (kind: AlertPlace["kind"]) => (kind === "spot" ? draft.spotIds : draft.breakIds);
    const idsKey = (kind: AlertPlace["kind"]) => (kind === "spot" ? "spotIds" : "breakIds");
    return (
      <PlacePicker
        mode="many"
        near={place}
        chosen={places}
        isFull={isFull}
        onPick={(one) => {
          if (isFull || ids(one.kind).includes(one.id)) return;
          setAdded((all) => [...all.filter((other) => other.id !== one.id), one]);
          set(idsKey(one.kind), [...ids(one.kind), one.id]);
        }}
        onRemove={(one) => {
          if (places.length <= 1) return;
          set(
            idsKey(one.kind),
            ids(one.kind).filter((id) => id !== one.id),
          );
        }}
        header={
          <View style={{ paddingBottom: space.xs }}>
            <StepHeader title={m.native_alert_label_places()} onBack={() => setStep("sentence")} />
          </View>
        }
      />
    );
  }

  const placeNames = places.map((one) => one.name).filter(Boolean);
  if (placeNames.length === 0) placeNames.push(place.name);
  return (
    <View style={{ flex: 1 }}>
      <SheetHeader
        title={alert?.name ?? m.alert_new()}
        onCancel={guard.cancel}
        onSave={submit}
        canSave={canSave}
        saving={isSaving}
      />
      <KeyboardAwareScrollView
        keyboardShouldPersistTaps="handled"
        bottomOffset={space.l}
        contentContainerStyle={{
          gap: space.l,
          paddingHorizontal: space.m,
          paddingTop: space.xs,
          paddingBottom: space.xxl,
        }}
      >
        <View style={{ gap: space.xs }}>
          <Text size="s" weight="medium" tone="muted" nativeID="alert-name">
            {m.alert_name_label()}
          </Text>
          <Surface insetEdge style={{ paddingHorizontal: space.m }}>
            <TextField
              value={draft.name}
              maxLength={80}
              onChangeText={(name) => set("name", name)}
              accessibilityLabel={m.alert_name_label()}
              accessibilityLabelledBy="alert-name"
              autoCapitalize="sentences"
              returnKeyType="done"
              style={{ flex: 0 }}
            />
          </Surface>
        </View>

        <View style={{ gap: space.s }}>
          <Sentence
            size="m"
            pieces={[
              words(m.native_alert_says_at()),
              {
                kind: "part",
                part: {
                  key: "places",
                  words: placesWords(placeNames),
                  label: m.native_alert_label_places(),
                  isSet: true,
                  onPress: () => setStep("places"),
                },
              },
            ]}
          />
          <Sentence pieces={sentence} />
          {tooShort && shows(5) && tideLasts !== null ? (
            <View style={{ gap: space.xs, alignItems: "flex-start" }}>
              <Text size="s" tone="muted">
                {m.alert_tide_short({
                  lasts: durationWords(tideLasts),
                  shortest: durationWords(draft.shortestMinutes),
                })}
              </Text>
              {fits !== undefined ? (
                <Button variant="secondary" onPress={() => set("shortestMinutes", fits * 60)}>
                  {m.alert_tide_short_fit({ hours: m.alert_hours({ count: fits }) })}
                </Button>
              ) : null}
            </View>
          ) : null}
        </View>

        {revealed >= STEPS.length ? (
          <View style={{ gap: space.s }}>
            <Pressable
              accessibilityRole="button"
              accessibilityState={{ expanded: isAdvancedOpen }}
              onPress={() => {
                animate();
                feel("select");
                setAdvancedOpen((open) => !open);
              }}
              style={({ pressed }) => ({
                minHeight: TARGET,
                flexDirection: "row",
                alignItems: "center",
                gap: space.xs,
                opacity: pressed ? 0.6 : 1,
              })}
            >
              <Text size="s" tone="muted" style={{ flexShrink: 1 }}>
                {m.alert_advanced()}
              </Text>
              <View style={{ transform: [{ rotate: isAdvancedOpen ? "180deg" : "0deg" }] }}>
                <Glyph icon={ChevronDownIcon} size={14} color={colors["neutral-7"]} />
              </View>
            </Pressable>
            {isAdvancedOpen ? (
              <View style={{ gap: space.s }}>
                <Text size="s" tone="muted">
                  {m.alert_advanced_about()}
                  {hourNow &&
                  hourNow.waveHeightMeters !== null &&
                  hourNow.primarySwellHeightMeters != null
                    ? ` ${m.alert_advanced_now({
                        waves: formatHeight(hourNow.waveHeightMeters),
                        swell: formatHeight(hourNow.primarySwellHeightMeters),
                      })}`
                    : ""}
                </Text>
                <Sentence
                  pieces={[
                    words(m.alert_says_swell()),
                    ...said("primarySwellHeightMeters", ","),
                    ...said("primarySwellDirectionDegrees", "."),
                  ]}
                />
              </View>
            ) : null}
          </View>
        ) : null}

        <WeekPreview
          state={weekState}
          pieces={pieces}
          asked={askedFiguresOf(sent)}
          now={now}
          zone={zone}
          nameOf={tried.length > 1 ? nameOf : undefined}
          notes={notes}
          credit={
            preview.data
              ? m.native_alert_forecast_credit({
                  attribution: preview.data.forecastSource.attribution,
                })
              : undefined
          }
        />

        {asksSomething && held.length > 0 ? (
          <View style={{ gap: space.xs }}>
            <Text size="s" weight="medium" tone="muted" accessibilityRole="header">
              {m.alert_held_title()}
            </Text>
            <Surface style={{ padding: space.s, gap: space.s }}>
              {held.map(([key, hours]) => (
                <View
                  key={key}
                  style={{ flexDirection: "row", alignItems: "center", gap: space.s }}
                >
                  <Text size="s" style={{ flex: 1 }}>
                    {CRITERION_LABELS[key]()}{" "}
                    <Text size="s" tone="muted">
                      {m.alert_held_alone({ hours })}
                    </Text>
                  </Text>
                  <Button
                    variant="secondary"
                    onPress={() => {
                      feel("select");
                      set("criteria", loosened(criteria, key));
                    }}
                  >
                    {m.alert_loosen()}
                  </Button>
                </View>
              ))}
            </Surface>
          </View>
        ) : null}

        {asksMail ? (
          <Section>
            <Row
              title={m.alert_mail_ask()}
              description={
                settings?.mail === "unchecked"
                  ? m.alert_mail_ask_hint_unchecked()
                  : m.alert_mail_ask_hint()
              }
              toggle={{ value: wantsMail, onChange: setWantsMail }}
            />
          </Section>
        ) : null}

        {alert ? (
          <>
            <Section footer={isPaused(alert) ? undefined : m.native_alert_pause_hint()}>
              <Row
                title={m.alert_enabled_label()}
                toggle={{ value: draft.enabled, onChange: (enabled) => set("enabled", enabled) }}
              />
              <Row
                title={isPaused(alert) ? m.native_alert_resume() : m.native_push_not_today()}
                description={isPaused(alert) ? m.native_alert_paused() : undefined}
                icon={isPaused(alert) ? PlayIcon : PauseIcon}
                chevron={false}
                disabled={actions.pausing}
                onPress={() => (isPaused(alert) ? actions.resume(alert) : actions.pause(alert))}
              />
            </Section>
            <Section>
              <Row
                title={m.native_alert_duplicate()}
                icon={CopyIcon}
                chevron={false}
                disabled={!asksSomething}
                accessibilityHint={m.alert_copy({ name: draft.name })}
                onPress={() => {
                  const key = keepCopy({
                    draft: {
                      ...draft,
                      name: m.alert_copy_name({ name: draft.name }),
                      criteria: sent,
                    },
                    places,
                  });
                  router.replace({ pathname: "/alert/new", params: { copy: key } });
                }}
              />
              <Row
                title={m.alert_delete({ name: alert.name })}
                icon={TrashIcon}
                destructive
                chevron={false}
                onPress={() =>
                  void askToDelete(alert).then((yes) => {
                    if (!yes) return;
                    guard.close();
                    actions.remove(alert);
                  })
                }
              />
            </Section>
          </>
        ) : null}
      </KeyboardAwareScrollView>
    </View>
  );
}
