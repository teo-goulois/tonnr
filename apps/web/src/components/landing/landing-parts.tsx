import { APP_NAME } from "@repo/config/app";
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

// The depth of a tile of color: a light that falls from above, a crisp edge, and a shadow under
// it. The theme's shadows are none, so these are the tile's own. The lighter part of a fill duo
// icon is raised from its 40 % so that it still reads in white on a color.
const raised =
  "[&_[data-color=color-2]]:opacity-70 [&_[data-color=color-2]]:[fill-opacity:1] bg-linear-to-b from-white/25 to-white/0 shadow-[inset_0_0_0_1px_rgb(0_0_0/0.08),inset_0_1.5px_0_rgb(255_255_255/0.25),0_1px_2px_rgb(0_0_0/0.12),0_2px_6px_-2px_rgb(0_0_0/0.16)]";

/**
 * A small square set in a line of text, as an app's icon is: a picture, or an icon on a color of
 * the sea's scales, raised off the page. It is sized by the text it stands in, centered on its
 * capitals, and moves when the words of its `Lively` are pointed at. A tile of another size says
 * it in `--tile`.
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
  // What it holds is laid over it, so that the square stands on the line by its own edge, whatever
  // it holds: a picture and an icon sit at the same height.
  return (
    <span
      aria-hidden
      style={color ? ({ backgroundColor: color } as CSSProperties) : undefined}
      className={cn(
        "relative mr-[0.28em] inline-block size-(--tile) overflow-hidden rounded-[0.26em] align-[calc(0.5cap_-_var(--tile)/2)] text-white [--tile:0.92em] [&_img]:size-full [&_img]:object-cover [&_svg]:size-[0.56em]",
        color && raised,
        lively,
        className,
      )}
    >
      <span className="absolute inset-0 flex items-center justify-center">{children}</span>
    </span>
  );
}

/** A tile and the words it stands before: pointing at them moves the tile, and nothing else does. */
export function Lively({ className, children }: { className?: string; children: ReactNode }) {
  return <span className={cn("group/lively", className)}>{children}</span>;
}

/** The product's name, with its icon before it. */
export function AppName() {
  return (
    <>
      <Tile className="mr-[0.2em]">
        <img src="/favicon.svg" alt="" />
      </Tile>
      {APP_NAME}
    </>
  );
}

/**
 * A message with words of its own: `say` writes the message with a mark where each word goes, and
 * each word is drawn there with the tile before it, on one line, the tile moving when the word is
 * pointed at.
 */
export function Woven<Key extends string>({
  say,
  words,
}: {
  say: (marks: Record<Key, string>) => string;
  words: Record<Key, ReactNode>;
}) {
  const keys = Object.keys(words) as Key[];
  const marks = Object.fromEntries(keys.map((key) => [key, `\uE000${key}\uE000`])) as Record<
    Key,
    string
  >;
  // Split by its marks, the message alternates its own words and the names of the words drawn.
  return (
    <>
      {say(marks)
        .split(/\uE000(\w+)\uE000/)
        .map((piece, index) =>
          index % 2 === 0 ? (
            piece
          ) : (
            <Lively key={piece} className="whitespace-nowrap">
              {words[piece as Key]}
            </Lively>
          ),
        )}
    </>
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
  more?: ReactNode;
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
