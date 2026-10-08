"use client";

import { Checkbox as CheckboxPrimitive } from "@base-ui/react/checkbox";
import { Drawer as DrawerPrimitive } from "@base-ui/react/drawer";
import { mergeProps } from "@base-ui/react/merge-props";
import { Radio as RadioPrimitive } from "@base-ui/react/radio";
import { RadioGroup as RadioGroupPrimitive } from "@base-ui/react/radio-group";
import { useRender } from "@base-ui/react/use-render";
import * as React from "react";
import { createPortal } from "react-dom";

import { Button, ButtonDefaultsProvider } from "@repo/ui/components/ui/button";
import { ChevronRightIcon, XIcon } from "@repo/ui/icon";
import { cn } from "@repo/ui/lib/utils";

type DrawerContextProps = {
  hasSnapPoints: boolean;
  modal: DrawerPrimitive.Root.Props["modal"];
  showSwipeHandle: boolean;
  swipeDirection: NonNullable<DrawerPrimitive.Root.Props["swipeDirection"]>;
};

// Surface, edge, radius, type and motion follow the Drawer assignments of the Tonnr theme, in
// gui/themes/tonnr-components.md. The menu parts at the end of the file keep the registry styling.
export type DrawerVariant = "edge" | "inset";

const DrawerContext = React.createContext<DrawerContextProps | null>(null);

type DrawerFrameContextProps = {
  // The popup can already carry its own close button. The header reads this to
  // avoid stacking a second X on top of it, and to keep its title clear of it.
  hasCloseButton: boolean;
  // The grab bar sits inside the popup frame, so the edge it occupies costs the
  // header's close button the same 12px it would otherwise use as its inset.
  swipeHandleEdge: DrawerPrimitive.Root.Props["swipeDirection"] | null;
};

const DrawerFrameContext = React.createContext<DrawerFrameContextProps>({
  hasCloseButton: false,
  swipeHandleEdge: null,
});

type DrawerKeyboardLayoutContextProps = {
  keyboardOpen: boolean;
  panelElement: HTMLDivElement | null;
  setPanelElement: React.Dispatch<React.SetStateAction<HTMLDivElement | null>>;
};

const DrawerKeyboardLayoutContext = React.createContext<DrawerKeyboardLayoutContextProps>({
  keyboardOpen: false,
  panelElement: null,
  setPanelElement: () => undefined,
});

function useDrawer(): DrawerContextProps {
  const context = React.useContext(DrawerContext);

  if (!context) {
    throw new Error("useDrawer must be used within a Drawer.");
  }

  return context;
}

function useDrawerHeightAnimation({
  enabled,
  viewportElement,
}: {
  enabled: boolean;
  viewportElement: HTMLDivElement | null;
}): void {
  React.useLayoutEffect(() => {
    const viewport = viewportElement;
    const popupElement = viewport?.querySelector<HTMLElement>(":scope > [data-slot=drawer-popup]");

    if (!enabled || !viewport || !popupElement || typeof ResizeObserver === "undefined") {
      return undefined;
    }

    let activeAnimation: Animation | null = null;
    let disposed = false;
    let previousHeight = popupElement.offsetHeight;

    const shouldAnimate = (): boolean => {
      const keyboardInset = Number.parseFloat(
        viewport.style.getPropertyValue("--drawer-keyboard-inset"),
      );

      return (
        !(Number.isFinite(keyboardInset) && keyboardInset > 0) &&
        !window.matchMedia("(prefers-reduced-motion: reduce)").matches &&
        !popupElement.matches(
          "[data-ending-style], [data-nested-drawer-open], [data-starting-style], [data-swiping]",
        )
      );
    };

    const animateFromTo = (fromHeight: number, toHeight: number): void => {
      if (disposed || Math.abs(fromHeight - toHeight) < 1 || !shouldAnimate()) {
        previousHeight = toHeight;
        return;
      }

      const animation = popupElement.animate(
        [{ height: `${fromHeight}px` }, { height: `${toHeight}px` }],
        {
          duration: 250,
          easing: "cubic-bezier(0.22, 1, 0.36, 1)",
          fill: "both",
        },
      );
      activeAnimation = animation;
      previousHeight = toHeight;

      void animation.finished.then(
        () => {
          if (disposed || activeAnimation !== animation) {
            return;
          }

          const displayedHeight = popupElement.getBoundingClientRect().height;
          animation.cancel();
          activeAnimation = null;

          const naturalHeight = popupElement.offsetHeight;
          previousHeight = naturalHeight;
          animateFromTo(displayedHeight, naturalHeight);
        },
        () => undefined,
      );
    };

    const resizeObserver = new ResizeObserver(() => {
      if (activeAnimation) {
        return;
      }

      const nextHeight = popupElement.offsetHeight;
      const fromHeight = previousHeight;
      previousHeight = nextHeight;
      animateFromTo(fromHeight, nextHeight);
    });

    const cancelAnimationForInteraction = (): void => {
      if (!activeAnimation) {
        return;
      }

      activeAnimation.cancel();
      activeAnimation = null;
      previousHeight = popupElement.offsetHeight;
    };

    resizeObserver.observe(popupElement);
    popupElement.addEventListener("pointerdown", cancelAnimationForInteraction, true);

    return () => {
      disposed = true;
      resizeObserver.disconnect();
      popupElement.removeEventListener("pointerdown", cancelAnimationForInteraction, true);
      activeAnimation?.cancel();
    };
  }, [enabled, viewportElement]);
}

