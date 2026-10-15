import type { SpotPage } from "@/lib/pages-api";
import { m } from "@/paraglide/messages.js";
import { getLocale } from "@/paraglide/runtime.js";

import { SpotSection } from "./spot-frame";

// The confirmed texts of the break's guide, which accounts wrote: each line in the reader's
// language when someone wrote it, else in English, else as it was written, marked with its
// language. They are what lists a break that says little else, so the page shows them. Decision 057.

type Text = SpotPage["texts"][number];

const LABELS: Record<Text["line"], () => string> = {
  access: m.guide_line_access,
  entry: m.guide_line_entry,
  hazards: m.guide_line_hazards,
  rules: m.guide_line_rules,
};

/** One text a line, in the language that fits the reader best. */
export function textsFor(texts: readonly Text[], locale: string) {
  const lines = ["access", "entry", "hazards", "rules"] as const;
  return lines.flatMap((line) => {
    const ofLine = texts.filter((text) => text.line === line);
    const chosen =
      ofLine.find((text) => text.language === locale) ??
      ofLine.find((text) => text.language === "en") ??
      ofLine[0];
    return chosen ? [chosen] : [];
  });
}

export function GuideTexts({ texts }: { texts: readonly Text[] }) {
  const locale = getLocale();
  const shown = textsFor(texts, locale);
  if (shown.length === 0) return null;
  return (
    <SpotSection title={m.page_guide()}>
      <dl className="grid gap-s">
        {shown.map((text) => (
          <div key={text.line} className="grid gap-xxs">
            <dt className="text-s font-medium text-neutral-7">{LABELS[text.line]()}</dt>
            <dd lang={text.language === locale ? undefined : text.language} className="text-m">
              {text.text}
            </dd>
          </div>
        ))}
      </dl>
    </SpotSection>
  );
}
