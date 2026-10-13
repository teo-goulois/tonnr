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
import {
  type ReactNode,
  type RefObject,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";

import { m } from "@/paraglide/messages.js";

import { useDrawerDismissal } from "./use-drawer-dismissal";

// How much of the screen's height a sheet beside the map takes once it is raised, and before
// it is: the height of what it shows first, within two shares of the screen, or the share in
// the middle while nothing says where that ends.
const RAISED = 0.94;
const FOLD_SHARES = { least: 0.3, unknown: 0.46, most: 0.6 };
// How far a press may move and still be a press, in pixels: further, it is a swipe.
const PRESS_SLOP = 8;

/** What a phone's sheet beside the map takes of the screen, for what stands over it. */
export type Sheet = {
  // The height of the sheet before it is raised, in pixels. None once it leaves.
  height: number;
  raised: boolean;
};
export const NO_SHEET: Sheet = { height: 0, raised: false };

/**
 * Marks what a sheet shows before it is raised: the sheet is then as tall as what ends with the
 * element that takes these. A panel gives them to its summary, and a panel that marks nothing
 * opens on a share of the screen.
 */
export const SHEET_FOLD = { "data-sheet-fold": "" };
// What a sheet leaves under what it shows first, in pixels.
const FOLD_MARGIN = 16;

function onResize(told: () => void) {
  window.addEventListener("resize", told);
  return () => window.removeEventListener("resize", told);
}

// Where what a sheet shows first ends under the sheet's top, in pixels, wherever the panel is
// scrolled to. Undefined until something is marked, and what it was when the mark is taken away.
function useFold(popup: HTMLElement | null) {
  const [fold, setFold] = useState<number>();

  useLayoutEffect(() => {
    if (!popup) return;
    let mark: Element | null = null;
    const measure = () => {
      if (!mark || mark.getClientRects().length === 0) return;
      let end = mark.getBoundingClientRect().bottom - popup.getBoundingClientRect().top;
      for (let above = mark.parentElement; above && above !== popup; above = above.parentElement) {
        end += above.scrollTop;
      }
      setFold(Math.round(end) + FOLD_MARGIN);
    };
    // What is marked grows, and so does what stands over it, which grows what holds them both.
    const sizes = new ResizeObserver(measure);
    const find = () => {
      const found = popup.querySelector("[data-sheet-fold]");
      if (found === mark) return;
      mark = found;
      sizes.disconnect();
      for (let above = mark; above && above !== popup; above = above.parentElement) {
        sizes.observe(above);
      }
    };
    const marks = new MutationObserver(find);
    marks.observe(popup, { childList: true, subtree: true });
    find();
    return () => {
      sizes.disconnect();
      marks.disconnect();
    };
  }, [popup]);

  return popup ? fold : undefined;
}
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
  // A sheet beside the map opens raised, as what was not chosen on the map does.
  opensRaised?: boolean;
  // Told what a phone's sheet beside the map takes of the screen: as it opens, as it is raised
  // or lowered, and as it begins to leave.
  onSheetChange?: (sheet: Sheet) => void;
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
  opensRaised = false,
  onSheetChange,
  fill = false,
  initialFocus,
  finalFocus,
  children,
}: ViewerDrawerProps) {
  const isSheet = !wide;
  const snaps = isSheet && alongside;
  const dismissal = useDrawerDismissal(open, identity, onOpenChange, onRest, mayDismiss);

  // Whether the sheet is raised. Each thing it opens on says how it opens.
  const opening = open ? (identity ?? "") : undefined;
  const [raising, setRaising] = useState({ opening, raised: opensRaised });
  if (raising.opening !== opening) setRaising({ opening, raised: opensRaised });
  const raised = raising.raised;

  const [popup, setPopup] = useState<HTMLElement | null>(null);
  const fold = useFold(snaps ? popup : null);
  const screen = useSyncExternalStore(
    onResize,
    () => window.innerHeight,
    () => undefined,
  );
  const low =
    screen === undefined
      ? undefined
      : Math.round(
          fold === undefined
            ? screen * FOLD_SHARES.unknown
            : Math.min(Math.max(fold, screen * FOLD_SHARES.least), screen * FOLD_SHARES.most),
        );

  // A sheet that leaves is told at once, and not when the route has changed: what stands over
  // it goes down with it.
  const isShown = dismissal.open;
  useEffect(() => {
    if (!snaps) return;
    onSheetChange?.(isShown && low !== undefined ? { height: low, raised } : NO_SHEET);
    return () => onSheetChange?.(NO_SHEET);
  }, [snaps, isShown, low, raised, onSheetChange]);

  // A press on the sheet's handle or on its header raises it, and lowers it again.
  const pressedAt = useRef<{ x: number; y: number }>(undefined);
  const isHandle = (target: EventTarget) =>
    target instanceof Element &&
    target.closest("[data-slot=drawer-swipe-handle], [data-slot=drawer-header]") !== null &&
    target.closest("button, a") === null;

  return (
    <Drawer
      {...dismissal}
      modal={!alongside}
      disablePointerDismissal={alongside}
      swipeDirection={wide ? "right" : "down"}
      showSwipeHandle={isSheet}
      {...(snaps
        ? {
            snapPoints: [low ?? FOLD_SHARES.unknown, RAISED],
            snapPoint: raised ? RAISED : (low ?? FOLD_SHARES.unknown),
            onSnapPointChange: (snap) => setRaising({ opening, raised: snap === RAISED }),
          }
        : {})}
    >
      <DrawerContent
        variant={wide ? "inset" : "edge"}
        {...(initialFocus && { initialFocus })}
        {...(finalFocus && { finalFocus })}
        {...(snaps && {
          ref: setPopup,
          onPointerDown: (event) => {
            pressedAt.current = isHandle(event.target)
              ? { x: event.clientX, y: event.clientY }
              : undefined;
          },
          onClick: (event) => {
            const from = pressedAt.current;
            pressedAt.current = undefined;
            // The press is known by where it began: a swipe that is held takes what follows.
            if (!from) return;
            if (Math.hypot(event.clientX - from.x, event.clientY - from.y) > PRESS_SLOP) return;
            setRaising({ opening, raised: !raised });
          },
        })}
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
          className={cn(snaps && "mb-(--sheet-offset)", fill && "flex flex-col overflow-hidden")}
        >
          {children}
        </DrawerPanel>
      </DrawerContent>
    </Drawer>
  );
}