export function Drawer<Payload = unknown>({
  children,
  modal = true,
  showSwipeHandle = false,
  snapPoints,
  swipeDirection = "down",
  virtualKeyboardAware = swipeDirection === "down",
  ...props
}: DrawerPrimitive.Root.Props<Payload> & {
  showSwipeHandle?: boolean;
  virtualKeyboardAware?: boolean;
}): React.ReactElement {
  const hasSnapPoints = snapPoints != null && snapPoints.length > 0;
  const contextValue = React.useMemo(
    () => ({ hasSnapPoints, modal, showSwipeHandle, swipeDirection }),
    [hasSnapPoints, modal, showSwipeHandle, swipeDirection],
  );
  const keyboardAwareChildren =
    virtualKeyboardAware && swipeDirection === "down" ? (
      typeof children === "function" ? (
        (payload: Parameters<typeof children>[0]) => (
          <DrawerPrimitive.VirtualKeyboardProvider>
            {children(payload)}
          </DrawerPrimitive.VirtualKeyboardProvider>
        )
      ) : (
        <DrawerPrimitive.VirtualKeyboardProvider>
          {children}
        </DrawerPrimitive.VirtualKeyboardProvider>
      )
    ) : (
      children
    );

  return (
    <DrawerContext.Provider value={contextValue}>
      <DrawerPrimitive.Root
        data-slot="drawer"
        modal={modal}
        snapPoints={snapPoints}
        swipeDirection={swipeDirection}
        {...props}
      >
        {keyboardAwareChildren}
      </DrawerPrimitive.Root>
    </DrawerContext.Provider>
  );
}

export const DrawerCreateHandle: typeof DrawerPrimitive.createHandle = DrawerPrimitive.createHandle;
export const DrawerVirtualKeyboardProvider: typeof DrawerPrimitive.VirtualKeyboardProvider =
  DrawerPrimitive.VirtualKeyboardProvider;

export function DrawerTrigger(props: DrawerPrimitive.Trigger.Props): React.ReactElement {
  return <DrawerPrimitive.Trigger data-slot="drawer-trigger" {...props} />;
}

export function DrawerPortal(props: DrawerPrimitive.Portal.Props): React.ReactElement {
  return <DrawerPrimitive.Portal data-slot="drawer-portal" {...props} />;
}

export function DrawerClose(props: DrawerPrimitive.Close.Props): React.ReactElement {
  return <DrawerPrimitive.Close data-slot="drawer-close" {...props} />;
}

export function DrawerOverlay({
  className,
  ...props
}: DrawerPrimitive.Backdrop.Props): React.ReactElement {
  return (
    <DrawerPrimitive.Backdrop
      className={cn(
        // structure & layout
        "fixed inset-0 z-50",
        // sizing & spacing
        "min-h-dvh",
        // border & background
        "bg-neutral-10-transparent",
        // animation
        "opacity-[max(var(--drawer-overlay-min-opacity,0),calc(1-var(--drawer-swipe-progress)))]",
        // transitions
        "transition-opacity duration-(--motion-large-duration) ease-theme-large",
        // cursor & interaction
        "select-none",
        // state: ending
        "data-ending-style:pointer-events-none data-ending-style:opacity-0",
        "data-ending-style:duration-[calc(var(--drawer-swipe-strength)*400ms)]",
        // state: snap-points
        "data-snap-points:[--drawer-overlay-min-opacity:0.5]",
        // state: starting
        "data-starting-style:opacity-0",
        // state: swiping
        "data-swiping:duration-0",
        // structure & layout
        "supports-[-webkit-touch-callout:none]:absolute",
        className,
      )}
      data-slot="drawer-overlay"
      {...props}
    />
  );
}

export function DrawerSwipeHandle({
  className,
  ...props
}: React.ComponentProps<"div">): React.ReactElement {
  return (
    <div
      aria-hidden="true"
      className={cn(
        // structure & layout
        "relative z-10 flex shrink-0",
        // cursor & interaction
        "cursor-grab",
        // transitions
        "transition-opacity duration-200",
        // state: nested drawer open / swiping
        "group-data-nested-drawer-open/drawer-popup:opacity-0",
        "group-data-nested-drawer-swiping/drawer-popup:opacity-100",
        // state: swipe-axis
        "group-data-[swipe-axis=x]/drawer-popup:h-full",
        "group-data-[swipe-axis=x]/drawer-popup:w-3",
        "group-data-[swipe-axis=x]/drawer-popup:items-center",
        "group-data-[swipe-axis=y]/drawer-popup:h-3",
        "group-data-[swipe-axis=y]/drawer-popup:w-full",
        "group-data-[swipe-axis=y]/drawer-popup:justify-center",
        // state: swipe-direction
        "group-data-[swipe-direction=down]/drawer-popup:items-end",
        "group-data-[swipe-direction=left]/drawer-popup:order-last",
        "group-data-[swipe-direction=left]/drawer-popup:justify-start",
        "group-data-[swipe-direction=right]/drawer-popup:justify-end",
        "group-data-[swipe-direction=up]/drawer-popup:order-last",
        "group-data-[swipe-direction=up]/drawer-popup:items-start",
        // pseudo-element
        "after:block after:shrink-0 after:rounded-full after:bg-neutral-4",
        // state: swipe-axis
        "group-data-[swipe-axis=x]/drawer-popup:after:h-[100px]",
        "group-data-[swipe-axis=x]/drawer-popup:after:w-1.5",
        "group-data-[swipe-axis=y]/drawer-popup:after:h-1.5",
        "group-data-[swipe-axis=y]/drawer-popup:after:w-[100px]",
        // state: active
        "active:cursor-grabbing",
        className,
      )}
      data-slot="drawer-swipe-handle"
      {...props}
    />
  );
}

