import { AHEAD_MS, daysBefore, USUAL_MINUTES, usualStart } from "@repo/client/sessions/rules";
import { SESSION_MOST_MEDIA } from "@repo/config/media";
import { useAppForm } from "@repo/ui/hooks/form/form";
import { cn } from "@repo/ui/lib/utils";
import { type ReactNode, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { z } from "zod";

import { formatClock, formatDate } from "@/lib/format";
import { m } from "@/paraglide/messages.js";

import type { MediaItem, Session } from "../viewer/types";
import { DurationInput } from "./duration-input";
import { RatingInput, ratingWord } from "./rating";
import { type MediaEntry, SessionMediaField } from "./session-media";
import { SurfSizeInput } from "./surf-size";
import type { SessionDraft, SessionMedia, SurfSize } from "./types";

// A note as the API takes it.
const NOTE_MOST = 2000;

const pad = (value: number) => String(value).padStart(2, "0");

/** A day as a field of a date holds it, and an hour as a field of a time does, on the device's clock. */
export function toDayField(date: Date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}
export function toClockField(date: Date) {
  return `${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/** The moment the two fields hold together. Null while one of them holds nothing. */
export function fromFields(day: string, clock: string) {
  const date = new Date(`${day}T${clock}`);
  return day && clock && !Number.isNaN(date.getTime()) ? date : null;
}

/** A day as it is said beside its hour: today, yesterday, or its date. */
export function dayWords(day: Date, now: number) {
  const daysAgo = daysBefore(day, now);
  if (daysAgo === 0) return m.session_day_today();
  if (daysAgo === 1) return m.session_day_yesterday();
  return formatDate(day, now);
}

// What a native control of the form is: over the whole of its pill, and out of sight. A press on
// the pill is a press on it, and the phone opens its own wheels.
const NATIVE = "absolute inset-0 size-full cursor-pointer opacity-0 disabled:cursor-default";

// A browser on a wide screen opens a date's or an hour's picker from its small icon alone, which
// is out of sight here: the press asks for it.
function showPicker(input: HTMLInputElement) {
  try {
    input.showPicker();
  } catch {
    // A browser that has no such picker, or that refuses to open it now: the field still takes keys.
  }
}

/** A value on a pill, which the native control over it changes. */
function Pill({ shown, children }: { shown: string; children: ReactNode }) {
  return (
    <span
      className={cn(
        "relative inline-flex min-w-0 items-center rounded-full bg-neutral-3 px-s py-xs lg:py-xxs",
        "tabular-nums transition-colors duration-(--motion-duration) ease-theme hover:bg-neutral-4",
        "has-focus-visible:[outline:var(--focus-ring-outline)] has-focus-visible:outline-offset-2",
        "has-disabled:text-neutral-6",
      )}
    >
      <span aria-hidden className="truncate">
        {shown}
      </span>
      {children}
    </span>
  );
}

/**
 * A line of the form, as its field's adapter lays it out: what is asked on the left, what answers
 * it on the right, and what is wrong with it under both.
 */
export const ROW = "grid min-h-14 content-center gap-xxs px-s py-xs";

/** What answers a line, at its right. */
export function Answer({ children }: { children: ReactNode }) {
  return <span className="flex min-w-0 items-center justify-end gap-xs">{children}</span>;
}

type SessionFormProps = {
  // The session that is changed. Left out for a new one.
  session?: Session;
  now: number;
  // A drawer beside a wide screen, and a sheet on a phone: where the length of one's own is set.
  wide: boolean;
  isSaving: boolean;
  // The session as it is written, and what of it differs from the one that is changed.
  onSave: (draft: SessionDraft, changed: Partial<SessionDraft>) => void;
  // The photos and the videos: what the instance takes, what is being sent, and what the session
  // keeps, which a press opens in the viewer. Decision 066. `kept` is undefined while a session
  // that is changed has its media asked for: nothing is added or taken out until they come.
  media: SessionMedia;
  kept?: readonly MediaItem[] | undefined;
  onOpenMedia: (item: MediaItem) => void;
};

const NO_MEDIA: readonly MediaItem[] = [];

/** When a session began, as its two pills hold it: a day and an hour on the device's clock. */
type Start = { day: string; clock: string };

/** How big most of the waves and the sets looked. */
type Sizes = { waves: SurfSize | null; sets: SurfSize | null };

/** What the form holds. `media` is null until a photo or a video is added or taken out. */
type SessionValues = {
  start: Start;
  minutes: number;
  sizes: Sizes;
  media: MediaEntry[] | null;
  rating: number | null;
  note: string;
};

/** Why a start is not one a session may have, or nothing for one it may. */
function startFault(start: Start, now: number) {
  const startedAt = fromFields(start.day, start.clock);
  if (!startedAt) return m.session_when_missing();
  if (startedAt.getTime() > now + AHEAD_MS) return m.session_when_ahead();
  return undefined;
}

/**
 * A session as it is written: when it began, how long it lasted, how big the waves looked, how
 * it was, and a few words.
 * The day and the hour are each on a pill, which opens what the device has for them, the length
 * is a choice among the usual ones or one's own, and the rating is five stars. Only when it began
 * is asked for: the rest has a usual answer, or may wait. Decision 076 says how the form is made.
 */
export function SessionForm({
  session,
  now,
  wide,
  isSaving,
  onSave,
  media,
  kept,
  onOpenMedia,
}: SessionFormProps) {
  // What the form opens with, kept as it was: the usual start of a new session moves with the
  // clock, and the form does not follow it.
  const [opening] = useState<SessionValues>(() => {
    const begun = session?.startedAt ?? usualStart(now);
    return {
      start: { day: toDayField(begun), clock: toClockField(begun) },
      minutes: session?.durationMinutes ?? USUAL_MINUTES,
      sizes: { waves: session?.waveSize ?? null, sets: session?.setSize ?? null },
      media: null,
      rating: session?.rating ?? null,
      note: session?.note ?? "",
    };
  });

  // The photos and the videos as the form holds them, once one is added or taken out: until then,
  // what the session keeps, as the API says it.
  const keptItems = kept ?? NO_MEDIA;
  const isKeptAsked = session !== undefined && kept === undefined;
  const keptIds = keptItems.map((item) => item.id);
  const entriesOf = (held: MediaEntry[] | null): MediaEntry[] =>
    held ?? keptIds.map((id) => ({ kept: id }));
  // What was sent from this form is forgotten as it closes: the session shows it from the API.
  const sentHere = useRef<string[]>([]);
  const { onForget } = media;
  useEffect(() => () => onForget(sentHere.current), [onForget]);

  const mediaIdsOf = (entries: MediaEntry[]) =>
    entries.flatMap((entry) => {
      if ("kept" in entry) return [entry.kept];
      const upload = media.uploads.get(entry.upload);
      return upload?.id && upload.state !== "failed" ? [upload.id] : [];
    });
  // A file the API has not yet given an id: a moment, before the form can be saved.
  const isAskingOf = (entries: MediaEntry[]) =>
    entries.some((entry) => {
      if ("kept" in entry) return false;
      const upload = media.uploads.get(entry.upload);
      return upload?.state === "sending" && upload.id === null;
    });
  const showsMedia = media.status?.offered === true || keptIds.length > 0;

  const form = useAppForm({
    defaultValues: opening,
    validators: {
      onSubmit: z.object({
        start: z.custom<Start>().superRefine((start, issues) => {
          const fault = startFault(start, now);
          if (fault) issues.addIssue({ code: "custom", message: fault });
        }),
        minutes: z.number(),
        sizes: z.custom<Sizes>(),
        media: z.custom<MediaEntry[] | null>(),
        rating: z.number().nullable(),
        note: z.string().max(NOTE_MOST),
      }),
    },
    onSubmit: ({ value }) => {
      const startedAt = fromFields(value.start.day, value.start.clock);
      const entries = entriesOf(value.media);
      if (!startedAt || isSaving || isAskingOf(entries)) return;
      const mediaIds = mediaIdsOf(entries);
      const { minutes, rating, sizes } = value;
      const draft = {
        startedAt,
        durationMinutes: minutes,
        rating,
        note: value.note.trim(),
        waveSize: sizes.waves,
        setSize: sizes.sets,
        mediaIds,
      };
      onSave(draft, {
        ...(mediaIds.join() !== keptIds.join() && { mediaIds }),
        ...(startedAt.getTime() !== session?.startedAt.getTime() && { startedAt }),
        ...(minutes !== session?.durationMinutes && { durationMinutes: minutes }),
        ...(rating !== (session?.rating ?? null) && { rating }),
        ...(draft.note !== (session?.note ?? "") && { note: draft.note }),
        ...(sizes.waves !== (session?.waveSize ?? null) && { waveSize: sizes.waves }),
        ...(sizes.sets !== (session?.setSize ?? null) && { setSize: sizes.sets }),
      });
    },
  });

  return (
    <form.AppForm>
      <form.Form className="grid gap-m">
        <div
          className={cn(
            "edge rounded-(--radius-xs) [--edge-color:var(--neutral-4)]",
            // A hairline parts two lines.
            "[&>*+*]:shadow-[inset_0_var(--border-s)_0_var(--neutral-4)]",
          )}
        >
          {/* A start ahead of now is said as soon as it is chosen: the form would refuse it. */}
          <form.AppField
            name="start"
            validators={{
              onChange: ({ value }) =>
                fromFields(value.day, value.clock) ? startFault(value, now) : undefined,
            }}
          >
            {(field) => (
              <field.Control<Start> label={m.session_when()} layout="inline" className={ROW}>
                {(control) => {
                  const startedAt = fromFields(control.value.day, control.value.clock);
                  const native = {
                    className: NATIVE,
                    required: true,
                    disabled: isSaving,
                    "aria-describedby": control["aria-describedby"],
                    "aria-invalid": control["aria-invalid"],
                    onBlur: control.onBlur,
                    onClick: (event: { currentTarget: HTMLInputElement }) =>
                      showPicker(event.currentTarget),
                  };
                  return (
                    <Answer>
                      <Pill shown={startedAt ? dayWords(startedAt, now) : m.session_day_none()}>
                        <input
                          {...native}
                          type="date"
                          name={`${control.name}.day`}
                          aria-label={m.session_day()}
                          value={control.value.day}
                          max={toDayField(new Date(now))}
                          onChange={(event) =>
                            control.onChange({ ...control.value, day: event.target.value })
                          }
                        />
                      </Pill>
                      <Pill shown={startedAt ? formatClock(startedAt) : "–"}>
                        <input
                          {...native}
                          type="time"
                          name={`${control.name}.clock`}
                          aria-label={m.session_clock()}
                          value={control.value.clock}
                          onChange={(event) =>
                            control.onChange({ ...control.value, clock: event.target.value })
                          }
                        />
                      </Pill>
                    </Answer>
                  );
                }}
              </field.Control>
            )}
          </form.AppField>
          {/* The choices take the line's whole width, under its name. */}
          <form.AppField name="minutes">
            {(field) => (
              <field.Control<number> className="px-xs py-s">
                {(control) => (
                  <div className="grid gap-xs">
                    <span className="px-xxs">{m.session_duration()}</span>
                    <DurationInput
                      label={m.session_duration()}
                      value={control.value}
                      onChange={control.onChange}
                      wide={wide}
                      disabled={isSaving}
                    />
                  </div>
                )}
              </field.Control>
            )}
          </form.AppField>
          <form.AppField name="sizes">
            {(field) => (
              <field.Control<Sizes> label={m.surf_size_title()} layout="inline" className={ROW}>
                {(control) => (
                  <Answer>
                    <SurfSizeInput
                      waves={control.value.waves}
                      sets={control.value.sets}
                      onChange={(waves, sets) => control.onChange({ waves, sets })}
                      wide={wide}
                      disabled={isSaving}
                    />
                  </Answer>
                )}
              </field.Control>
            )}
          </form.AppField>
          {showsMedia && (
            <form.AppField name="media">
              {(field) => (
                <field.Control<MediaEntry[] | null>>
                  {(control) => {
                    const entries = entriesOf(control.value);
                    return (
                      <SessionMediaField
                        entries={entries}
                        kept={keptItems}
                        uploads={media.uploads}
                        disabled={isSaving || isKeptAsked}
                        paused={media.status?.paused === true || media.status?.offered === false}
                        onAdd={(files) => {
                          const room = SESSION_MOST_MEDIA - entries.length;
                          if (files.length > room) {
                            toast.error(m.media_too_many({ count: SESSION_MOST_MEDIA }));
                          }
                          const keys = media.onStart(files.slice(0, Math.max(0, room)));
                          sentHere.current.push(...keys);
                          control.onChange([...entries, ...keys.map((key) => ({ upload: key }))]);
                        }}
                        onRemove={(index) => {
                          const entry = entries[index];
                          if (!entry) return;
                          // A file being sent belongs to no session yet: it goes from the API
                          // too. One the session keeps goes once the form is saved without it.
                          if ("upload" in entry) media.onDrop(entry.upload, true);
                          control.onChange(entries.filter((_, at) => at !== index));
                        }}
                        onRetry={media.onRetry}
                        onOpen={onOpenMedia}
                      />
                    );
                  }}
                </field.Control>
              )}
            </form.AppField>
          )}
          <form.AppField name="rating">
            {(field) => (
              <field.Control<number | null>
                // The line says the rating in a word once it is given.
                label={
                  field.state.value === null ? (
                    m.session_rating()
                  ) : (
                    <span aria-hidden>{ratingWord(field.state.value)}</span>
                  )
                }
                layout="inline"
                className={ROW}
              >
                {(control) => (
                  <Answer>
                    <RatingInput
                      label={m.session_rating()}
                      value={control.value}
                      onChange={control.onChange}
                      disabled={isSaving}
                      // The last star ends where the pills of the lines above do.
                      className="-mr-0.75"
                    />
                  </Answer>
                )}
              </field.Control>
            )}
          </form.AppField>
        </div>

        <form.AppField name="note">
          {(field) => (
            <field.Textarea
              aria-label={m.session_note()}
              rows={2}
              maxLength={NOTE_MOST}
              placeholder={m.session_note_placeholder()}
              disabled={isSaving}
            />
          )}
        </form.AppField>

        {/* The form waits a moment for a file the API has not yet given an id. */}
        <form.Subscribe selector={(state) => isAskingOf(entriesOf(state.values.media))}>
          {(isAsking) => (
            <form.SubmitButton disabled={isAsking} isPending={isSaving}>
              {session ? m.session_save_changes() : m.session_save()}
            </form.SubmitButton>
          )}
        </form.Subscribe>
      </form.Form>
    </form.AppForm>
  );
}
