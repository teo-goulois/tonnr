import { SESSION_MOST_MEDIA } from "@repo/config/media";
import { Spinner } from "@repo/ui/components/ui/spinner";
import { AlertCircleIcon, PlayIcon, PlusIcon, RestartIcon, XIcon } from "@repo/ui/icon";
import { cn } from "@repo/ui/lib/utils";
import type { ReactNode } from "react";

import { canPreview } from "@/lib/media-upload";
import { m } from "@/paraglide/messages.js";

import type { MediaItem } from "../viewer/types";
import type { Upload } from "./types";

// The photos and the videos of a session, as its form holds them: those it keeps, and those
// being sent from this browser. Decision 066.

/** A photo or a video of a form: one the session keeps, by its id, or one being sent, by its key. */
export type MediaEntry = { kept: string } | { upload: string };

/** The id a session is saved with, or null while the API has given none. */
export function entryId(entry: MediaEntry, uploads: ReadonlyMap<string, Upload>) {
  return "kept" in entry ? entry.kept : (uploads.get(entry.upload)?.id ?? null);
}

/** How long a video lasts, as "0:42". */
export function videoLength(ms: number) {
  const seconds = Math.round(ms / 1000);
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

/** Why the worker made nothing of a file, in a few words. */
export function failureWords(failure: MediaItem["failure"]) {
  switch (failure) {
    case "too_large":
      return m.media_failure_too_large();
    case "too_long":
      return m.media_failure_too_long();
    case "changed":
      return m.media_failure_changed();
    case "unreadable":
      return m.media_failure_unreadable();
    default:
      return m.media_failure_gave_up();
  }
}

// A square of the strip. A tile is a button when it opens or retries something.
const TILE = "relative size-16 shrink-0 overflow-hidden rounded-(--radius-xs) bg-neutral-3";

/** What covers a tile while it is not shown yet: a ring of how much went, a spinner, or a warning. */
function Veil({ children, label }: { children: ReactNode; label: string }) {
  return (
    <span
      role="status"
      aria-label={label}
      className="absolute inset-0 grid place-items-center bg-neutral-10-transparent text-neutral-1"
    >
      {children}
    </span>
  );
}

/** How much of a file went, as a ring. */
function ProgressRing({ progress }: { progress: number }) {
  const length = 2 * Math.PI * 10;
  return (
    <svg viewBox="0 0 24 24" className="size-7 -rotate-90" aria-hidden>
      <circle
        cx="12"
        cy="12"
        r="10"
        fill="none"
        stroke="currentColor"
        strokeOpacity="0.3"
        strokeWidth="2.5"
      />
      <circle
        cx="12"
        cy="12"
        r="10"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeDasharray={length}
        strokeDashoffset={length * (1 - progress)}
        className="transition-[stroke-dashoffset] duration-(--motion-duration) ease-theme"
      />
    </svg>
  );
}

/** What a tile shows of a photo or a video: its picture, and how long a video lasts. */
function Picture({
  src,
  video,
  durationMs,
}: {
  src: string | null;
  video: boolean;
  durationMs: number | null;
}) {
  return (
    <>
      {src &&
        (video && src.startsWith("blob:") ? (
          // A video being sent shows its first image, as the browser draws it.
          <video
            src={`${src}#t=0.1`}
            muted
            playsInline
            preload="metadata"
            className="size-full object-cover"
          />
        ) : (
          <img
            src={src}
            alt=""
            loading="lazy"
            decoding="async"
            className="size-full object-cover"
          />
        ))}
      {video && (
        <span className="absolute bottom-xxs left-xxs flex items-center gap-xxs rounded-full bg-neutral-10-transparent px-xxs text-xs text-neutral-1 tabular-nums">
          <PlayIcon aria-hidden className="size-2.5" />
          {durationMs !== null && videoLength(durationMs)}
        </span>
      )}
    </>
  );
}

/** A photo or a video of the strip, with what can be done with it. */
function Tile({
  entry,
  kept,
  uploads,
  disabled,
  onOpen,
  onRemove,
  onRetry,
}: {
  entry: MediaEntry;
  kept: readonly MediaItem[];
  uploads: ReadonlyMap<string, Upload>;
  disabled: boolean;
  onOpen: () => void;
  onRemove: () => void;
  onRetry: (key: string) => void;
}) {
  let body: ReactNode;
  let opens = false;
  if ("kept" in entry) {
    const item = kept.find((one) => one.id === entry.kept);
    if (!item) return null;
    opens = item.state === "ready";
    body = (
      <>
        <Picture src={item.thumb} video={item.kind === "video"} durationMs={item.durationMs} />
        {item.state === "uploading" || item.state === "processing" ? (
          <Veil label={m.media_processing()}>
            <Spinner className="size-5" />
          </Veil>
        ) : item.state === "failed" ? (
          <Veil label={failureWords(item.failure)}>
            <AlertCircleIcon className="size-5" aria-hidden />
          </Veil>
        ) : null}
      </>
    );
  } else {
    const upload = uploads.get(entry.upload);
    if (!upload) return null;
    body = (
      <>
        <Picture
          src={upload.kind === "video" || canPreview(upload.type) ? upload.preview : null}
          video={upload.kind === "video"}
          durationMs={null}
        />
        {upload.state === "sending" ? (
          <Veil label={m.media_sending({ percent: Math.round(upload.progress * 100) })}>
            <ProgressRing progress={upload.progress} />
          </Veil>
        ) : upload.state === "failed" ? (
          <button
            type="button"
            aria-label={m.media_retry()}
            title={upload.error ?? undefined}
            className="focus-ring absolute inset-0 grid cursor-pointer place-items-center bg-neutral-10-transparent text-neutral-1 outline-none"
            onClick={() => onRetry(upload.key)}
          >
            <RestartIcon className="size-5" aria-hidden />
          </button>
        ) : null}
      </>
    );
  }

  return (
    <li className={TILE}>
      {opens ? (
        <button
          type="button"
          aria-label={m.media_open()}
          className="focus-ring block size-full cursor-pointer outline-none"
          onClick={onOpen}
        >
          {body}
        </button>
      ) : (
        body
      )}
      {!disabled && (
        <button
          type="button"
          aria-label={m.media_remove()}
          className="focus-ring absolute top-xxs right-xxs grid size-5 cursor-pointer place-items-center rounded-full bg-neutral-10-transparent text-neutral-1 outline-none"
          onClick={onRemove}
        >
          <XIcon className="size-3" aria-hidden />
        </button>
      )}
    </li>
  );
}

type SessionMediaFieldProps = {
  entries: readonly MediaEntry[];
  // What the session keeps, as the API last said: what each kept entry shows.
  kept: readonly MediaItem[];
  uploads: ReadonlyMap<string, Upload>;
  disabled: boolean;
  // An operator stopped uploads: what the session keeps stays, and nothing is added.
  paused: boolean;
  // How many it takes: a session's ten, or a report's four.
  most?: number;
  onAdd: (files: File[]) => void;
  onRemove: (index: number) => void;
  onRetry: (key: string) => void;
  // Opens a photo or a video the session keeps, in the viewer.
  onOpen: (item: MediaItem) => void;
};

/**
 * The photos and the videos of a session, on a line of its form: a strip of squares, each with
 * how far it went, and a last one that adds more. A file goes up as soon as it is chosen.
 */
export function SessionMediaField({
  entries,
  kept,
  uploads,
  disabled,
  paused,
  most = SESSION_MOST_MEDIA,
  onAdd,
  onRemove,
  onRetry,
  onOpen,
}: SessionMediaFieldProps) {
  const full = entries.length >= most;
  return (
    <div className="grid gap-xs px-xs py-s">
      <span className="px-xxs">{m.media_title()}</span>
      <ul className="-mx-xs flex gap-xs overflow-x-auto px-xs py-xxs">
        {entries.map((entry, index) => (
          <Tile
            key={"kept" in entry ? entry.kept : entry.upload}
            entry={entry}
            kept={kept}
            uploads={uploads}
            disabled={disabled}
            onOpen={() => {
              const item = "kept" in entry && kept.find((one) => one.id === entry.kept);
              if (item) onOpen(item);
            }}
            onRemove={() => onRemove(index)}
            onRetry={onRetry}
          />
        ))}
        {!full && !paused && (
          <li className={TILE}>
            <label
              className={cn(
                "grid size-full cursor-pointer place-items-center text-neutral-7",
                "transition-colors duration-(--motion-duration) ease-theme hover:bg-neutral-4",
                "has-focus-visible:[outline:var(--focus-ring-outline)] has-focus-visible:outline-offset-2",
                "has-disabled:cursor-default has-disabled:opacity-50",
              )}
            >
              <PlusIcon aria-hidden className="size-5" />
              <input
                type="file"
                accept="image/*,video/*,.heic,.heif"
                multiple
                aria-label={m.media_add()}
                className="sr-only"
                disabled={disabled}
                onChange={(event) => {
                  const chosen = [...(event.target.files ?? [])];
                  // The same file may be chosen again after it was taken out.
                  event.target.value = "";
                  if (chosen.length > 0) onAdd(chosen);
                }}
              />
            </label>
          </li>
        )}
      </ul>
      {paused && <p className="px-xxs text-s text-neutral-7">{m.media_paused()}</p>}
    </div>
  );
}
