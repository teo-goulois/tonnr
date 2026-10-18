import { Dialog, DialogClose, DialogScreen } from "@repo/ui/components/ui/dialog";
import { ChevronLeftIcon, ChevronRightIcon, XIcon } from "@repo/ui/icon";
import { cn } from "@repo/ui/lib/utils";
import { useRef } from "react";

import { m } from "@/paraglide/messages.js";

import type { MediaItem } from "../viewer/types";

// The photos and the videos of a session, one at a time over the whole screen, dark whatever the
// theme so that a photo is seen as it was taken. Decision 066.

type MediaViewerProps = {
  items: readonly MediaItem[];
  // What the viewer is named for a screen reader: a session's photos unless it says.
  label?: string;
  // The one shown, or null while the viewer is closed.
  shown: string | null;
  onShow: (id: string | null) => void;
};

// How far a finger slides across before it goes to the next one.
const SWIPE_PX = 48;

const ROUND =
  "focus-ring grid size-10 cursor-pointer place-items-center rounded-full bg-neutral-3-transparent text-neutral-10 outline-none hover:bg-neutral-4-transparent disabled:cursor-default disabled:opacity-0";

/** A photo or a video at its size, within the screen. A video plays when it is asked to. */
function Slide({ item }: { item: MediaItem }) {
  if (item.kind === "video") {
    return (
      <video
        key={item.id}
        src={item.video ?? undefined}
        poster={item.poster ?? undefined}
        controls
        playsInline
        preload="metadata"
        className="size-full"
      />
    );
  }
  return (
    <img
      key={item.id}
      src={item.display ?? item.thumb ?? undefined}
      alt=""
      decoding="async"
      className="size-full object-contain select-none"
      draggable={false}
    />
  );
}

/**
 * The viewer: the photo or the video over the whole screen, the arrows and a slide of a finger to
 * go from one to the next, the arrow keys while it is open, and how many there are.
 */
export function MediaViewer({ items, label, shown, onShow }: MediaViewerProps) {
  const ready = items.filter((item) => item.state === "ready");
  const index = ready.findIndex((item) => item.id === shown);
  const item = index >= 0 ? ready[index] : undefined;
  const start = useRef<number | null>(null);
  const go = (step: number) => {
    const next = ready[index + step];
    if (next) onShow(next.id);
  };

  return (
    <Dialog open={item !== undefined} onOpenChange={(open) => !open && onShow(null)}>
      <DialogScreen
        aria-label={label ?? m.media_viewer_title()}
        // Dark in both themes: the theme's own dark values, scoped to the viewer.
        className="dark grid grid-rows-[auto_1fr] bg-neutral-1 text-neutral-10"
        onKeyDown={(event) => {
          // Keys of the viewer while it is open, as a gallery takes them.
          if (event.key === "ArrowLeft") go(-1);
          if (event.key === "ArrowRight") go(1);
        }}
      >
        <div className="flex items-center justify-between gap-s p-s pt-[max(var(--spacing-s),env(safe-area-inset-top))]">
          <span className="text-s text-neutral-7 tabular-nums" aria-live="polite">
            {ready.length > 1 && m.media_count({ index: index + 1, count: ready.length })}
          </span>
          <DialogClose aria-label={m.media_close()} className={ROUND}>
            <XIcon aria-hidden className="size-4" />
          </DialogClose>
        </div>
        <div
          className="relative min-h-0 overflow-hidden px-s pb-[max(var(--spacing-s),env(safe-area-inset-bottom))]"
          onPointerDown={(event) => {
            if (event.pointerType !== "mouse") start.current = event.clientX;
          }}
          onPointerUp={(event) => {
            if (start.current === null) return;
            const moved = event.clientX - start.current;
            start.current = null;
            if (Math.abs(moved) > SWIPE_PX) go(moved < 0 ? 1 : -1);
          }}
          onPointerCancel={() => {
            start.current = null;
          }}
        >
          {item && <Slide item={item} />}
          {ready.length > 1 && (
            <>
              <button
                type="button"
                aria-label={m.media_previous()}
                className={cn(ROUND, "absolute top-1/2 left-s -translate-y-1/2 max-lg:hidden")}
                disabled={index <= 0}
                onClick={() => go(-1)}
              >
                <ChevronLeftIcon aria-hidden className="size-4" />
              </button>
              <button
                type="button"
                aria-label={m.media_next()}
                className={cn(ROUND, "absolute top-1/2 right-s -translate-y-1/2 max-lg:hidden")}
                disabled={index >= ready.length - 1}
                onClick={() => go(1)}
              >
                <ChevronRightIcon aria-hidden className="size-4" />
              </button>
            </>
          )}
        </div>
      </DialogScreen>
    </Dialog>
  );
}
