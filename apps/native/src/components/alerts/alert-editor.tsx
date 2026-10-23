import {
  PLACES_MOST,
  STEPS,
  askedFiguresOf,
  isSetValue,
  longestFitting,
  tideAsksOf,
  tideLastsOf,
  weekDays,
  weekStateOf,
  withValue,
} from "@repo/client/alerts/editing";
import type { Alert, AlertCriteria, AlertSettings, Spot } from "@repo/client/viewer/types";
import { ChevronDownIcon, CopyIcon, TrashIcon } from "@repo/ui/icon";
import { router } from "expo-router";
import { type ReactNode, useEffect, useId, useLayoutEffect, useMemo, useState } from "react";
import { LayoutAnimation, Platform, Pressable, View } from "react-native";
import { KeyboardStickyView } from "react-native-keyboard-controller";
import { useReducedMotion } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { z } from "zod";

import { Glyph } from "@/components/shared/glyph";
import { Button, IconButton } from "@/components/ui/button";
import { FormScroll, useAppForm, useFormSend } from "@/components/ui/form";
import { feel } from "@/components/ui/haptics";
import { Row, Section } from "@/components/ui/list";
import { TARGET } from "@/components/ui/metrics";
import { PanelHeader, SheetFooter, SheetRoot, useSheetGuard } from "@/components/ui/sheet";
import { Text } from "@/components/ui/text";
import { Toggle, ToggleGroup } from "@/components/ui/toggle";
import { formatDay } from "@/lib/format";
import { useTheme } from "@/lib/theme";
import { formatHeight, useUnits } from "@/lib/units";
import { m } from "@/paraglide/messages";

import { askToDelete } from "./alert-row";
import { type PartKey, publishWriting, withdrawWriting } from "./bridge";
import { type AlertPlace, keepCopy } from "./copies";
import { partLabel, partSaid } from "./part-words";
import { Sentence, type SentencePart, type SentencePiece } from "./sentence";
import { saidValues } from "./sentence-values";
import {
  useDeleteAlert,
  useOffshore,
  usePreview,
  useSaveAlert,
  useTideAt,
} from "./use-alert-editor";
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
  conditionsKey,
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

// An alert written in a sheet of its own, the web's `AlertSheet` with its `AlertEditor` as a
// phone draws them: the drawer's head, with the alert's name, or "New alert", over the place it
// is written from, and the cross; then its name, and the alert said in one sentence whose parts
// each open a sheet of the platform's over this one, with the controls a phone has for them, a
// "+" after a part's last value and an "×" after each other one; under it, what the sentence
// would tell over the week ahead, judged here as each part moves by the rules the worker judges
// by, what holds its windows back, the account's other spots it may be set on too, the mail it
// asks about once, and for an alert that is saved its switch. Its bar stays at the foot: "Save
// the alert", and for one that is saved, a copy and the trash. A new alert is said a part at a
// time. It is a form of the kit (decision 078): once sent, a name that is missing or a sentence
// that asks nothing is said under it, and what is written is not lost without the web's question.
// Decision 031, "The editor".

/** An alert as an editor holds it: the parts that can be changed. */
export const draftOf = (alert: Alert): AlertDraft => ({
  name: alert.name,
  criteria: alert.criteria,
  enabled: alert.enabled,
  shortestMinutes: alert.shortestMinutes,
  spotIds: alert.spotIds,
  breakIds: alert.breakIds,
});