export function DrawerSwipeArea(props: DrawerPrimitive.SwipeArea.Props): React.ReactElement {
  return <DrawerPrimitive.SwipeArea data-slot="drawer-swipe-area" {...props} />;
}

export function DrawerContent({
  animateHeight = true,
  backdropClassName,
  children,
  className,
  portalProps,
  showCloseButton = false,
  showSwipeHandle: showSwipeHandleProp,
  variant = "inset",
  ...props
}: DrawerPrimitive.Popup.Props & {
  animateHeight?: boolean;
  backdropClassName?: string;
  portalProps?: DrawerPrimitive.Portal.Props;
  showCloseButton?: boolean;
  showSwipeHandle?: boolean;
  variant?: DrawerVariant;
}): React.ReactElement {
  const { hasSnapPoints, modal, showSwipeHandle, swipeDirection } = useDrawer();
  const swipeAxis = swipeDirection === "down" || swipeDirection === "up" ? "y" : "x";
  const resolvedShowSwipeHandle = showSwipeHandleProp ?? showSwipeHandle;
  const [keyboardOpen, setKeyboardOpen] = React.useState(false);
  const [panelElement, setPanelElement] = React.useState<HTMLDivElement | null>(null);
  const [viewportElement, setViewportElement] = React.useState<HTMLDivElement | null>(null);
  const frameContextValue = React.useMemo(
    () => ({
      hasCloseButton: showCloseButton,
      swipeHandleEdge: resolvedShowSwipeHandle ? swipeDirection : null,
    }),
    [resolvedShowSwipeHandle, showCloseButton, swipeDirection],
  );
  const keyboardLayoutContextValue = React.useMemo(
    () => ({ keyboardOpen, panelElement, setPanelElement }),
    [keyboardOpen, panelElement],
  );

  useDrawerHeightAnimation({
    enabled: animateHeight && swipeAxis === "y" && !hasSnapPoints,
    viewportElement,
  });

  React.useEffect(() => {
    if (!viewportElement) {
      setKeyboardOpen(false);
      return undefined;
    }

    const updateKeyboardOpen = (): void => {
      const keyboardInset = Number.parseFloat(
        viewportElement.style.getPropertyValue("--drawer-keyboard-inset"),
      );
      setKeyboardOpen(Number.isFinite(keyboardInset) && keyboardInset > 0);
    };

    const observer = new MutationObserver(updateKeyboardOpen);
    observer.observe(viewportElement, { attributeFilter: ["style"], attributes: true });
    updateKeyboardOpen();

    return () => observer.disconnect();
  }, [viewportElement]);

  return (
    <DrawerFrameContext.Provider value={frameContextValue}>
      <DrawerKeyboardLayoutContext.Provider value={keyboardLayoutContextValue}>
        <DrawerPortal {...portalProps}>
          {modal === true && (
            <DrawerOverlay
              className={backdropClassName}
              data-snap-points={hasSnapPoints ? "" : undefined}
            />
          )}
          <DrawerPrimitive.Viewport
            className={cn(
              // cursor & interaction
              "pointer-events-none",
              // structure & layout
              "fixed inset-0 z-50",
              // cursor & interaction
              "select-none",
              // state: modal
              "data-[modal=true]:pointer-events-auto",
            )}
            data-modal={modal}
            data-slot="drawer-viewport"
            ref={setViewportElement}
          >
            <DrawerPrimitive.Popup
              className={cn(
                // structure & layout
                "group/drawer-popup",
                // cursor & interaction
                "pointer-events-auto",
                // structure & layout
                "fixed z-50",
                // sizing & spacing
                "m-(--drawer-inset,0px)",
                // structure & layout
                "flex",
                // sizing & spacing
                "h-(--drawer-content-height) max-h-(--drawer-content-max-height,none) min-h-0",
                "w-(--drawer-content-width,auto)",
                // animation
                "transform-[translate3d(var(--translate-x,0px),var(--translate-y,0px),0)_scale(var(--stack-scale))]",
                // structure & layout
                "flex-col",
                // border & background
                "edge bg-neutral-1 [--edge-color:var(--neutral-4-transparent)]",
                "[--edge-elevation:var(--shadow-l)]",
                // typography
                "text-m text-neutral-10",
                // transitions — snap drawers keep height at 100dvh. Skip
                // data-swiping:duration-0: the attribute is still set when
                // movement is zeroed, which would jump to the previous detent.
                hasSnapPoints
                  ? "transition-[transform,opacity,filter] duration-(--motion-large-duration)"
                  : "transition-[transform,height,opacity,filter] duration-(--motion-large-duration)",
                "ease-theme-large will-change-transform",
                // outline / ring (focus)
                "outline-none",
                // cursor & interaction
                "select-none",
                // shadow
                "[--drawer-stacked-shadow:0_-20px_25px_-5px_rgb(0_0_0/0.1),0_-8px_10px_-6px_rgb(0_0_0/0.1)]",
                // transitions
                "[interpolate-size:allow-keywords]",
                // state: nested drawer open
                "data-[swipe-direction=down]:data-nested-drawer-open:shadow-(--drawer-stacked-shadow)",
                // state: nested drawer open
                "data-nested-drawer-open:overflow-hidden data-nested-drawer-open:brightness-95",
                // pseudo-element
                "after:pointer-events-none after:absolute",
                "after:bg-(--drawer-bleed-background,var(--neutral-1))",
                // state: swipe-axis
                "data-[swipe-axis=x]:after:inset-y-0 data-[swipe-axis=x]:after:w-(--bleed)",
                "data-[swipe-axis=y]:after:inset-x-0 data-[swipe-axis=y]:after:h-(--bleed)",
                // state: swipe-direction
                "data-[swipe-direction=down]:after:top-full",
                "data-[swipe-direction=left]:after:right-full",
                "data-[swipe-direction=right]:after:left-full",
                "data-[swipe-direction=up]:after:bottom-full",
                // sizing & spacing
                "[--drawer-content-height:var(--drawer-height,auto)]",
                // state: swipe-axis
                "data-[swipe-axis=x]:[--drawer-content-width:75%]",
                "data-[swipe-axis=y]:[--drawer-content-max-height:calc(100dvh-6rem)]",
                "data-[swipe-axis=y]:data-snap-points:[--drawer-content-height:100dvh]",
                // responsive
                "data-[swipe-axis=x]:sm:[--drawer-content-width:24rem]",
                // animation
                "[--bleed:3rem] [--peek:1rem]",
                "[--stack-height:var(--drawer-frontmost-height,var(--drawer-height,0px))]",
                "[--stack-peek-offset:max(0px,calc((var(--nested-drawers)-var(--stack-progress))*var(--peek)))]",
                "[--stack-progress:clamp(0,var(--drawer-swipe-progress),1)]",
                "[--stack-scale-base:max(0,calc(1-(var(--nested-drawers)*var(--stack-step))))]",
                "[--stack-scale:clamp(0,calc(var(--stack-scale-base)+(var(--stack-step)*var(--stack-progress))),1)]",
                "[--stack-shrink:calc(1-var(--stack-scale))] [--stack-step:0.05]",
                // state: ending / starting / swiping
                "data-ending-style:transform-(--closed-transform) data-ending-style:opacity-[0.9999]",
                "data-ending-style:duration-[calc(var(--drawer-swipe-strength)*400ms)]",
                "data-nested-drawer-swiping:duration-0",
                "data-ending-style:data-nested-drawer-swiping:duration-[calc(var(--drawer-swipe-strength)*400ms)]",
                "data-starting-style:transform-(--closed-transform)",
                !hasSnapPoints && "data-swiping:duration-0",
                "data-ending-style:data-swiping:duration-[calc(var(--drawer-swipe-strength)*400ms)]",
                // state: swipe-axis
                "data-[swipe-axis=y]:inset-x-0",
                "data-[swipe-axis=y]:data-nested-drawer-open:h-(--stack-height)",
                "data-[swipe-axis=x]:inset-y-0 data-[swipe-axis=x]:flex-row",
                // state: swipe-direction down
                "data-[swipe-direction=down]:bottom-0 data-[swipe-direction=down]:origin-bottom",
                "data-[swipe-direction=down]:[--closed-transform:translate3d(0,calc(100%+var(--drawer-inset,0px)+2px),0)]",
                "data-[swipe-direction=down]:[--translate-y:calc(var(--drawer-snap-point-offset,0px)+var(--drawer-swipe-movement-y)-var(--stack-peek-offset)-(var(--stack-shrink)*var(--stack-height)))]",
                // state: swipe-direction up
                "data-[swipe-direction=up]:top-0 data-[swipe-direction=up]:origin-top",
                "data-[swipe-direction=up]:[--closed-transform:translate3d(0,calc(-100%-var(--drawer-inset,0px)-2px),0)]",
                "data-[swipe-direction=up]:[--translate-y:calc(var(--drawer-snap-point-offset,0px)+var(--drawer-swipe-movement-y)+var(--stack-peek-offset)+(var(--stack-shrink)*var(--stack-height)))]",
                // state: swipe-direction left
                "data-[swipe-direction=left]:left-0 data-[swipe-direction=left]:origin-left",
                "data-[swipe-direction=left]:[--closed-transform:translate3d(calc(-100%-var(--drawer-inset,0px)-2px),0,0)]",
                "data-[swipe-direction=left]:[--translate-x:calc(var(--drawer-swipe-movement-x)+var(--stack-peek-offset)+(var(--stack-shrink)*100%))]",
                // state: swipe-direction right
                "data-[swipe-direction=right]:right-0 data-[swipe-direction=right]:origin-right",
                "data-[swipe-direction=right]:[--closed-transform:translate3d(calc(100%+var(--drawer-inset,0px)+2px),0,0)]",
                "data-[swipe-direction=right]:[--translate-x:calc(var(--drawer-swipe-movement-x)-var(--stack-peek-offset)-(var(--stack-shrink)*100%))]",
                variant === "inset" && [
                  // structure & layout
                  "rounded-(--radius-m)",
                  // border & background
                  "[--drawer-bleed-background:transparent]",
                  // sizing & spacing
                  "[--drawer-inset:--spacing(2)]",
                ],
                variant === "edge" && [
                  // border & background
                  "[--drawer-bleed-background:var(--neutral-1)]",
                  // sizing & spacing
                  "[--drawer-inset:0px]",
                  // state: swipe-direction
                  "data-[swipe-direction=down]:rounded-t-(--radius-m)",
                  "data-[swipe-direction=left]:rounded-e-(--radius-m)",
                  "data-[swipe-direction=right]:rounded-s-(--radius-m)",
                  "data-[swipe-direction=up]:rounded-b-(--radius-m)",
                ],
                className,
              )}
              data-slot="drawer-popup"
              data-snap-points={hasSnapPoints ? "" : undefined}
              data-swipe-axis={swipeAxis}
              data-variant={variant}
              {...props}
            >
              {resolvedShowSwipeHandle && <DrawerSwipeHandle />}
              <DrawerPrimitive.Content
                className={cn(
                  // structure & layout
                  "flex",
                  // sizing & spacing
                  "min-h-0",
                  // structure & layout
                  "flex-1 flex-col overflow-hidden overscroll-contain rounded-[inherit]",
                  // transitions
                  "transition-opacity duration-300 ease-[cubic-bezier(0.45,1.005,0,1.005)]",
                  // cursor & interaction
                  "select-text",
                  // state: nested drawer open / swiping
                  "group-data-nested-drawer-open/drawer-popup:opacity-0",
                  "group-data-nested-drawer-swiping/drawer-popup:opacity-100",
                  // state: swiping
                  "group-data-swiping/drawer-popup:select-none",
                )}
                data-slot="drawer-content"
              >
                {children}
              </DrawerPrimitive.Content>
              {showCloseButton && (
                <DrawerClose
                  aria-label="Close"
                  className={cn(
                    "absolute end-3 z-10",
                    resolvedShowSwipeHandle && swipeDirection === "down" ? "top-3" : "top-4",
                  )}
                  render={<Button size="icon" variant="ghost" />}
                >
                  <XIcon />
                </DrawerClose>
              )}
            </DrawerPrimitive.Popup>
          </DrawerPrimitive.Viewport>
        </DrawerPortal>
      </DrawerKeyboardLayoutContext.Provider>
    </DrawerFrameContext.Provider>
  );
}

