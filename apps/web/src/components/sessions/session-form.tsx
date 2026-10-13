import { Button } from "@repo/ui/components/ui/button";
import { Input } from "@repo/ui/components/ui/input";
import { Label } from "@repo/ui/components/ui/label";
import { Tabs, TabsList, TabsTab } from "@repo/ui/components/ui/tabs";
import { Textarea } from "@repo/ui/components/ui/textarea";
import { useId, useState } from "react";

import { formatDuration } from "@/lib/format";
import { m } from "@/paraglide/messages.js";

import type { Session } from "../viewer/types";
import { RatingInput } from "./rating";
import type { SessionDraft } from "./types";

const MINUTE_MS = 60 * 1000;
// How long a session is taken to last until its surfer says, and what they choose among.
const USUAL_MINUTES = 90;
const DURATIONS = [30, 60, 90, 120, 180];
// A note as the API takes it.
const NOTE_MOST = 2000;
// A session is written once it has begun: a clock that runs a little ahead is forgiven.
const AHEAD_MS = 15 * MINUTE_MS;

const pad = (value: number) => String(value).padStart(2, "0");

/** A moment as a field of a date and an hour holds it, in the hours of the device. */
export function toLocalField(date: Date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/** The moment such a field holds. Null while it holds none. */
export function fromLocalField(value: string) {
  const date = new Date(value);
  return value && !Number.isNaN(date.getTime()) ? date : null;
}

/**
 * When a session that is written now is taken to have begun: as long ago as it usually lasts,
 * on a round five minutes. It is nearly always written on the way out of the water.
 */
export function usualStart(now: number) {
  const step = 5 * MINUTE_MS;
  return new Date(Math.floor((now - USUAL_MINUTES * MINUTE_MS) / step) * step);
}

type SessionFormProps = {
  // The session that is changed. Left out for a new one.
  session?: Session;
  now: number;
  isSaving: boolean;
  // The session as it is written, and what of it differs from the one that is changed.
  onSave: (draft: SessionDraft, changed: Partial<SessionDraft>) => void;
};

/**
 * A session as it is written: when it began, how long it lasted, how it was, and a few words.
 * Only when it began is asked for: the rest has a usual answer, or may wait.
 */
export function SessionForm({ session, now, isSaving, onSave }: SessionFormProps) {
  const whenId = useId();
  const noteId = useId();
  const [when, setWhen] = useState(() => toLocalField(session?.startedAt ?? usualStart(now)));
  const [minutes, setMinutes] = useState(session?.durationMinutes ?? USUAL_MINUTES);
  const [rating, setRating] = useState(session?.rating ?? null);
  const [note, setNote] = useState(session?.note ?? "");

  const startedAt = fromLocalField(when);
  const isAhead = startedAt !== null && startedAt.getTime() > now + AHEAD_MS;
  // A session whose length is none of the usual ones keeps it, among them.
  const durations = DURATIONS.includes(minutes)
    ? DURATIONS
    : [...DURATIONS, minutes].sort((a, b) => a - b);

  function save() {
    if (!startedAt || isAhead || isSaving) return;
    const draft = { startedAt, durationMinutes: minutes, rating, note: note.trim() };
    onSave(draft, {
      ...(startedAt.getTime() !== session?.startedAt.getTime() && { startedAt }),
      ...(minutes !== session?.durationMinutes && { durationMinutes: minutes }),
      ...(rating !== (session?.rating ?? null) && { rating }),
      ...(draft.note !== (session?.note ?? "") && { note: draft.note }),
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
        <Label htmlFor={whenId}>{m.session_when()}</Label>
        <Input
          id={whenId}
          // A phone has its own wheels for a day and an hour.
          type="datetime-local"
          value={when}
          max={toLocalField(new Date(now + AHEAD_MS))}
          required
          disabled={isSaving}
          aria-invalid={isAhead || undefined}
          onChange={(event) => setWhen(event.target.value)}
        />
        {isAhead && <p className="text-s text-neutral-7">{m.session_when_ahead()}</p>}
      </div>

      <div className="grid gap-xs">
        <span className="font-medium">{m.session_duration()}</span>
        <Tabs value={String(minutes)} onValueChange={(next) => setMinutes(Number(next))}>
          <TabsList variant="segment" aria-label={m.session_duration()} className="w-full">
            {durations.map((choice) => (
              <TabsTab key={choice} value={String(choice)} className="flex-1" disabled={isSaving}>
                {formatDuration(choice)}
              </TabsTab>
            ))}
          </TabsList>
        </Tabs>
      </div>

      <div className="grid gap-xxs">
        <span className="font-medium">{m.session_rating()}</span>
        <RatingInput
          label={m.session_rating()}
          value={rating}
          onChange={setRating}
          disabled={isSaving}
        />
      </div>

      <div className="grid gap-xs">
        <Label htmlFor={noteId}>{m.session_note()}</Label>
        <Textarea
          id={noteId}
          value={note}
          rows={3}
          maxLength={NOTE_MOST}
          placeholder={m.session_note_placeholder()}
          disabled={isSaving}
          onChange={(event) => setNote(event.target.value)}
        />
      </div>

      <Button type="submit" disabled={!startedAt || isAhead} isPending={isSaving}>
        {session ? m.session_save_changes() : m.session_save()}
      </Button>
    </form>
  );
}
