import { cn } from "@repo/ui/lib/utils";
import type { CSSProperties, ReactNode } from "react";

/** The parts of the landing its header leads to, by the id each one answers to. */
export const SECTIONS = {
  features: "features",
  sources: "sources",
  agents: "agents",
  story: "story",
  next: "next",
} as const;

/** The width every part of the landing keeps to, and its margins. */
export const column = "mx-auto w-full max-w-6xl px-m sm:px-l";

/** The room over a part of the landing: twice a phone's on a wide screen. */
export const apart = "pt-[calc(var(--space-xxl)*1.5)] lg:pt-[calc(var(--space-xxl)*3)]";

// What an icon does under the pointer, wherever the landing sets one in a line of text: the
// motion of the inline links of teogoulois.com.
const lively =
  "transition-[rotate,scale] duration-200 ease-out motion-reduce:transition-none group-hover/lively:-rotate-3 group-hover/lively:scale-110";

/**
 * A small square set in a line of text, as an app's icon is: a picture, or an icon on a color of
 * the sea's scales. It is sized by the text it stands in, and moves when its line is pointed at.
 */
export function Tile({
  color,
  className,
  children,
}: {
  color?: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <span
      aria-hidden
      style={color ? ({ backgroundColor: color } as CSSProperties) : undefined}
      className={cn(
        "mr-[0.28em] inline-flex size-[0.92em] translate-y-[0.12em] items-center justify-center overflow-hidden rounded-[0.26em] text-white [&_img]:size-full [&_img]:object-cover [&_svg]:size-[0.56em]",
        lively,
        className,
      )}
    >
      {children}
    </span>
  );
}

/**
 * The title of a part of the landing, and what it comes to in a sentence, in the same line and a
 * quieter color: the page has no paragraph under a title.
 */
export function SectionTitle({
  id,
  title,
  more,
  className,
}: {
  id?: string;
  title: ReactNode;
  more?: string;
  className?: string;
}) {
  return (
    <h2
      id={id}
      className={cn("group/lively text-l font-medium text-balance lg:text-xl", className)}
    >
      {title}
      {more && <span className="text-neutral-7"> {more}</span>}
    </h2>
  );
}

/** A piece of the product, or of a program, set apart from the page's prose. */
export function Card({ className, children }: { className?: string; children: ReactNode }) {
  return <div className={cn("rounded-(--radius-s) bg-neutral-2 p-l", className)}>{children}</div>;
}

/** A line between two rows, drawn as the theme draws an edge. */
export const ruled = "shadow-[inset_0_var(--border-s)_0_var(--neutral-4)]";

/** A link in a line of prose, with what it leads to drawn before its words. */
export function InlineLink({
  href,
  icon,
  children,
}: {
  href: string;
  icon?: ReactNode;
  children: ReactNode;
}) {
  return (
    <a
      href={href}
      className="group/lively focus-ring rounded-xs font-medium text-neutral-10 underline decoration-neutral-5 underline-offset-4 transition-[text-decoration-color] duration-(--motion-duration) hover:decoration-neutral-10"
    >
      {icon}
      {children}
    </a>
  );
}
