"use client";

import { Button as ButtonPrimitive } from "@base-ui/react/button";
import { AnimatedIconSwap } from "@repo/ui/components/ui/animated-icon-swap";
import { Spinner } from "@repo/ui/components/ui/spinner";
import { cn } from "@repo/ui/lib/utils";
import { cva, type VariantProps } from "class-variance-authority";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import {
  Children,
  createContext,
  type CSSProperties,
  Fragment,
  isValidElement,
  type PropsWithChildren,
  type ReactElement,
  type ReactNode,
  useContext,
} from "react";

// Colors, edges, radius and type follow the Button assignments of the Tonnr theme, in
// gui/themes/tonnr-components.md. The theme has one size: the others keep the registry's heights.
const buttonVariants = cva(
  [
    // structure & layout
    "group/button relative inline-flex shrink-0 items-center justify-center rounded-(--radius-s)",
    // cursor & interaction
    "cursor-pointer select-none",
    // typography
    "text-m font-medium whitespace-nowrap",
    // transitions
    "transition-[color,background-color,box-shadow,opacity,padding,translate] duration-(--motion-duration) ease-theme",
    // focus
    "focus-ring outline-none",
    // state: disabled
    "disabled:pointer-events-none disabled:text-neutral-6",
    // nested icon svg
    "[&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
    // active state (for unpopuped button)
    "active:not-aria-[haspopup]:translate-y-(--motion-press-distance)",
  ],
  {
    variants: {
      variant: {
        default: [
          "edge-inset bg-color-1 text-neutral-1 [--edge-color:var(--border-default-color)]",
          "hover:[--edge-elevation:var(--shadow-s)]",
          "disabled:bg-neutral-3",
        ],
        outline: [
          "edge-inset text-neutral-10 [--edge-color:var(--neutral-4)]",
          "hover:bg-neutral-3-transparent aria-expanded:bg-neutral-3-transparent",
          "focus-visible:[--edge-color:var(--color-1-transparent)]",
          "disabled:[--edge-color:var(--neutral-4-transparent)]",
        ],
        secondary: [
          "edge bg-neutral-3 text-neutral-10 [--edge-color:var(--border-default-color)]",
          "hover:bg-neutral-4-transparent aria-expanded:bg-neutral-4-transparent",
        ],
        // Not in the theme: the registry's quieter secondary, on the theme's neutrals.
        tertiary: [
          "group bg-neutral-3 text-neutral-7",
          "hover:bg-neutral-4-transparent hover:text-neutral-10",
          "aria-expanded:bg-neutral-4-transparent aria-expanded:text-neutral-10",
        ],
        ghost: [
          "text-neutral-10",
          "hover:bg-neutral-3-transparent aria-expanded:bg-neutral-3-transparent",
        ],
        destructive: [
          "edge-inset bg-error text-neutral-1 [--edge-color:var(--border-default-color)]",
          "hover:[--edge-elevation:var(--shadow-s)]",
          "disabled:bg-neutral-3",
        ],
        link: "text-neutral-10 underline-offset-4 hover:underline",
      },
      size: {
        default: "gap-xs px-m py-xs",
        xs: ["h-7 gap-xxs px-xs text-s", "[&_svg:not([class*='size-'])]:size-3"],
        sm: ["h-8 gap-xxs px-s text-s", "[&_svg:not([class*='size-'])]:size-3.5"],
        lg: "h-10 gap-xs px-m",
        xl: ["h-11 gap-xs px-l", "[&_svg:not([class*='size-'])]:size-5"],
        icon: "size-10 rounded-full",
        "icon-xs": "size-7 rounded-full [&_svg:not([class*='size-'])]:size-3",
        "icon-sm": "size-8 rounded-full",
        "icon-lg": "size-11 rounded-full",
        "icon-xl": "size-12 rounded-full [&_svg:not([class*='size-'])]:size-5",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
    compoundVariants: [
      {
        size: ["icon", "icon-xs", "icon-sm", "icon-lg", "icon-xl"],
        className: [
          // nested: data-slot=icon — transitions
          "**:data-[slot=icon]:motion-safe:transition-transform",
          "**:data-[slot=icon]:motion-safe:duration-(--motion-duration)",
          "**:data-[slot=icon]:motion-safe:ease-theme",
          // nested: data-slot=icon — state: hover / focus / active
          "**:data-[slot=icon]:motion-safe:group-hover/button:scale-105",
          "**:data-[slot=icon]:motion-safe:group-focus-visible/button:scale-105",
          "**:data-[slot=icon]:motion-safe:group-active/button:scale-95",
        ],
      },
    ],
  },
);

type IconElement = ReactElement<{ "data-slot"?: string; className?: string }>;

function isIconElement(child: ReactNode): child is IconElement {
  return isValidElement(child) && (child.props as { "data-slot"?: string })["data-slot"] === "icon";
}

// Children.forEach does not traverse into Fragments: `<>…</>` arrives as a
// single Fragment element, so its content must be flattened before scanning.
function flattenChildren(children: ReactNode): ReactNode[] {
  const flattened: ReactNode[] = [];

  Children.forEach(children, (child) => {
    if (isValidElement<{ children?: ReactNode }>(child) && child.type === Fragment) {
      flattened.push(...flattenChildren(child.props.children));
      return;
    }

    flattened.push(child);
  });

  return flattened;
}

function splitChildren(children: ReactNode): {
  endIcon: IconElement | null;
  label: ReactNode[];
  startIcon: IconElement | null;
} {
  const label: ReactNode[] = [];
  let startIcon: IconElement | null = null;
  let endIcon: IconElement | null = null;

  for (const child of flattenChildren(children)) {
    if (isIconElement(child)) {
      // An icon before any content leads the label; one after it trails.
      if (startIcon === null && label.length === 0) {
        startIcon = child;
        continue;
      }
      if (endIcon === null) {
        endIcon = child;
        continue;
      }
    }

    label.push(child);
  }

  return { endIcon, label, startIcon };
}

const slotTransition = { type: "spring", duration: 0.3, bounce: 0 } as const;

// Motion animates the button's own width (layout), so the primitive is
// wrapped once at module level.
const MotionButtonPrimitive = motion.create(ButtonPrimitive);

// These props collide with motion's own props on the wrapped primitive, so
// they are excluded from the public API (`style` is re-added below without
// Base UI's state-callback form, which motion cannot handle).
type MotionConflictingProps = "onAnimationStart" | "onDrag" | "onDragStart" | "onDragEnd" | "style";

type ButtonProps = Omit<ButtonPrimitive.Props, MotionConflictingProps> &
  VariantProps<typeof buttonVariants> & {
    isPending?: boolean;
    /** Replaces the label while `isPending` is true. */
    pendingContent?: ReactNode;
    pendingDisables?: boolean;
    style?: CSSProperties;
  };

type ButtonDefaultsProviderProps = PropsWithChildren<{
  className?: string;
  size?: ButtonProps["size"];
}>;

const ButtonDefaultsContext = createContext<Omit<ButtonDefaultsProviderProps, "children">>({});

function ButtonDefaultsProvider({
  children,
  className,
  size,
}: ButtonDefaultsProviderProps): ReactElement {
  const inheritedDefaults = useContext(ButtonDefaultsContext);

  return (
    <ButtonDefaultsContext.Provider
      value={{
        className: cn(inheritedDefaults.className, className),
        size: size ?? inheritedDefaults.size,
      }}
    >
      {children}
    </ButtonDefaultsContext.Provider>
  );
}

function Button({
  className,
  variant = "default",
  size: sizeProp,
  isPending = false,
  pendingContent,
  pendingDisables = true,
  disabled,
  children,
  ...props
}: ButtonProps) {
  const buttonDefaults = useContext(ButtonDefaultsContext);
  const size = sizeProp ?? buttonDefaults.size ?? "default";
  const resolvedClassName = cn(buttonDefaults.className, className);
  const shouldReduceMotion = useReducedMotion();

  const isIconOnly = size?.startsWith("icon") ?? false;
  const { endIcon, label, startIcon } = splitChildren(children);
  const hasIcon = startIcon !== null || endIcon !== null;
  const hasBothIcons = startIcon !== null && endIcon !== null;

  const iconClassName = startIcon?.props.className ?? endIcon?.props.className;

  // The spinner always lives at the inline start (left in LTR, right in RTL);
  // an inline-end icon slides away while pending.
  const startSlot =
    isPending || startIcon ? (
      <AnimatedIconSwap
        activeKey={isPending ? "pending" : "idle"}
        className={iconClassName}
        data-icon="inline-start"
      >
        {isPending ? <Spinner data-slot="icon" className={iconClassName} /> : startIcon}
      </AnimatedIconSwap>
    ) : null;

  const endSlot =
    endIcon && (!isPending || hasBothIcons) ? (
      <AnimatedIconSwap activeKey="idle" className={endIcon.props.className} data-icon="inline-end">
        {endIcon}
      </AnimatedIconSwap>
    ) : null;

  // Icon-only buttons without a slotted icon show just the spinner while pending.
  const hidesLabel = isPending && isIconOnly && !hasIcon;
  const idleLabel = hasIcon ? label : children;
  const content = hidesLabel
    ? null
    : isPending && pendingContent != null
      ? pendingContent
      : idleLabel;
  const hasLabel = Array.isArray(content) ? content.length > 0 : content != null;

  const layout = shouldReduceMotion ? false : ("position" as const);
  const hidden = (x: number) => (shouldReduceMotion ? { opacity: 0 } : { opacity: 0, x });

  return (
    <MotionButtonPrimitive
      type={props.type ?? "button"}
      layout={shouldReduceMotion ? false : true}
      transition={slotTransition}
      data-slot="button"
      data-icon-start={startSlot ? true : undefined}
      data-icon-end={endSlot ? true : undefined}
      aria-busy={isPending || undefined}
      disabled={disabled || (isPending && pendingDisables)}
      className={cn(buttonVariants({ variant, size, className: resolvedClassName }))}
      {...props}
    >
      <AnimatePresence initial={false} mode="popLayout">
        {startSlot ? (
          <motion.span
            key="start"
            layout={layout}
            initial={hidden(-6)}
            animate={{ opacity: 1, x: 0 }}
            exit={hidden(-6)}
            transition={slotTransition}
            className="flex items-center"
          >
            {startSlot}
          </motion.span>
        ) : null}
        {hasLabel ? (
          <motion.span
            key="label"
            layout={layout}
            transition={slotTransition}
            className="flex items-center gap-[inherit]"
          >
            {content}
          </motion.span>
        ) : null}
        {endSlot ? (
          <motion.span
            key="end"
            layout={layout}
            initial={hidden(6)}
            animate={{ opacity: 1, x: 0 }}
            exit={hidden(6)}
            transition={slotTransition}
            className="flex items-center"
          >
            {endSlot}
          </motion.span>
        ) : null}
      </AnimatePresence>
    </MotionButtonPrimitive>
  );
}

export { Button, ButtonDefaultsProvider, buttonVariants, type ButtonProps };
