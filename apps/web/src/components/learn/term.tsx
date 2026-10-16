import { Popover, PopoverPopup, PopoverTrigger } from "@repo/ui/components/ui/popover";
import { ArrowRightIcon } from "@repo/ui/icon";
import { cn } from "@repo/ui/lib/utils";
import { type ReactNode, useState } from "react";

import { type Term as TermId, termHref } from "@/lib/learn";
import { m } from "@/paraglide/messages.js";

import { GLOSSARY } from "./glossary";

/** How a technical word is underlined in a lesson: as the sentence of a break's page underlines a part. */
export const termUnderline =
  "underline decoration-color-1 decoration-dotted decoration-1 underline-offset-[0.25em] transition-[text-decoration-color] duration-(--motion-duration) hover:decoration-neutral-10";

/**
 * A technical word in a lesson: a link to its entry of the glossary, which a reader without a
 * script and a search engine follow. With a script, a press opens what the entry says first, over
 * the lesson, with the way to the whole entry: the reader learns the word without leaving the
 * demo. Decision 060.
 */
export function Term({
  id,
  className,
  children,
}: {
  id: TermId;
  className?: string;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const entry = GLOSSARY[id];
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        nativeButton={false}
        render={<a href={termHref(id)} />}
        onClick={(event) => event.preventDefault()}
        className={cn(
          "focus-ring rounded-xs font-medium text-neutral-10",
          termUnderline,
          className,
        )}
      >
        {children}
      </PopoverTrigger>
      <PopoverPopup side="bottom" align="start" className="max-w-[22rem] gap-xs text-s">
        <p className="font-medium">{entry.word()}</p>
        <p className="text-neutral-7">{entry.what()}</p>
        <a
          href={termHref(id)}
          className="focus-ring group/more inline-flex items-center gap-xxs self-start rounded-xs font-medium"
        >
          {m.learn_term_more()}
          <ArrowRightIcon
            aria-hidden
            className="size-3.5 transition-[translate] duration-(--motion-duration) ease-theme group-hover/more:translate-x-0.5 motion-reduce:transition-none"
          />
        </a>
      </PopoverPopup>
    </Popover>
  );
}
