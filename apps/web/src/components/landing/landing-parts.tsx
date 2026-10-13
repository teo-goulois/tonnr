import { cn } from "@repo/ui/lib/utils";
import type { ReactNode } from "react";

/** The parts of the landing its header leads to, by the id each one answers to. */
export const SECTIONS = { features: "features", agents: "agents", story: "story" } as const;

/** The width every part of the landing keeps to, and its margins. */
export const column = "mx-auto w-full max-w-6xl px-m sm:px-l";

/** The room over a part of the landing: twice a phone's on a wide screen. */
export const apart = "pt-[calc(var(--space-xxl)*1.5)] lg:pt-[calc(var(--space-xxl)*3)]";

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
  title: string;
  more?: string;
  className?: string;
}) {
  return (
    <h2 id={id} className={cn("text-l font-medium text-balance lg:text-xl", className)}>
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
