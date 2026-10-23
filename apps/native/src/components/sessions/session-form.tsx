import { USUAL_MINUTES, usualStart } from "@repo/client/sessions/rules";
import type { SessionDraft, SurfSize, Upload } from "@repo/client/sessions/types";
import type { MediaItem, MediaStatus, Session } from "@repo/client/viewer/types";
import { SESSION_MOST_MEDIA } from "@repo/config/media";
import type { ImagePickerAsset } from "expo-image-picker";
import { useEffect, useRef, useState } from "react";
import { View } from "react-native";
import { z } from "zod";

import { type MediaEntry, MediaStrip } from "@/components/media/media-strip";
import { useAppForm, useSelector } from "@/components/ui/form";
import { Separator } from "@/components/ui/separator";
import { Surface } from "@/components/ui/surface";
import { Text } from "@/components/ui/text";
import { useTell } from "@/components/ui/toast";
import { useTheme } from "@/lib/theme";
import {
  currentUploads,
  dropUpload,
  forgetSent,
  retryUpload,
  startUploads,
  useUploads,
} from "@/lib/uploads";
import { m } from "@/paraglide/messages";

import { DurationField } from "./duration-field";
import { RatingInput, ratingWord } from "./rating";
import {
  isAskingOf,
  mediaIdsOf,
  type SessionBase,
  sessionChanges,
  startFault,
} from "./session-logic";
import { SizesPill } from "./surf-size";
import { WhenField } from "./when-field";

// A session as its sheet writes it, a new one or one of the log, as the web's `SessionForm` asks
// it, with the form kit of decision 078: when it began, how long, how big the waves looked, its
// photos and videos and how it was, each a line of one box drawn in its outline with a hairline
// between two, then a few words, then what sends it. Only when it began is asked for: the rest has
// a usual answer, or may wait. A start ahead of now is said under its line as soon as it is chosen,
// and again at a send, which then gives the line the focus; the button is disabled only while a
// file waits for its id. How big the waves looked and a length of one's own are asked in steps of
// the same sheet, as the web asks them in drawers (`SizesStep`, `DurationStep`). Decisions 043 and
// 066.

// A note as the API takes it.
export const NOTE_MOST = 2000;

const NO_MEDIA: readonly MediaItem[] = [];

/** How big most of the waves and the sets looked. */
type Sizes = { waves: SurfSize | null; sets: SurfSize | null };

/** What the form holds. `media` is null until a photo or a video is added or taken out. */
export type SessionValues = {
  start: Date;
  minutes: number;
  sizes: Sizes;
  media: MediaEntry[] | null;
  rating: number | null;
  note: string;
};

const sessionSchema = z.object({
  start: z.date().superRefine((start, issues) => {
    const fault = startFault(start, Date.now());
    if (fault) issues.addIssue({ code: "custom", message: fault });
  }),
  minutes: z.number(),
  sizes: z.custom<Sizes>(),
  media: z.custom<MediaEntry[] | null>(),
  rating: z.number().nullable(),
  note: z.string().max(NOTE_MOST),
});

type SessionFormOptions = {
  /** The session that is changed. Left out for a new one. */
  session?: Session;
  /** What it keeps of photos and videos: undefined while they are asked for, when nothing is
   * added or taken out until they come. */
  kept?: readonly MediaItem[] | undefined;
  now: number;
  /** The start and the length of a session timed while it lasted (decision 074), which a new one
   * opens with, its length left to its surfer when it was never ended. */
  timed?: { startedAt: Date; minutes: number | null } | null;
  /** Writes the session, and what of it differs from the one that is changed. */
  onSave: (draft: SessionDraft, changed: Partial<SessionDraft>) => Promise<unknown>;
};

/**
 * The form of a session's sheet, and what it comes to: whether it holds something that would be
 * lost, whether a file still waits for its id, and what adds a photo or takes one out.
 */
