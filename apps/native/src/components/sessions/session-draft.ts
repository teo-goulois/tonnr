import type { SessionDraft, SurfSize } from "@repo/client/sessions/types";
import type { MediaItem, Session } from "@repo/client/viewer/types";
import { SESSION_MOST_MEDIA } from "@repo/config/media";
import type { ImagePickerAsset } from "expo-image-picker";
import { useEffect, useRef, useState } from "react";

import { firstTakenAt } from "@/components/media/media-files";
import type { MediaEntry } from "@/components/media/media-strip";
import { useTell } from "@/components/ui/toast";
import { dropUpload, forgetSent, retryUpload, startUploads, useUploads } from "@/lib/uploads";
import { m } from "@/paraglide/messages";

import { isAhead, startFromPhoto, USUAL_MINUTES, usualStart } from "./session-logic";

// A session as its sheet holds it while it is written, a new one or one of the log: when it
// began, how long, how big the waves looked, its photos and videos, its rating and its note, and
// what of it differs from what is saved. The web's `SessionForm` holds the same. Decisions 043 and
// 066.

const NO_MEDIA: readonly MediaItem[] = [];

/**
 * The draft of a session. `session` is the one that is changed, left out for a new one; `kept` is
 * what it keeps of photos and videos, undefined while they are asked for, when nothing is added
 * or taken out until they come.
 */
export function useSessionDraft(
  session: Session | undefined,
  kept: readonly MediaItem[] | undefined,
  now: number,
) {
  const tell = useTell();
  const uploads = useUploads();
  const [startedAt, setStartedAt] = useState(() => session?.startedAt ?? usualStart(now));
  // Whether the start was set by hand, and whether it came from a photo.
  const [isStartSet, setIsStartSet] = useState(false);
  const [isFromPhoto, setIsFromPhoto] = useState(false);
  const [minutes, setMinutes] = useState(session?.durationMinutes ?? USUAL_MINUTES);
  const [rating, setRating] = useState<number | null>(session?.rating ?? null);
  const [note, setNote] = useState(session?.note ?? "");
  const [waveSize, setWaveSize] = useState<SurfSize | null>(session?.waveSize ?? null);
  const [setSize, setSetSize] = useState<SurfSize | null>(session?.setSize ?? null);

  // The photos and the videos as the form holds them, once one is added or taken out: until
  // then, what the session keeps, as the API says it.
  const keptItems = kept ?? NO_MEDIA;
  const isKeptAsked = session !== undefined && kept === undefined;
  const keptIds = keptItems.map((item) => item.id);
  const [touched, setTouched] = useState<MediaEntry[] | null>(null);
  const entries: MediaEntry[] = touched ?? keptIds.map((id) => ({ kept: id }));
  // What was sent from this form is forgotten as it closes: the session shows it from the API.
  const sentHere = useRef<string[]>([]);
  useEffect(() => () => forgetSent(sentHere.current), []);

  const mediaIds = entries.flatMap((entry) => {
    if ("kept" in entry) return [entry.kept];
    const upload = uploads.get(entry.upload);
    return upload?.id && upload.state !== "failed" ? [upload.id] : [];
  });
  // A file the API has not yet given an id: a moment, before the form can be saved.
  const isAsking = entries.some((entry) => {
    if ("kept" in entry) return false;
    const upload = uploads.get(entry.upload);
    return upload?.state === "sending" && upload.id === null;
  });

  function addMedia(assets: ImagePickerAsset[]) {
    const room = SESSION_MOST_MEDIA - entries.length;
    if (assets.length > room) {
      tell({ title: m.media_too_many({ count: SESSION_MOST_MEDIA }), tone: "danger" });
    }
    const taken = assets.slice(0, Math.max(0, room));
    const { started, refused } = startUploads(taken, "session");
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
    // A new session begins when its first photo was taken, unless its start was set by hand.
    if (session === undefined && !isStartSet && entries.length === 0) {
      const begun = startFromPhoto(firstTakenAt(taken), now);
      if (begun) {
        setStartedAt(begun);
        setIsFromPhoto(true);
      }
    }
    setTouched([...entries, ...started.map((key) => ({ upload: key }))]);
  }

  function removeMedia(index: number) {
    const entry = entries[index];
    if (!entry) return;
    // A file being sent belongs to no session yet: it goes from the API too. One the session
    // keeps goes once the form is saved without it.
    if ("upload" in entry) dropUpload(entry.upload, true);
    setTouched(entries.filter((_, at) => at !== index));
  }

  const ahead = isAhead(startedAt, Date.now());
  const trimmed = note.trim();
  const draft: SessionDraft = {
    startedAt,
    durationMinutes: minutes,
    rating,
    note: trimmed,
    waveSize,
    setSize,
    mediaIds,
  };
  // What of it differs from the session that is changed.
  const changed: Partial<SessionDraft> = {
    ...(mediaIds.join() !== keptIds.join() && { mediaIds }),
    ...(startedAt.getTime() !== session?.startedAt.getTime() && { startedAt }),
    ...(minutes !== session?.durationMinutes && { durationMinutes: minutes }),
    ...(rating !== (session?.rating ?? null) && { rating }),
    ...(trimmed !== (session?.note ?? "") && { note: trimmed }),
    ...(waveSize !== (session?.waveSize ?? null) && { waveSize }),
    ...(setSize !== (session?.setSize ?? null) && { setSize }),
  };
  // A new session holds something once more than its usual answers were given.
  const isDirty =
    session === undefined
      ? isStartSet ||
        isFromPhoto ||
        minutes !== USUAL_MINUTES ||
        rating !== null ||
        trimmed !== "" ||
        waveSize !== null ||
        setSize !== null ||
        entries.length > 0
      : Object.keys(changed).length > 0;

  return {
    draft,
    changed,
    isDirty,
    isAhead: ahead,
    isAsking,
    isKeptAsked,
    isFromPhoto,
    startedAt,
    setStartedAt: (moment: Date) => {
      setStartedAt(moment);
      setIsStartSet(true);
      setIsFromPhoto(false);
    },
    minutes,
    setMinutes,
    rating,
    setRating,
    note,
    setNote,
    waveSize,
    setSize,
    setSizes: (waves: SurfSize | null, sets: SurfSize | null) => {
      setWaveSize(waves);
      setSetSize(sets);
    },
    media: {
      entries,
      kept: keptItems,
      uploads,
      add: addMedia,
      remove: removeMedia,
      retry: retryUpload,
    },
  };
}

export type SessionDrafting = ReturnType<typeof useSessionDraft>;
