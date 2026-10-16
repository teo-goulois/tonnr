import { cn } from "@repo/ui/lib/utils";

import { arrive, order, ruled, useArriving } from "@/components/landing/landing-parts";
import { TERMS, type Term } from "@/lib/learn";
import { m } from "@/paraglide/messages.js";
import { getLocale } from "@/paraglide/runtime.js";

import { GLOSSARY } from "./glossary";
import { LearnFrame, learnRoot } from "./learn-frame";
import { Prose } from "./prose";

// The glossary: every technical word the guides use, in the reader's language, each with what it
// means and where the thing comes from, in the order of the reader's alphabet. Decision 060.

/**
 * One entry, which arrives as the landing's parts do once it is reached: the word, then what it
 * says. An entry the page opens on, through its anchor, is in view and shows at once.
 */
function Entry({ term, first }: { term: Term; first: boolean }) {
  const arriving = useArriving<HTMLDivElement>();
  const entry = GLOSSARY[term];
  return (
    <div
      {...arriving}
      id={term}
      className={cn(
        !first && ruled,
        "group/arrival grid scroll-mt-[calc(var(--space-xxl)*2)] gap-s py-l lg:grid-cols-12 lg:gap-x-xl",
      )}
    >
      <dt className={cn(arrive, "text-l font-medium lg:col-span-4")} style={order(0)}>
        {entry.word()}
      </dt>
      <dd className={cn(arrive, "grid gap-s lg:col-span-8")} style={order(1)}>
        <Prose text={entry.what()} className="text-neutral-10" />
        <div className="grid gap-xxs">
          <span className="text-xs text-neutral-7">{m.learn_glossary_from()}</span>
          <Prose text={entry.from()} />
        </div>
      </dd>
    </div>
  );
}

export function GlossaryPage() {
  const sorted = [...TERMS].sort((a, b) =>
    GLOSSARY[a].word().localeCompare(GLOSSARY[b].word(), getLocale()),
  );
  return (
    <LearnFrame
      crumbs={[learnRoot(), { name: m.learn_glossary_nav(), page: null }]}
      title={m.learn_glossary_title()}
      lead={m.learn_glossary_lead()}
    >
      <dl>
        {sorted.map((term, index) => (
          <Entry key={term} term={term} first={index === 0} />
        ))}
      </dl>
    </LearnFrame>
  );
}
