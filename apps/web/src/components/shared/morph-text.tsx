import type { ElementType } from "react";
import { TextMorph } from "torph/react";

import { getLocale } from "@/paraglide/runtime.js";

// How something large moves in the theme, read where the theme says it, once: the library takes
// a number of milliseconds and an easing, and reads no CSS variable.
let motion: { duration: number; ease: string } | undefined;

function themeMotion() {
  if (motion || typeof document === "undefined") return motion;
  const style = getComputedStyle(document.documentElement);
  const lasts = style.getPropertyValue("--motion-large-duration").trim();
  const duration = Number.parseFloat(lasts) * (lasts.endsWith("ms") ? 1 : 1000);
  const ease = style.getPropertyValue("--motion-large-easing").trim();
  motion = { duration: Number.isFinite(duration) ? duration : 280, ease: ease || "ease-out" };
  return motion;
}

/**
 * A short text that moves to what it becomes: the figures that change slide, and the ones that
 * stay do not move. For a value that its reader changes by hand, such as a length under a
 * slider. It stays still for a reader who asked for no motion.
 */
export function MorphText({
  children,
  className,
  as,
}: {
  children: string;
  className?: string;
  as?: ElementType;
}) {
  return (
    <TextMorph {...themeMotion()} locale={getLocale()} className={className} as={as}>
      {children}
    </TextMorph>
  );
}
