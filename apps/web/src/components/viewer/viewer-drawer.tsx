import { Button } from "@repo/ui/components/ui/button";
import {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerPanel,
  DrawerTitle,
} from "@repo/ui/components/ui/drawer";
import { ChevronLeftIcon, XIcon } from "@repo/ui/icon";
import { cn } from "@repo/ui/lib/utils";
import type { ReactNode, RefObject } from "react";

import { m } from "@/paraglide/messages.js";

import { useDrawerDismissal } from "./use-drawer-dismissal";

/** How much of the screen's height a sheet beside the map takes: first a part, then nearly all. */
export const SHEET_SNAP_POINTS = [0.46, 0.94];
/** The width of a panel on the side of a wide screen, with its margin, in pixels. */
export const SIDE_PANEL_WIDTH = 448;

export type ViewerDrawerProps = {
  open: boolean;
  // Identifies the selected record, so a new one can interrupt a dismissal.
  identity?: string;
  onOpenChange: (open: boolean) => void;
  // A panel on the side of a wide screen, a sheet at the bottom of a phone.
  wide: boolean;
  // Leaves the map usable beside the drawer, which then stays open until it is closed.
  alongside?: boolean;
  title: ReactNode;
  description?: ReactNode;
  // Buttons shown before the one that closes the drawer.
  actions?: ReactNode;
  // Given by a panel that is one step into another: a button before its title goes back.
  onBack?: () => void;
  // Told once the drawer has come to rest, open or closed.
  onRest?: (open: boolean) => void;
  // False while closing the drawer would lose something that must be asked about first: it
  // then stays open until the route has changed.
  mayDismiss?: () => boolean;
  // Told how much of a phone's screen a sheet beside the map takes, when it is raised or lowered.
  onSnapChange?: (share: number) => void;
  // A sheet that is as tall as a phone lets it be whatever it holds, and leaves what scrolls to
  // its content: a search, whose field stays in place while what it found comes and goes.
  fill?: boolean;
  // What takes the focus when the drawer opens, in place of its first button, and what takes
  // it back when the drawer closes, in place of what had it before.
  initialFocus?: RefObject<HTMLElement | null>;
  finalFocus?: RefObject<HTMLElement | null>;
  children: ReactNode;
};

/** The drawer every panel of the map opens in. */
export function ViewerDrawer({
  open,
  identity,
  onOpenChange,
  wide,
  alongside = false,
  title,
  description,
  actions,
  onBack,
  onRest,
  mayDismiss,
  onSnapChange,
  fill = false,
  initialFocus,
  finalFocus,
  children,
}: ViewerDrawerProps) {
  const isSheet = !wide;
  const dismissal = useDrawerDismissal(open, identity, onOpenChange, onRest, mayDismiss);

  return (
    <Drawer
      {...dismissal}
      modal={!alongside}
      disablePointerDismissal={alongside}
      swipeDirection={wide ? "right" : "down"}
      showSwipeHandle={isSheet}
      {...(isSheet && alongside
        ? {
            snapPoints: SHEET_SNAP_POINTS,
            defaultSnapPoint: SHEET_SNAP_POINTS[0],
            onSnapPointChange: (snap) => {
              if (typeof snap === "number") onSnapChange?.(snap);
            },
          }
        : {})}
    >
      <DrawerContent
        variant={wide ? "inset" : "edge"}
        {...(initialFocus && { initialFocus })}
        {...(finalFocus && { finalFocus })}
        className={cn(
          // A sheet that fills takes the most a phone gives a sheet, and keeps it.
          fill && "data-[swipe-axis=y]:[--drawer-height:calc(100dvh-6rem)]",
          // The side panel starts under the app's header, and is a little wider than the registry's.
          "data-[swipe-axis=x]:top-14 data-[swipe-axis=x]:sm:[--drawer-content-width:27rem]",
          // How far a partly raised sheet is pushed down. The drawer's own variable does not reach
          // its children, so the panel reads this copy.
          "[--sheet-offset:var(--drawer-snap-point-offset,0px)]",
        )}
      >
        <DrawerHeader
          showCloseButton={false}
          className="max-md:group-data-[swipe-axis=y]/drawer-popup:text-start"
        >
          <div className="flex items-start justify-between gap-xs">
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
                <DrawerTitle className="truncate text-l">{title}</DrawerTitle>
                {description && (
                  // In the theme's ink, as it has been drawn so far, and not in the grey the
                  // drawer gives a description.
                  <DrawerDescription className="text-s text-neutral-10">
                    {description}
                  </DrawerDescription>
                )}
              </div>
            </div>
            <div className="-mr-xs flex shrink-0 items-center gap-xxs max-lg:-mt-1">
              {actions}
              <DrawerClose
                aria-label={m.action_close()}
                render={<Button variant="ghost" size="icon" />}
              >
                <XIcon data-slot="icon" aria-hidden />
              </DrawerClose>
            </div>
          </div>
        </DrawerHeader>
        {/* A sheet that is only partly raised keeps its lower part off the screen. The margin takes
            that part away from the panel, so that all of its content can be scrolled into view. */}
        <DrawerPanel
          scrollable={!fill}
          className={cn(
            isSheet && alongside && "mb-(--sheet-offset)",
            fill && "flex flex-col overflow-hidden",
          )}
        >
          {children}
        </DrawerPanel>
      </DrawerContent>
    </Drawer>
  );
}