export function useSessionForm({ session, kept, now, timed, onSave }: SessionFormOptions) {
  const tell = useTell();
  const uploads = useUploads();
  // What the form opens with, kept as it was: the usual start of a new session moves with the
  // clock, and the form does not follow it.
  const [opening] = useState<SessionValues>(() => ({
    start: timed?.startedAt ?? session?.startedAt ?? usualStart(now),
    minutes: timed?.minutes ?? session?.durationMinutes ?? USUAL_MINUTES,
    sizes: { waves: session?.waveSize ?? null, sets: session?.setSize ?? null },
    media: null,
    rating: session?.rating ?? null,
    note: session?.note ?? "",
  }));

  // The photos and the videos as the form holds them, once one is added or taken out: until then,
  // what the session keeps, as the API says it.
  const keptItems = kept ?? NO_MEDIA;
  const isKeptAsked = session !== undefined && kept === undefined;
  const keptIds = keptItems.map((item) => item.id);
  const entriesOf = (held: MediaEntry[] | null): MediaEntry[] =>
    held ?? keptIds.map((id) => ({ kept: id }));
  // What was sent from this form is forgotten as it closes: the session shows it from the API.
  const sentHere = useRef<string[]>([]);
  useEffect(() => () => forgetSent(sentHere.current), []);

  // What a new session is compared with: what it opened with.
  const base: SessionBase = session ?? {
    startedAt: opening.start,
    durationMinutes: opening.minutes,
    rating: null,
    note: null,
    waveSize: null,
    setSize: null,
  };
  const draftOf = (
    value: SessionValues,
    entries: readonly MediaEntry[],
    sending: ReadonlyMap<string, Upload>,
  ): SessionDraft => ({
    startedAt: value.start,
    durationMinutes: value.minutes,
    rating: value.rating,
    note: value.note.trim(),
    waveSize: value.sizes.waves,
    setSize: value.sizes.sets,
    mediaIds: mediaIdsOf(entries, sending),
  });

  const form = useAppForm({
    defaultValues: opening,
    validators: { onSubmit: sessionSchema },
    onSubmit: async ({ value }) => {
      const entries = entriesOf(value.media);
      const sending = currentUploads();
      if (isAskingOf(entries, sending)) return;
      const draft = draftOf(value, entries, sending);
      await onSave(draft, sessionChanges(base, draft, keptIds));
    },
  });

  const values = useSelector(form.store, (state) => state.values);
  const entries = entriesOf(values.media);
  const changed = sessionChanges(base, draftOf(values, entries, uploads), session ? keptIds : []);
  // Something would be lost: a part that is not what it was, a file sent from here that the
  // session does not keep yet, or the time of a session timed while it lasted.
  const isDirty =
    Object.keys(changed).length > 0 ||
    entries.some(
      (entry) =>
        "upload" in entry && !(session && keptIds.includes(uploads.get(entry.upload)?.id ?? "")),
    ) ||
    (session === undefined && Boolean(timed));

  /** The photos and the videos once `assets` are added, each sent as soon as it is chosen. */
  function addMedia(held: readonly MediaEntry[], assets: ImagePickerAsset[]): MediaEntry[] {
    const room = SESSION_MOST_MEDIA - held.length;
    if (assets.length > room) {
      tell({ title: m.media_too_many({ count: SESSION_MOST_MEDIA }), tone: "danger" });
    }
    const { started, refused } = startUploads(assets.slice(0, Math.max(0, room)), "session");
    for (const file of refused) {
      tell({
        title:
          file.why === "type"
            ? m.media_refused_type({ name: file.name })
            : m.media_refused_size({ name: file.name }),
        tone: "danger",
      });
    }
    sentHere.current.push(...started);
    return [...held, ...started.map((key) => ({ upload: key }))];
  }

  /** The photos and the videos once the one at `index` is taken out. */
  function removeMedia(held: readonly MediaEntry[], index: number): MediaEntry[] {
    const entry = held[index];
    // A file being sent belongs to no session yet: it goes from the API too. One the session
    // keeps goes once the form is saved without it.
    if (entry && "upload" in entry) dropUpload(entry.upload, true);
    return held.filter((_, at) => at !== index);
  }

  return {
    form,
    isDirty,
    /** A file the API has not yet given an id: a moment, before the form can be sent. */
    isAsking: isAskingOf(entries, uploads),
    isKeptAsked,
    keptItems,
    uploads,
    entriesOf,
    addMedia,
    removeMedia,
  };
}

export type SessionForming = ReturnType<typeof useSessionForm>;

type SessionFormProps = {
  forming: SessionForming;
  now: number;
  /** Writing the session: the lines wait, and so does the button. */
  saving: boolean;
  /** Nothing may be changed: the session is written or deleted. */
  disabled: boolean;
  /** Whether the instance takes photos and videos: the line is drawn on one that does, or for a
   * session that keeps some. Undefined while it is asked. */
  mediaStatus: MediaStatus | undefined;
  /** What the button says: a new session is added to the log, one of the log is saved. */
  submitLabel: string;
  /** Opens the step where how big the waves looked is said. */
  onSizes: () => void;
  /** Opens the step where a length of one's own is set. */
  onDuration: () => void;
  /** Opens a photo or a video the session keeps, over the whole screen. */
  onOpenMedia?: (item: MediaItem) => void;
};