export function DrawerHeader({
  children,
  className,
  showCloseButton,
  ...props
}: React.ComponentProps<"div"> & {
  showCloseButton?: boolean;
}): React.ReactElement {
  const { hasCloseButton: popupHasCloseButton, swipeHandleEdge } =
    React.useContext(DrawerFrameContext);
  // A pointer has nothing to swipe, so the header carries the dismissal on
  // desktop. On touch the grab bar and the swipe already say it, and the popup
  // takes over whenever it renders a close button of its own.
  const resolvedShowCloseButton = showCloseButton ?? !popupHasCloseButton;
  // The grab bar already spends the inset on the edge it sits on, so the button
  // keeps the same 12px gap from the popup frame on both sides. Without a top
  // handle the header uses the full 16px padding, and the button follows it.
  const hasTopSwipeHandle = swipeHandleEdge === "down";
  const closeButtonEdgeClassName = cn(
    hasTopSwipeHandle ? "top-0" : "top-4",
    swipeHandleEdge === "left" ? "end-6" : "end-3",
  );

  return (
    <div
      className={cn(
        // structure & layout
        "relative flex shrink-0 flex-col",
        // sizing & spacing — the grab bar already occupies the top edge, so
        // the header only needs 8px below it. Without one, match the 16px sides.
        "gap-xxs px-m pb-0 sm:px-l",
        hasTopSwipeHandle ? "pt-xs" : "pt-m sm:pt-l",
        // state: swipe-axis — a bottom sheet centers its title on touch only,
        // and never against a close button sitting on one side of it
        !popupHasCloseButton && "max-md:group-data-[swipe-axis=y]/drawer-popup:text-center",
        // sizing & spacing: clear the close button
        popupHasCloseButton && "pe-14",
        resolvedShowCloseButton && (swipeHandleEdge === "left" ? "md:pe-16" : "md:pe-14"),
        className,
      )}
      data-slot="drawer-header"
      {...props}
    >
      {children}
      {resolvedShowCloseButton && (
        <DrawerClose
          aria-label="Close"
          render={
            <Button
              className={cn("absolute z-10 hidden md:inline-flex", closeButtonEdgeClassName)}
              size="icon"
              variant="tertiary"
            />
          }
        >
          <XIcon />
        </DrawerClose>
      )}
    </div>
  );
}

