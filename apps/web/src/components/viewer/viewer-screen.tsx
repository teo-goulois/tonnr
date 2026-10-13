import { Button } from "@repo/ui/components/ui/button";
import { ChevronLeftIcon } from "@repo/ui/icon";
import { cn } from "@repo/ui/lib/utils";
import { useId } from "react";

import { m } from "@/paraglide/messages.js";

import { ViewerDrawer, type ViewerDrawerProps } from "./viewer-drawer";

type ViewerScreenProps = Pick<
  ViewerDrawerProps,
  "open" | "title" | "description" | "actions" | "onBack" | "children"
>;

/**
 * A panel of the map as a phone shows it when it is a tab's: the whole screen under the bar of
 * tabs, in place of the map. It has no button that closes it, since the bar leads elsewhere.
 * Decision 040.
 */
export function ViewerScreen({
  open,
  title,
  description,
  actions,
  onBack,
  children,
}: ViewerScreenProps) {
  const titleId = useId();
  if (!open) return null;

  return (
    <section aria-labelledby={titleId} className="absolute inset-0 z-10 flex flex-col bg-neutral-1">
      <header className="flex items-start justify-between gap-xs px-m pt-m sm:px-l sm:pt-l">
        <div className="flex min-w-0 items-start gap-xxs">
          {onBack && (
            <Button
              variant="ghost"
              size="icon"
              className="-mt-1.5 -ml-xs shrink-0 max-lg:-mt-2.5"
              aria-label={m.action_back()}
              onClick={onBack}
            >
              <ChevronLeftIcon data-slot="icon" aria-hidden />
            </Button>
          )}
          <div className="grid min-w-0 gap-xxs">
            <h1 id={titleId} className="truncate text-l font-medium">
              {title}
            </h1>
            {description && <p className="text-s">{description}</p>}
          </div>
        </div>
        {actions && (
          <div className="-mt-1.5 -mr-xs flex shrink-0 items-center gap-xxs max-lg:-mt-2.5">
            {actions}
          </div>
        )}
      </header>
      <div
        className={cn(
          "min-h-0 flex-1 overflow-y-auto overscroll-contain p-m sm:p-l",
          // The screen ends above the bar of tabs, which floats over it.
          "pb-[calc(var(--spacing-m)+var(--bottom-nav-lift,0px))] sm:pb-[calc(var(--spacing-l)+var(--bottom-nav-lift,0px))]",
        )}
      >
        {children}
      </div>
      {/* What scrolls fades out before the bar, and does not show around it. The fade is no
          taller than the room left under the screen's end, which it leaves whole. */}
      <div
        aria-hidden
        className={cn(
          "pointer-events-none absolute inset-x-0 bottom-0",
          "h-[calc(var(--bottom-nav-lift,0px)+var(--spacing-m))]",
          "bg-[linear-gradient(to_top,var(--neutral-1)_var(--bottom-nav-lift,0px),transparent)]",
        )}
      />
    </section>
  );
}

/**
 * A panel that is a tab of a phone's bar: a drawer over the map on a wide screen, and the whole
 * screen on a phone.
 */
export function ViewerTab(props: ViewerDrawerProps) {
  if (props.wide) return <ViewerDrawer {...props} />;
  const { open, title, description, actions, onBack, children } = props;
  return (
    <ViewerScreen
      open={open}
      title={title}
      description={description}
      actions={actions}
      onBack={onBack}
    >
      {children}
    </ViewerScreen>
  );
}