/** Hands a field what the form's button does, for its return key. */
function Sending({ children }: { children: (send: () => void) => ReactNode }) {
  const send = useFormSend();
  return children(() => void send());
}

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
  const insets = useSafeAreaInsets();
  // The heights and the wind are written in the unit their reader chose.
  useUnits();
  const reduced = useReducedMotion();
  const { save: saveAlert, isSaving } = useSaveAlert();
  const { deleteNow, isDeleting } = useDeleteAlert();

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

  // The places of the alert, named from what is known of them: the place it is written from, the
  // copy's, the alert's and the account's spots.
  const known = useMemo(() => {
    const byId = new Map<string, AlertPlace>();
    const keep = (one: AlertPlace) => byId.set(one.id, one);
    keep(place);
    initialPlaces?.forEach(keep);
    alert?.places.forEach((one) => {
      const id = one.spotId ?? one.breakId;
      if (id) {
        keep({
          kind: one.spotId ? "spot" : "break",
          id,
          name: one.name,
          latitude: one.latitude,
          longitude: one.longitude,
        });
      }
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
    return byId;
  }, [place, initialPlaces, alert, spots]);
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

  // A value of a part, as the sentence says it: a direction is drawn with its arrows.
  const part = (key: Part, index: number, step?: number): SentencePart => {
    const said = partSaid(criteria, key, index);
    return {
      key: `${key}-${index}`,
      words: said.words,
      spoken: said.spoken,
      label: partLabel(key),
      isSet: said.isSet,
      ...(said.arc ? { sector: { from: said.arc.from, to: said.arc.to } } : {}),
      current: step !== undefined && step === revealed && revealed < STEPS.length,
      onPress: () => openPart(key, index),
    };
  };
  /**
   * A part of the sentence with its other values, each after "or" and followed by an "×" that
   * takes it away, as the web's. The "+" stands after the last value said, once that one is set
   * and the part has room for one more, and the comma after it.
   */
  const said = (key: Part, after: string, step?: number): SentencePiece[] => {
    const label = partLabel(key);
    const values = saidValues(criteria, key);
    const list: SentencePiece[] = [{ kind: "part", part: part(key, 0, step) }];
    for (const index of values.others) {
      list.push(
        { kind: "or" },
        { kind: "part", part: part(key, index) },
        {
          kind: "remove",
          key: `${key}-${index}`,
          label,
          onPress: () => setValue(key, index, undefined),
        },
      );
    }
    if (values.canAdd) {
      list.push({
        kind: "add",
        key,
        label,
        // The new value opens at once, and the sentence says nothing of it until it is chosen.
        onPress: () => openPart(key, values.adds),
      });
    }
    if (after) list.push({ kind: "mark", text: after });
    return list;
  };
  const words = (text: string): SentencePiece => ({ kind: "words", text });
  const comma = (step: number) => (shows(step) ? "," : "");
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
              onPress: () => openPart("shortest"),
            },
          },
          { kind: "mark" as const, text: "." },
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
  // Mail is offered, and taken unless the account says no.
  const [wantsMail, setWantsMail] = useState(true);

  // The spots that may share the alert: the account's others, whatever alerts they are in.
  const neighbours = spots.filter((one) => one.id !== place.id);
  const isFull = draft.spotIds.length + draft.breakIds.length >= PLACES_MOST;
  const parts = partsToSave(drafting, saved);
  const isDirty = !alert || Object.keys(parts).length > 0;
  // Saving and deleting take turns: neither is asked while the other is on its way.
  const isBusy = isSaving || isDeleting;
  // Something is written that leaving would lose: a part that was changed, a save that has not
  // answered, or a new alert that asks something already, as a copy does before it is touched.
  const isHeld = isUnsaved(drafting, saved) || (!alert && asksSomething);
  const guard = useSheetGuard(isHeld, undefined, {
    title: m.alert_leave_title(),
    message: m.alert_leave_unsaved(),
    leave: m.alert_leave(),
    stay: m.alert_stay(),
  });
  const asksMail = !alert && settings?.byMail === null && settings.mail !== "off";

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
    return saveAlert(alert, whole, patch, asksMail ? wantsMail : undefined).then((answer) => {
      setDrafting((current) => afterAnswer(current, sending, answer && draftOf(answer)));
      if (answer) guard.close();
    });
  }

  // The form checks the alert as it is sent: a name, and a sentence that asks something. What is
  // written lives in the draft, whose rules packages/client keeps for the web's editor too: the
  // form holds the name and the conditions as the draft says them, and the name typed here goes
  // to the draft. Decisions 076 and 078.
  const form = useAppForm({
    defaultValues: { name: draft.name, criteria: sent },
    validators: {
      onSubmit: z.object({
        name: z.string().trim().min(1, m.alert_name_needed()),
        criteria: z.custom<AlertCriteria>(
          (value) => Object.keys(asked(value as AlertCriteria)).length > 0,
          m.alert_asks_nothing(),
        ),
      }),
    },
    onSubmit: () => save(),
  });
  useEffect(() => {
    if (form.getFieldValue("name") !== draft.name) {
      form.setFieldValue("name", draft.name, { dontUpdateMeta: true, dontRunListeners: true });
    }
  }, [form, draft.name]);
  // Only conditions that say something else change the field: a draft drawn again says the same,
  // and what the form said of it stays.
  useEffect(() => {
    if (conditionsKey(form.getFieldValue("criteria")) !== conditionsKey(sent)) {
      form.setFieldValue("criteria", sent, { dontUpdateMeta: true });
    }
  }, [form, sent]);

  const animate = () => {
    if (!reduced) LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
  };
  // The bar rides on the keyboard as the web's does, the room under it given back while it does.
  const footerBottom = Math.max(space.m, insets.bottom);

  return (
    <SheetRoot style={{ flex: 1, backgroundColor: colors["neutral-1"] }}>
      <form.AppForm>
        <PanelHeader
          title={alert?.name ?? m.alert_new()}
          description={place.name}
          onClose={guard.cancel}
        />
        <FormScroll
          style={{ flex: 1 }}
          contentContainerStyle={{ gap: space.l, padding: space.m, paddingBottom: space.l }}
        >
          <Sending>
            {(send) => (
              <form.AppField
                name="name"
                listeners={{ onChange: ({ value }) => set("name", value) }}
              >
                {(field) => (
                  <field.Input
                    label={m.alert_name_label()}
                    maxLength={80}
                    autoCapitalize="sentences"
                    returnKeyType="done"
                    submitBehavior="blurAndSubmit"
                    onSubmitEditing={send}
                  />
                )}
              </form.AppField>
            )}
          </Sending>

          {/* The alert, said. Every underlined part opens what changes it. */}
          <View style={{ gap: space.s }}>
            {/* The sentence is the field of the conditions: what is wrong with it is said under it. */}
            <form.AppField name="criteria">
              {(field) => (
                <field.Control<AlertCriteria>>
                  {(control) => (
                    <Sentence ref={control.focusRef} hint={control.hint} pieces={sentence} />
                  )}
                </field.Control>
              )}
            </form.AppField>
            {tooShort && shows(5) && tideLasts !== null ? (
              <View
                style={{
                  flexDirection: "row",
                  flexWrap: "wrap",
                  alignItems: "center",
                  gap: space.xs,
                }}
              >
                <Text size="s" style={{ color: colors["neutral-8"] }}>
                  {m.alert_tide_short({
                    lasts: durationWords(tideLasts),
                    shortest: durationWords(draft.shortestMinutes),
                  })}
                </Text>
                {fits !== undefined ? (
                  <Button variant="outline" onPress={() => set("shortestMinutes", fits * 60)}>
                    {m.alert_tide_short_fit({ hours: m.alert_hours({ count: fits }) })}
                  </Button>
                ) : null}
              </View>
            ) : null}
          </View>

          {revealed >= STEPS.length ? (
            <View style={{ gap: space.xs }}>
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
                  alignSelf: "flex-start",
                  gap: space.xs,
                  opacity: pressed ? 0.6 : 1,
                })}
              >
                <Text size="s" style={{ flexShrink: 1, color: colors["neutral-8"] }}>
                  {m.alert_advanced()}
                </Text>
                <View style={{ transform: [{ rotate: isAdvancedOpen ? "180deg" : "0deg" }] }}>
                  <Glyph icon={ChevronDownIcon} size={14} color={colors["neutral-8"]} />
                </View>
              </Pressable>
              {isAdvancedOpen ? (
                <View style={{ gap: space.xs }}>
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

          {/* What the sentence would tell over the week ahead. */}
          <WeekPreview
            state={weekState}
            pieces={pieces}
            asked={askedFiguresOf(sent)}
            now={now}
            zone={zone}
            nameOf={tried.length > 1 ? nameOf : undefined}
            notes={notes}
          />

          {asksSomething && held.length > 0 ? (
            <View style={{ gap: space.xs }}>
              <Text size="s" weight="medium" accessibilityRole="header">
                {m.alert_held_title()}
              </Text>
              {held.map(([key, hours]) => (
                <View
                  key={key}
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: space.s,
                  }}
                >
                  <Text size="s" style={{ flexShrink: 1 }}>
                    {CRITERION_LABELS[key]()}{" "}
                    <Text size="s" tone="muted">
                      {m.alert_held_alone({ hours })}
                    </Text>
                  </Text>
                  <Button
                    variant="outline"
                    onPress={() => {
                      feel("select");
                      set("criteria", loosened(criteria, key));
                    }}
                  >
                    {m.alert_loosen()}
                  </Button>
                </View>
              ))}
            </View>
          ) : null}

          {neighbours.length > 0 ? (
            <View style={{ gap: space.xs }}>
              {/* The group is named by it: a screen reader hears it there, not twice. */}
              <Text
                size="s"
                weight="medium"
                accessibilityElementsHidden
                importantForAccessibility="no-hide-descendants"
              >
                {m.alert_also_on()}
              </Text>
              <ToggleGroup label={m.alert_also_on()}>
                {neighbours.map((one) => {
                  const isIn = draft.spotIds.includes(one.id);
                  return (
                    <Toggle
                      key={one.id}
                      label={one.name}
                      pressed={isIn}
                      // A spot can still be taken out of an alert that is full.
                      disabled={isFull && !isIn}
                      onPress={() => {
                        const others = draft.spotIds.filter(
                          (id) => id !== place.id && id !== one.id,
                        );
                        const pressed = isIn ? others : [...others, one.id];
                        set("spotIds", place.kind === "spot" ? [place.id, ...pressed] : pressed);
                      }}
                    />
                  );
                })}
              </ToggleGroup>
              {isFull ? (
                <Text size="xs" tone="muted">
                  {m.alert_spots_most({ count: PLACES_MOST })}
                </Text>
              ) : null}
            </View>
          ) : null}

          {asksMail ? (
            <Section plain>
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

          {/* An alert that is saved may be turned off without being deleted. A new one is on. */}
          {alert ? (
            <Section plain>
              <Row
                title={m.alert_enabled_label()}
                toggle={{ value: draft.enabled, onChange: (enabled) => set("enabled", enabled) }}
              />
            </Section>
          ) : null}
        </FormScroll>

        <KeyboardStickyView
          // iOS leaves a large sheet where it stands as the keyboard comes; Android's sheet moves
          // with it by itself.
          enabled={Platform.OS === "ios"}
          offset={{ opened: footerBottom - space.s }}
        >
          <SheetFooter pinned>
            <View style={{ flexDirection: "row", alignItems: "center", gap: space.xs }}>
              <View style={{ flex: 1 }}>
                {/* An alert that is saved and was not changed has nothing to send. */}
                <form.SubmitButton fill pending={isSaving} disabled={!isDirty || isDeleting}>
                  {m.alert_save()}
                </form.SubmitButton>
              </View>
              {/* A saved alert may be copied into another, and deleted. */}
              {alert ? (
                <>
                  <IconButton
                    icon={CopyIcon}
                    label={m.alert_copy({ name: draft.name })}
                    variant="ghost"
                    disabled={isBusy || !asksSomething}
                    onPress={() => {
                      const key = keepCopy({
                        draft: {
                          ...draft,
                          name: m.alert_copy_name({ name: draft.name }),
                          criteria: sent,
                        },
                        // The copy is written from the same place, as the web's: its first.
                        places: [place, ...places.filter((one) => one.id !== place.id)],
                      });
                      router.replace({ pathname: "/alert/new", params: { copy: key } });
                    }}
                  />
                  <IconButton
                    icon={TrashIcon}
                    label={m.alert_delete({ name: alert.name })}
                    variant="ghost"
                    loading={isDeleting}
                    disabled={isBusy}
                    onPress={() =>
                      void askToDelete(alert).then((yes) => {
                        if (yes) void deleteNow(alert);
                      })
                    }
                  />
                </>
              ) : null}
            </View>
          </SheetFooter>
        </KeyboardStickyView>
      </form.AppForm>
    </SheetRoot>
  );
}