export function DrawerPanel({
  className,
  scrollFade = true,
  scrollable = true,
  ...props
}: React.ComponentProps<"div"> & {
  scrollFade?: boolean;
  scrollable?: boolean;
}): React.ReactElement {
  const { setPanelElement } = React.useContext(DrawerKeyboardLayoutContext);
  const panelRef = React.useRef<HTMLDivElement>(null);
  const setPanelRef = React.useCallback(
    (element: HTMLDivElement | null): void => {
      panelRef.current = element;
      setPanelElement(element);
    },
    [setPanelElement],
  );

  const updateScrollFade = React.useCallback((): void => {
    const panel = panelRef.current;

    if (!panel || !scrollable || !scrollFade) {
      return;
    }

    panel.style.setProperty("--drawer-panel-overflow-y-start", `${panel.scrollTop}px`);
    panel.style.setProperty(
      "--drawer-panel-overflow-y-end",
      `${Math.max(0, panel.scrollHeight - panel.clientHeight - panel.scrollTop)}px`,
    );
  }, [scrollFade, scrollable]);

  React.useLayoutEffect(() => {
    const panel = panelRef.current;

    if (!panel || !scrollable || !scrollFade) {
      return undefined;
    }

    const observePanelContent = (observer: ResizeObserver): void => {
      observer.observe(panel);
      for (const child of panel.children) {
        observer.observe(child);
      }
    };

    const resizeObserver = new ResizeObserver(updateScrollFade);
    const mutationObserver = new MutationObserver(() => {
      resizeObserver.disconnect();
      observePanelContent(resizeObserver);
      updateScrollFade();
    });

    observePanelContent(resizeObserver);
    mutationObserver.observe(panel, { childList: true, subtree: true });
    updateScrollFade();

    return () => {
      resizeObserver.disconnect();
      mutationObserver.disconnect();
      panel.style.removeProperty("--drawer-panel-overflow-y-start");
      panel.style.removeProperty("--drawer-panel-overflow-y-end");
    };
  }, [scrollFade, scrollable, updateScrollFade]);

  const defaultProps = {
    className: cn(
      "min-h-0 flex-1 p-m data-keyboard-footer-scroll:mb-[var(--drawer-keyboard-inset,0px)] sm:p-l",
      scrollable && "overflow-y-auto overscroll-contain touch-auto",
      scrollable &&
        scrollFade && [
          "mask-t-from-[calc(100%-min(var(--fade-size),var(--drawer-panel-overflow-y-start,0px)))]",
          "mask-b-from-[calc(100%-min(var(--fade-size),var(--drawer-panel-overflow-y-end,1.5rem)))]",
          "[--fade-size:1.5rem]",
        ],
      className,
    ),
    "data-slot": "drawer-panel",
    onScroll: updateScrollFade,
    ref: setPanelRef,
  };

  return <div {...mergeProps<"div">(defaultProps, props)} />;
}

