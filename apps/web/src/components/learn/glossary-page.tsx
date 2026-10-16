import { TERMS, type Term } from "@/lib/learn";
import { m } from "@/paraglide/messages.js";
import { getLocale } from "@/paraglide/runtime.js";

import { GLOSSARY } from "./glossary";
import { LearnFrame, learnRoot } from "./learn-frame";
import { Prose } from "./prose";

// The glossary: every technical word the guides use, in the reader's language, each with what it
// means and where the thing comes from, in the order of the reader's alphabet. Decision 060.

const ruled = "shadow-[inset_0_var(--border-s)_0_var(--neutral-4)]";

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
        {sorted.map((term: Term, index) => {
          const entry = GLOSSARY[term];
          return (
            <div
              key={term}
              id={term}
              className={`${index > 0 ? ruled : ""} grid scroll-mt-[calc(var(--space-xxl)*2)] gap-s py-l lg:grid-cols-12 lg:gap-x-xl`}
            >
              <dt className="text-l font-medium lg:col-span-4">{entry.word()}</dt>
              <dd className="grid gap-s lg:col-span-8">
                <Prose text={entry.what()} className="text-neutral-10" />
                <div className="grid gap-xxs">
                  <span className="text-xs text-neutral-7">{m.learn_glossary_from()}</span>
                  <Prose text={entry.from()} />
                </div>
              </dd>
            </div>
          );
        })}
      </dl>
    </LearnFrame>
  );
}
