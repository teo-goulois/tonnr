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
import { XIcon } from "@repo/ui/icon";
import { cn } from "@repo/ui/lib/utils";
import type { ReactNode } from "react";

import { m } from "@/paraglide/messages.js";

/** How much of the screen's height a sheet beside the map takes: first a part, then nearly all. */
export const SHEET_SNAP_POINTS = [0.46, 0.94];
/** The width of a panel on the side of a wide screen, with its margin, in pixels. */
export const SIDE_PANEL_WIDTH = 448;

type ViewerDrawerProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  // A panel on the side of a wide screen, a sheet at the bottom of a phone.
  wide: boolean;
  // Leaves the map usable beside the drawer, which then stays open until it is closed.
  alongside?: boolean;
  title: ReactNode;
  description?: ReactNode;
  // Buttons shown before the one that closes the drawer.
  actions?: ReactNode;
  // Told once the drawer has come to rest, open or closed.
  onRest?: (open: boolean) => void;
  children: ReactNode;
};

/** The drawer every panel of the map opens in. */
export function ViewerDrawer({
  open,
  onOpenChange,
  wide,
  alongside = false,
  title,
  description,
  actions,
  onRest,
  children,
}: ViewerDrawerProps) {
  const isSheet = !wide;

  return (
    <Drawer
      open={open}
      onOpenChange={onOpenChange}
      onOpenChangeComplete={onRest}
      modal={!alongside}
      disablePointerDismissal={alongside}
      swipeDirection={wide ? "right" : "down"}
      showSwipeHandle={isSheet}
      {...(isSheet && alongside
        ? { snapPoints: SHEET_SNAP_POINTS, defaultSnapPoint: SHEET_SNAP_POINTS[0] }
        : {})}
    >
      <DrawerContent
        variant={wide ? "inset" : "edge"}
        className={cn(
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
            <div className="grid min-w-0 gap-xxs">
              <DrawerTitle className="truncate text-l">{title}</DrawerTitle>
              {description && (
                <DrawerDescription className="text-s">{description}</DrawerDescription>
              )}
            </div>
            <div className="-mr-xs flex shrink-0 items-center gap-xxs">
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
        <DrawerPanel className={isSheet && alongside ? "mb-(--sheet-offset)" : ""}>
          {children}
        </DrawerPanel>
      </DrawerContent>
    </Drawer>
  );
}