export function DrawerFooter({
  className,
  teleportOnKeyboard = false,
  ...props
}: React.ComponentProps<"div"> & {
  teleportOnKeyboard?: boolean;
}): React.ReactElement {
  const { keyboardOpen, panelElement } = React.useContext(DrawerKeyboardLayoutContext);
  const isTeleported = teleportOnKeyboard && keyboardOpen && panelElement != null;

  React.useLayoutEffect(() => {
    if (!panelElement || !teleportOnKeyboard) {
      return undefined;
    }

    panelElement.setAttribute("data-keyboard-footer-scroll", "");

    return () => panelElement.removeAttribute("data-keyboard-footer-scroll");
  }, [panelElement, teleportOnKeyboard]);

  const footer = (
    <ButtonDefaultsProvider>
      <div
        className={cn(
          "mt-auto flex w-full min-w-0 gap-xs p-m pt-0 sm:p-l sm:pt-0 [&>button]:flex-1",
          isTeleported && "mt-4 shrink-0 p-0",
          className,
        )}
        data-keyboard-teleported={isTeleported ? "" : undefined}
        data-slot="drawer-footer"
        {...props}
      />
    </ButtonDefaultsProvider>
  );

  return isTeleported ? createPortal(footer, panelElement) : footer;
}

export function DrawerTitle({
  className,
  ...props
}: DrawerPrimitive.Title.Props): React.ReactElement {
  return (
    <DrawerPrimitive.Title
      className={cn("text-m font-medium text-neutral-10", className)}
      data-slot="drawer-title"
      {...props}
    />
  );
}

export function DrawerDescription({
  className,
  ...props
}: DrawerPrimitive.Description.Props): React.ReactElement {
  return (
    <DrawerPrimitive.Description
      className={cn("text-m text-neutral-7", className)}
      data-slot="drawer-description"
      {...props}
    />
  );
}

export function DrawerMenu({
  className,
  render,
  ...props
}: useRender.ComponentProps<"nav">): React.ReactElement {
  const defaultProps = {
    className: cn("-m-2 flex flex-col", className),
    "data-slot": "drawer-menu",
  };

  return useRender({
    defaultTagName: "nav",
    props: mergeProps<"nav">(defaultProps, props),
    render,
  });
}