/** When, how long, how big, its photos and videos, how it was, a few words, and what sends it. */
export function SessionForm({
  forming,
  now,
  saving,
  disabled,
  mediaStatus,
  submitLabel,
  onSizes,
  onDuration,
  onOpenMedia,
}: SessionFormProps) {
  const { space } = useTheme();
  const { form, keptItems, uploads, isKeptAsked } = forming;
  const showsMedia = mediaStatus?.offered === true || keptItems.length > 0;
  // A line of the box, as the web's field lays it (`min-h-14 px-s py-xs`): what is asked at the
  // start, what answers it at the end, and what is wrong with it under both.
  const row = {
    minHeight: 56,
    justifyContent: "center" as const,
    paddingHorizontal: space.s,
    paddingVertical: space.xs,
  };
  // A line whose choices take its whole width, under its name (`px-xs py-s`).
  const wide = { paddingHorizontal: space.xs, paddingVertical: space.s };

  // A start ahead of now is said again as the form comes back from a step: its line was not drawn
  // meanwhile, and forgot what it said.
  useEffect(() => {
    if (startFault(form.getFieldValue("start"), Date.now())) {
      void form.validateField("start", "change");
    }
  }, [form]);

  return (
    <form.AppForm>
      <View style={{ gap: space.m }}>
        <Surface variant="outline" insetEdge style={{ overflow: "hidden" }}>
          <form.AppField
            name="start"
            validators={{ onChange: ({ value }) => startFault(value, Date.now()) }}
          >
            {(field) => (
              <field.Control<Date>
                label={m.session_when()}
                layout="inline"
                gap={space.xxs}
                style={row}
              >
                {(control) => (
                  <WhenField
                    ref={control.focusRef}
                    value={control.value}
                    onChange={control.onChange}
                    now={now}
                    disabled={disabled}
                    accessibilityHint={control.hint}
                  />
                )}
              </field.Control>
            )}
          </form.AppField>
          <Separator />
          <form.AppField name="minutes">
            {(field) => (
              <field.Control<number> style={wide}>
                {(control) => (
                  <View style={{ gap: space.xs }}>
                    {/* The segment says what it chooses to a screen reader. */}
                    <Text
                      accessibilityElementsHidden
                      importantForAccessibility="no-hide-descendants"
                      style={{ paddingHorizontal: space.xxs }}
                    >
                      {m.session_duration()}
                    </Text>
                    <DurationField
                      label={m.session_duration()}
                      value={control.value}
                      onChange={control.onChange}
                      onOwn={onDuration}
                      disabled={disabled}
                    />
                  </View>
                )}
              </field.Control>
            )}
          </form.AppField>
          <Separator />
          <form.AppField name="sizes">
            {(field) => (
              <field.Control<Sizes>
                label={m.surf_size_title()}
                layout="inline"
                gap={space.xxs}
                style={row}
              >
                {(control) => (
                  <SizesPill
                    ref={control.focusRef}
                    waves={control.value.waves}
                    sets={control.value.sets}
                    onPress={onSizes}
                    disabled={disabled}
                    accessibilityHint={control.hint}
                  />
                )}
              </field.Control>
            )}
          </form.AppField>
          {showsMedia ? (
            <>
              <Separator />
              <form.AppField name="media">
                {(field) => (
                  <field.Control<MediaEntry[] | null> style={wide}>
                    {(control) => {
                      const entries = forming.entriesOf(control.value);
                      return (
                        <View style={{ gap: space.xs }}>
                          {/* The strip says what it holds to a screen reader. */}
                          <Text
                            accessibilityElementsHidden
                            importantForAccessibility="no-hide-descendants"
                            style={{ paddingHorizontal: space.xxs }}
                          >
                            {m.media_title()}
                          </Text>
                          <MediaStrip
                            purpose="session"
                            entries={entries}
                            kept={keptItems}
                            uploads={uploads}
                            disabled={disabled || isKeptAsked}
                            paused={mediaStatus?.paused === true || mediaStatus?.offered === false}
                            most={SESSION_MOST_MEDIA}
                            bleed={space.xs}
                            focusRef={control.focusRef}
                            accessibilityHint={control.hint}
                            onAdd={(assets) => control.onChange(forming.addMedia(entries, assets))}
                            onRemove={(index) =>
                              control.onChange(forming.removeMedia(entries, index))
                            }
                            onRetry={retryUpload}
                            onOpen={onOpenMedia}
                          />
                        </View>
                      );
                    }}
                  </field.Control>
                )}
              </form.AppField>
            </>
          ) : null}
          <Separator />
          <form.AppField name="rating">
            {(field) => (
              <field.Control<number | null>
                // The line says the rating in a word once it is given; the stars keep their name.
                label={
                  field.state.value === null ? m.session_rating() : ratingWord(field.state.value)
                }
                layout="inline"
                gap={space.xxs}
                style={row}
              >
                {(control) => (
                  // The last star ends where the pills of the lines above do.
                  <View style={{ marginRight: -3 }}>
                    <RatingInput
                      ref={control.focusRef}
                      label={m.session_rating()}
                      value={control.value}
                      onChange={control.onChange}
                      disabled={disabled}
                      accessibilityHint={control.hint}
                    />
                  </View>
                )}
              </field.Control>
            )}
          </form.AppField>
        </Surface>

        <form.AppField name="note">
          {(field) => (
            <field.Textarea
              accessibilityLabel={m.session_note()}
              placeholder={m.session_note_placeholder()}
              maxLength={NOTE_MOST}
              editable={!disabled}
            />
          )}
        </form.AppField>

        {/* The form waits a moment for a file the API has not yet given an id. */}
        <form.SubmitButton fill disabled={forming.isAsking} pending={saving}>
          {submitLabel}
        </form.SubmitButton>
      </View>
    </form.AppForm>
  );
}
