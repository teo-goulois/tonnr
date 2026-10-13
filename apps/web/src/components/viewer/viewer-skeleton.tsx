import { Skeleton } from "@repo/ui/components/ui/skeleton";
import { cn } from "@repo/ui/lib/utils";

import { m } from "@/paraglide/messages.js";

import { SEA_TIMELINE_SHOWN } from "./sea-timeline-shown";

// What floats on the map, as the viewer draws it: the theme's surface, with its edge.
const floating = "edge bg-neutral-1 [--edge-color:var(--neutral-10-transparent)]";
// A bar that stands for a line of text or a control, still for a reader who asked for no motion.
const bar = "rounded-(--radius-xs) motion-reduce:animate-none";
// Where a phone's map has its legend and its buttons: at its bottom, over the bar of tabs, and
// over the timeline when the map has one. A wide screen has no bar, and its own places.
const foot = SEA_TIMELINE_SHOWN
  ? "max-lg:bottom-[calc(var(--spacing-s)*2+3.5rem+var(--bottom-nav-lift,0px))]"
  : "max-lg:bottom-[calc(var(--spacing-s)+var(--bottom-nav-lift,0px))]";

/** A row of the legend: its name, and the switch that shows its layer. */
function LegendRow({ width }: { width: string }) {
  return (
    <div className="flex items-center justify-between gap-s">
      <Skeleton className={cn(bar, "h-(--line-s)", width)} />
      <Skeleton className={cn(bar, "h-4.5 w-7.5 rounded-full")} />
    </div>
  );
}

/**
 * The map's place before the map: its buttons, its legend and its timeline, each where the
 * viewer puts it, so that nothing moves when it comes. It is drawn by the server and while the
 * product learns who opens it, and it knows nothing of them. Wide is `lg`, as in the viewer.
 */
export function ViewerSkeleton({ className }: { className?: string }) {
  return (
    <div
      role="status"
      aria-busy="true"
      className={cn("relative min-h-0 overflow-hidden bg-neutral-2", className)}
    >
      <span className="sr-only">{m.app_loading()}</span>

      <div
        aria-hidden
        className={cn(
          "absolute right-s grid gap-xs max-lg:right-[calc(var(--spacing-s)+0.375rem)]",
          "lg:top-[calc(var(--spacing-s)+var(--app-header-lift,0px))]",
          foot,
        )}
      >
        {/* The button that searches, over the one that finds the reader: a wide screen searches
            from its header. */}
        <div className={cn(floating, "size-12 rounded-full lg:hidden")} />
        {/* The button that adds a spot: a phone has it beside its bar of tabs. */}
        <div className={cn(floating, "size-10 rounded-full max-lg:hidden")} />
        <div className={cn(floating, "size-10 rounded-full max-lg:size-12")} />
        {/* On a phone the column grows up from the button that finds the reader. */}
        <div className="grid gap-xxs max-lg:-order-1 max-sm:hidden">
          <div className={cn(floating, "size-10 rounded-full max-lg:size-12")} />
          <div className={cn(floating, "size-10 rounded-full max-lg:size-12")} />
        </div>
      </div>

      {/* The legend, at the bottom of the map: folded on a phone, open on a wide screen. */}
      <div
        aria-hidden
        className={cn(floating, "absolute left-s rounded-(--radius-xs) lg:bottom-s lg:w-64", foot)}
      >
        <div className="flex min-h-10 items-center gap-xs px-s max-lg:min-h-12 max-lg:px-m">
          <Skeleton className={cn(bar, "size-4")} />
          <Skeleton className={cn(bar, "h-(--line-s) w-12")} />
          <Skeleton className={cn(bar, "ml-auto size-4")} />
        </div>
        <div className="grid gap-s px-s pb-s max-lg:hidden">
          <div className="grid gap-xs">
            <LegendRow width="w-28" />
            <div className="grid gap-0.5">
              <Skeleton className={cn(bar, "h-2 rounded-full")} />
              <Skeleton className={cn(bar, "h-(--line-xs) w-full")} />
            </div>
          </div>
          <div className="grid gap-xs">
            <LegendRow width="w-12" />
            <Skeleton className={cn(bar, "h-4 w-48")} />
          </div>
          <LegendRow width="w-32" />
          <LegendRow width="w-20" />
        </div>
      </div>

      {/* The sea's timeline: across a phone, above its bar of tabs, and beside the legend on a
          wide screen. */}
      {SEA_TIMELINE_SHOWN && (
        <div
          aria-hidden
          className={cn(
            floating,
            "absolute inset-x-s bottom-[calc(var(--spacing-s)+var(--bottom-nav-lift,0px))] flex items-end gap-xs rounded-(--radius-xs) p-xs",
            "lg:right-[calc(var(--spacing-s)+2.5rem)] lg:bottom-s lg:left-[calc(var(--spacing-s)*2+16rem)] lg:max-w-160",
          )}
        >
          <Skeleton className={cn(bar, "h-7 w-12 rounded-full")} />
          <div className="min-w-0 flex-1">
            <Skeleton className={cn(bar, "h-(--line-s) w-2/3")} />
            <Skeleton className={cn(bar, "mt-xxs h-4 w-full lg:h-6")} />
          </div>
        </div>
      )}
    </div>
  );
}