export function DrawerMenuItem({
  className,
  variant = "default",
  render,
  disabled,
  ...props
}: useRender.ComponentProps<"button"> & {
  variant?: "default" | "destructive";
}): React.ReactElement {
  const defaultProps = {
    className: cn(
      // structure & layout
      "flex",
      // sizing & spacing
      "min-h-9 w-full",
      // cursor & interaction
      "cursor-default select-none",
      // structure & layout
      "items-center",
      // sizing & spacing
      "gap-2",
      // structure & layout
      "rounded-sm",
      // sizing & spacing
      "px-2 py-1",
      // typography
      "text-base text-foreground",
      // outline / ring (focus)
      "outline-none",
      // state: hover
      "hover:bg-accent hover:text-accent-foreground",
      // state: disabled
      "disabled:pointer-events-none disabled:opacity-64",
      // state: destructive
      "data-[variant=destructive]:text-destructive-foreground",
      // responsive
      "sm:min-h-8 sm:text-sm",
      // nested icon svg
      "[&>svg:not([class*='opacity-'])]:opacity-80 [&>svg:not([class*='size-'])]:size-4.5",
      // responsive
      "sm:[&>svg:not([class*='size-'])]:size-4",
      // nested icon svg
      "[&>svg]:pointer-events-none [&>svg]:-mx-0.5 [&>svg]:shrink-0",
      className,
    ),
    "data-slot": "drawer-menu-item",
    "data-variant": variant,
    disabled,
    type: "button" as const,
  };

  return useRender({
    defaultTagName: "button",
    props: mergeProps<"button">(defaultProps, props),
    render,
  });
}

export function DrawerMenuSeparator({
  className,
  render,
  ...props
}: useRender.ComponentProps<"div">): React.ReactElement {
  const defaultProps = {
    className: cn("mx-2 my-1 h-px bg-border", className),
    "data-slot": "drawer-menu-separator",
  };

  return useRender({
    defaultTagName: "div",
    props: mergeProps<"div">(defaultProps, props),
    render,
  });
}

export function DrawerMenuGroup({
  className,
  render,
  ...props
}: useRender.ComponentProps<"div">): React.ReactElement {
  const defaultProps = {
    className: cn("flex flex-col", className),
    "data-slot": "drawer-menu-group",
  };

  return useRender({
    defaultTagName: "div",
    props: mergeProps<"div">(defaultProps, props),
    render,
  });
}

export function DrawerMenuGroupLabel({
  className,
  render,
  ...props
}: useRender.ComponentProps<"div">): React.ReactElement {
  const defaultProps = {
    className: cn("px-2 py-1.5 font-medium text-muted-foreground text-xs", className),
    "data-slot": "drawer-menu-group-label",
  };

  return useRender({
    defaultTagName: "div",
    props: mergeProps<"div">(defaultProps, props),
    render,
  });
}

export function DrawerMenuTrigger({
  className,
  children,
  ...props
}: DrawerPrimitive.Trigger.Props): React.ReactElement {
  return (
    <DrawerTrigger
      className={cn(
        // structure & layout
        "flex",
        // sizing & spacing
        "min-h-9 w-full",
        // cursor & interaction
        "cursor-default select-none",
        // structure & layout
        "items-center",
        // sizing & spacing
        "gap-2",
        // structure & layout
        "rounded-sm",
        // sizing & spacing
        "px-2 py-1",
        // typography
        "text-base text-foreground",
        // outline / ring (focus)
        "outline-none",
        // state: hover
        "hover:bg-accent hover:text-accent-foreground",
        // responsive
        "sm:min-h-8 sm:text-sm",
        // nested icon svg
        "[&_svg:not(:last-child)]:-mx-0.5 [&_svg:not([class*='size-'])]:size-4.5",
        // responsive
        "sm:[&_svg:not([class*='size-'])]:size-4",
        // nested icon svg
        "[&_svg]:pointer-events-none [&_svg]:shrink-0",
        className,
      )}
      data-slot="drawer-menu-trigger"
      {...props}
    >
      {children}
      <ChevronRightIcon className="ms-auto -me-0.5 opacity-80" />
    </DrawerTrigger>
  );
}

