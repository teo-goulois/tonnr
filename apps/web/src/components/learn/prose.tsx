import { cn } from "@repo/ui/lib/utils";
import { Fragment } from "react";

import { parseProse } from "@/lib/learn";

import { Term } from "./term";

/**
 * A paragraph of a guide, as its message writes it: the words, a few set in the darker type
 * with `**`, and each technical word, written `[word](id)`, drawn as a `Term`.
 */
export function Prose({
  text,
  className,
  inline = false,
}: {
  text: string;
  className?: string;
  // Drawn as a span, for a paragraph that stands in another element.
  inline?: boolean;
}) {
  const Element = inline ? "span" : "p";
  return (
    <Element className={cn(!inline && "text-neutral-7", className)}>
      {parseProse(text).map((piece, index) => (
        // The pieces keep their order: nothing else tells two alike apart.
        // oxlint-disable-next-line react/no-array-index-key
        <Fragment key={index}>
          {piece.kind === "text" && piece.text}
          {piece.kind === "strong" && (
            <strong className="font-medium text-neutral-10">{piece.text}</strong>
          )}
          {piece.kind === "term" && <Term id={piece.term}>{piece.text}</Term>}
        </Fragment>
      ))}
    </Element>
  );
}
