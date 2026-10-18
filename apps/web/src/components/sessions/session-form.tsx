import { SESSION_MOST_MEDIA } from "@repo/config/media";
import { Button } from "@repo/ui/components/ui/button";
import { Textarea } from "@repo/ui/components/ui/textarea";
import { cn } from "@repo/ui/lib/utils";
import { type ReactNode, useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import { formatClock, formatDate } from "@/lib/format";
import { m } from "@/paraglide/messages.js";

import type { MediaItem, Session } from "../viewer/types";
import { DurationInput, USUAL_MINUTES } from "./duration-input";
import { RatingInput, ratingWord } from "./rating";
import { type MediaEntry, SessionMediaField } from "./session-media";
import { SurfSizeInput } from "./surf-size";
import type { SessionDraft, SessionMedia } from "./types";

const MINUTE_MS = 60 * 1000;
const DAY_MS = 24 * 60 * MINUTE_MS;
// A note as the API takes it.
const NOTE_MOST = 2000;
// A session is written once it has begun: a clock that runs a little ahead is forgiven.
const AHEAD_MS = 15 * MINUTE_MS;

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

/**
 * When a session that is written now is taken to have begun: as long ago as it usually lasts,
 * on a round five minutes. It is nearly always written on the way out of the water.
 */
export function usualStart(now: number) {
  const step = 5 * MINUTE_MS;
  return new Date(Math.floor((now - USUAL_MINUTES * MINUTE_MS) / step) * step);
}

/** A day as it is said beside its hour: today, yesterday, or its date. */
export function dayWords(day: Date, now: number) {
  const midnight = (date: Date) => new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const daysAgo = Math.round(
    (midnight(new Date(now)).getTime() - midnight(day).getTime()) / DAY_MS,
  );
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

/** A line of the form: what is asked on the left, and what answers it on the right. */
function Row({ name, children }: { name: ReactNode; children: ReactNode }) {
  return (
    <div className="flex min-h-14 items-center justify-between gap-s px-s py-xs">
      <span className="shrink-0">{name}</span>
      <span className="flex min-w-0 items-center justify-end gap-xs">{children}</span>
    </div>
  );
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

/**
 * A session as it is written: when it began, how long it lasted, how big the waves looked, how
 * it was, and a few words.
 * The day and the hour are each on a pill, which opens what the device has for them, the length
 * is a choice among the usual ones or one's own, and the rating is five stars. Only when it began
 * is asked for: the rest has a usual answer, or may wait.
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
  const [begun] = useState(() => session?.startedAt ?? usualStart(now));
  const [day, setDay] = useState(() => toDayField(begun));
  const [clock, setClock] = useState(() => toClockField(begun));
  const [minutes, setMinutes] = useState(session?.durationMinutes ?? USUAL_MINUTES);
  const [rating, setRating] = useState(session?.rating ?? null);
  const [note, setNote] = useState(session?.note ?? "");
  const [waveSize, setWaveSize] = useState(session?.waveSize ?? null);
  const [setSize, setSetSize] = useState(session?.setSize ?? null);

  // The photos and the videos as the form holds them, once one is added or taken out: until then,
  // what the session keeps, as the API says it.
  const keptItems = kept ?? NO_MEDIA;
  const isKeptAsked = session !== undefined && kept === undefined;
  const keptIds = keptItems.map((item) => item.id);
  const [touched, setTouched] = useState<MediaEntry[] | null>(null);
  const entries: MediaEntry[] = touched ?? keptIds.map((id) => ({ kept: id }));
  // What was sent from this form is forgotten as it closes: the session shows it from the API.
  const sentHere = useRef<string[]>([]);
  const { onForget } = media;
  useEffect(() => () => onForget(sentHere.current), [onForget]);

  const mediaIds = entries.flatMap((entry) => {
    if ("kept" in entry) return [entry.kept];
    const upload = media.uploads.get(entry.upload);
    return upload?.id && upload.state !== "failed" ? [upload.id] : [];
  });
  // A file the API has not yet given an id: a moment, before the form can be saved.
  const isAsking = entries.some((entry) => {
    if ("kept" in entry) return false;
    const upload = media.uploads.get(entry.upload);
    return upload?.state === "sending" && upload.id === null;
  });
  const showsMedia = media.status?.offered === true || keptIds.length > 0;

  function addMedia(files: File[]) {
    const room = SESSION_MOST_MEDIA - entries.length;
    if (files.length > room) toast.error(m.media_too_many({ count: SESSION_MOST_MEDIA }));
    const keys = media.onStart(files.slice(0, Math.max(0, room)));
    sentHere.current.push(...keys);
    setTouched([...entries, ...keys.map((key) => ({ upload: key }))]);
  }

  function removeMedia(index: number) {
    const entry = entries[index];
    if (!entry) return;
    // A file being sent belongs to no session yet: it goes from the API too. One the session
    // keeps goes once the form is saved without it.
    if ("upload" in entry) media.onDrop(entry.upload, true);
    setTouched(entries.filter((_, at) => at !== index));
  }

  const startedAt = fromFields(day, clock);
  const isAhead = startedAt !== null && startedAt.getTime() > now + AHEAD_MS;

  function save() {
    if (!startedAt || isAhead || isSaving || isAsking) return;
    const draft = {
      startedAt,
      durationMinutes: minutes,
      rating,
      note: note.trim(),
      waveSize,
      setSize,
      mediaIds,
    };
    onSave(draft, {
      ...(mediaIds.join() !== keptIds.join() && { mediaIds }),
      ...(startedAt.getTime() !== session?.startedAt.getTime() && { startedAt }),
      ...(minutes !== session?.durationMinutes && { durationMinutes: minutes }),
      ...(rating !== (session?.rating ?? null) && { rating }),
      ...(draft.note !== (session?.note ?? "") && { note: draft.note }),
      ...(waveSize !== (session?.waveSize ?? null) && { waveSize }),
      ...(setSize !== (session?.setSize ?? null) && { setSize }),
    });
  }

  return (
    <form
      className="grid gap-m"
      onSubmit={(event) => {
        event.preventDefault();
        save();
      }}
    >
      <div className="grid gap-xs">
        <div
          className={cn(
            "edge rounded-(--radius-xs) [--edge-color:var(--neutral-4)]",
            // A hairline parts two lines.
            "[&>*+*]:shadow-[inset_0_var(--border-s)_0_var(--neutral-4)]",
          )}
        >
          <Row name={m.session_when()}>
            <Pill shown={startedAt ? dayWords(startedAt, now) : m.session_day_none()}>
              <input
                type="date"
                aria-label={m.session_day()}
                className={NATIVE}
                value={day}
                max={toDayField(new Date(now))}
                required
                disabled={isSaving}
                onChange={(event) => setDay(event.target.value)}
                onClick={(event) => showPicker(event.currentTarget)}
              />
            </Pill>
            <Pill shown={startedAt ? formatClock(startedAt) : "–"}>
              <input
                type="time"
                aria-label={m.session_clock()}
                className={NATIVE}
                value={clock}
                required
                disabled={isSaving}
                aria-invalid={isAhead || undefined}
                onChange={(event) => setClock(event.target.value)}
                onClick={(event) => showPicker(event.currentTarget)}
              />
            </Pill>
          </Row>
          {/* The choices take the line's whole width, under its name. */}
          <div className="grid gap-xs px-xs py-s">
            <span className="px-xxs">{m.session_duration()}</span>
            <DurationInput
              label={m.session_duration()}
              value={minutes}
              onChange={setMinutes}
              wide={wide}
              disabled={isSaving}
            />
          </div>
          <Row name={m.surf_size_title()}>
            <SurfSizeInput
              waves={waveSize}
              sets={setSize}
              onChange={(waves, sets) => {
                setWaveSize(waves);
                setSetSize(sets);
              }}
              wide={wide}
              disabled={isSaving}
            />
          </Row>
          {showsMedia && (
            <SessionMediaField
              entries={entries}
              kept={keptItems}
              uploads={media.uploads}
              disabled={isSaving || isKeptAsked}
              paused={media.status?.paused === true || media.status?.offered === false}
              onAdd={addMedia}
              onRemove={removeMedia}
              onRetry={media.onRetry}
              onOpen={onOpenMedia}
            />
          )}
          {/* The line says the rating in a word once it is given. */}
          <Row
            name={
              rating === null ? m.session_rating() : <span aria-hidden>{ratingWord(rating)}</span>
            }
          >
            <RatingInput
              label={m.session_rating()}
              value={rating}
              onChange={setRating}
              disabled={isSaving}
              // The last star ends where the pills of the lines above do.
              className="-mr-0.75"
            />
          </Row>
        </div>
        {isAhead && <p className="px-s text-s text-neutral-7">{m.session_when_ahead()}</p>}
      </div>

      <Textarea
        aria-label={m.session_note()}
        value={note}
        rows={2}
        maxLength={NOTE_MOST}
        placeholder={m.session_note_placeholder()}
        disabled={isSaving}
        onChange={(event) => setNote(event.target.value)}
      />

      <Button type="submit" disabled={!startedAt || isAhead || isAsking} isPending={isSaving}>
        {session ? m.session_save_changes() : m.session_save()}
      </Button>
    </form>
  );
}