export function DrawerMenuCheckboxItem({
  className,
  children,
  checked,
  defaultChecked,
  onCheckedChange,
  variant = "default",
  disabled,
  render,
  ...props
}: CheckboxPrimitive.Root.Props & {
  variant?: "default" | "switch";
  render?: React.ReactElement;
}): React.ReactElement {
  return (
    <CheckboxPrimitive.Root
      checked={checked}
      className={cn(
        // structure & layout
        "grid",
        // sizing & spacing
        "min-h-9 w-full",
        // cursor & interaction
        "cursor-default select-none",
        // structure & layout
        "items-center",
        // sizing & spacing
        "gap-2",
        // structure & layout
        "rounded-sm",
        // sizing & spacing
        "px-2 py-1",
        // typography
        "text-base text-foreground",
        // outline / ring (focus)
        "outline-none",
        // state: hover
        "hover:bg-accent hover:text-accent-foreground",
        // state: disabled
        "data-disabled:pointer-events-none data-disabled:opacity-64",
        // responsive
        "sm:min-h-8 sm:text-sm",
        // nested icon svg
        "[&_svg:not([class*='opacity-'])]:opacity-80 [&_svg:not([class*='size-'])]:size-4.5",
        // responsive
        "sm:[&_svg:not([class*='size-'])]:size-4",
        // nested icon svg
        "[&_svg]:pointer-events-none [&_svg]:-mx-0.5 [&_svg]:shrink-0",
        variant === "switch" ? "grid-cols-[1fr_auto] gap-4 pe-1.5" : "grid-cols-[1rem_1fr] pe-4",
        className,
      )}
      data-slot="drawer-menu-checkbox-item"
      defaultChecked={defaultChecked}
      disabled={disabled}
      onCheckedChange={onCheckedChange}
      render={render}
      {...props}
    >
      {variant === "switch" ? (
        <>
          <span className="col-start-1">{children}</span>
          <CheckboxPrimitive.Indicator
            className={cn(
              // shadow
              "inset-shadow-[0_1px_--theme(--color-black/4%)]",
              // structure & layout
              "col-start-2 inline-flex",
              // sizing & spacing
              "h-[calc(var(--thumb-size)+2px)] w-[calc(var(--thumb-size)*2-2px)]",
              // structure & layout
              "shrink-0 items-center rounded-full",
              // sizing & spacing
              "p-px",
              // outline / ring (focus)
              "outline-none",
              // transitions
              "transition-[background-color,box-shadow] duration-200",
              // sizing & spacing
              "[--thumb-size:--spacing(4)]",
              // outline / ring (focus)
              "focus-visible:ring-2 focus-visible:ring-ring",
              "focus-visible:ring-offset-1 focus-visible:ring-offset-background",
              // state: checked / unchecked
              "data-checked:bg-primary data-unchecked:bg-input",
              // state: disabled
              "data-disabled:opacity-64",
              // responsive
              "sm:[--thumb-size:--spacing(3)]",
            )}
            keepMounted
          >
            <span
              className={cn(
                // cursor & interaction
                "pointer-events-none",
                // structure & layout
                "block aspect-square",
                // sizing & spacing
                "h-full",
                // state: checked
                "in-[[data-slot=drawer-menu-checkbox-item][data-checked]]:origin-[var(--thumb-size)_50%]",
                // animation
                "origin-left",
                // state: checked
                "in-[[data-slot=drawer-menu-checkbox-item][data-checked]]:translate-x-[calc(var(--thumb-size)-4px)]",
                // state: active
                "in-[[data-slot=drawer-menu-checkbox-item]:active]:not-data-disabled:scale-x-110",
                "in-[[data-slot=drawer-menu-checkbox-item]:active]:rounded-[var(--thumb-size)/calc(var(--thumb-size)*1.10)]",
                // structure & layout
                "rounded-(--thumb-size)",
                // border & background
                "bg-background",
                // shadow
                "shadow-sm/5",
                // transitions
                "will-change-transform",
                "[transition:translate_.15s,border-radius_.15s,scale_.1s_.1s,transform-origin_.15s]",
              )}
            />
          </CheckboxPrimitive.Indicator>
        </>
      ) : (
        <>
          <CheckboxPrimitive.Indicator className="col-start-1">
            <svg
              fill="none"
              height="24"
              stroke="currentColor"
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="2"
              viewBox="0 0 24 24"
              width="24"
              xmlns="http://www.w3.org/2000/svg"
            >
              <path d="M5.252 12.7 10.2 18.63 18.748 5.37" />
            </svg>
          </CheckboxPrimitive.Indicator>
          <span className="col-start-2">{children}</span>
        </>
      )}
    </CheckboxPrimitive.Root>
  );
}

export function DrawerMenuRadioGroup({
  className,
  ...props
}: RadioGroupPrimitive.Props): React.ReactElement {
  return (
    <RadioGroupPrimitive
      className={cn("flex flex-col", className)}
      data-slot="drawer-menu-radio-group"
      {...props}
    />
  );
}

export function DrawerMenuRadioItem({
  className,
  children,
  value,
  disabled,
  render,
  ...props
}: RadioPrimitive.Root.Props & {
  value: string;
  render?: React.ReactElement;
}): React.ReactElement {
  return (
    <RadioPrimitive.Root
      className={cn(
        // structure & layout
        "grid",
        // sizing & spacing
        "min-h-9 w-full",
        // cursor & interaction
        "cursor-default select-none",
        // structure & layout
        "items-center",
        // sizing & spacing
        "gap-2",
        // structure & layout
        "rounded-sm",
        // sizing & spacing
        "px-2 py-1",
        // typography
        "text-base text-foreground",
        // outline / ring (focus)
        "outline-none",
        // state: hover
        "hover:bg-accent hover:text-accent-foreground",
        // state: disabled
        "data-disabled:pointer-events-none data-disabled:opacity-64",
        // responsive
        "sm:min-h-8 sm:text-sm",
        // nested icon svg
        "[&_svg:not([class*='opacity-'])]:opacity-80 [&_svg:not([class*='size-'])]:size-4.5",
        // responsive
        "sm:[&_svg:not([class*='size-'])]:size-4",
        // nested icon svg
        "[&_svg]:pointer-events-none [&_svg]:-mx-0.5 [&_svg]:shrink-0",
        // structure & layout
        "grid-cols-[1rem_1fr] items-center",
        // sizing & spacing
        "pe-4",
        className,
      )}
      data-slot="drawer-menu-radio-item"
      disabled={disabled}
      render={render}
      value={value}
      {...props}
    >
      <RadioPrimitive.Indicator className="col-start-1">
        <svg
          fill="none"
          height="24"
          stroke="currentColor"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="2"
          viewBox="0 0 24 24"
          width="24"
          xmlns="http://www.w3.org/2000/svg"
        >
          <path d="M5.252 12.7 10.2 18.63 18.748 5.37" />
        </svg>
      </RadioPrimitive.Indicator>
      <span className="col-start-2">{children}</span>
    </RadioPrimitive.Root>
  );
}

export { DrawerPrimitive };
