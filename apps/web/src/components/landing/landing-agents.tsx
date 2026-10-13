import { FEEDBACK_URL } from "@repo/config/app";
import { Button } from "@repo/ui/components/ui/button";
import { ArrowUpRightIcon, CircleCheckIcon, CopyIcon } from "@repo/ui/icon";
import { useEffect, useState } from "react";

import { EXAMPLE_STATION, KEY_VARIABLE } from "@/lib/llms";
import { m } from "@/paraglide/messages.js";

import { Card, SECTIONS, SectionTitle, apart, column, ruled } from "./landing-parts";

const COPIED_MS = 2000;

// What the request answers, cut to what the picture of the map shows of the same buoy.
const ANSWER = `{
  "id": "${EXAMPLE_STATION}",
  "name": "Belle-Ile",
  "latestReading": {
    "significantHeightMeters": 1.9,
    "peakPeriodSeconds": 9,
    …
  },
  "attribution": "…",
  "license": { … }
}`;

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), COPIED_MS);
    return () => clearTimeout(timer);
  }, [copied]);

  return (
    <Button
      variant="ghost"
      size="xs"
      onClick={() => void navigator.clipboard.writeText(text).then(() => setCopied(true))}
    >
      {copied ? (
        <CircleCheckIcon data-slot="icon" aria-hidden />
      ) : (
        <CopyIcon data-slot="icon" aria-hidden />
      )}
      <span aria-live="polite">{copied ? m.landing_copied() : m.landing_copy()}</span>
    </Button>
  );
}

function Resource({ href, name, text }: { href: string; name: string; text: string }) {
  return (
    <li className={ruled}>
      <a
        href={href}
        className="group focus-ring grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-m gap-y-xxs rounded-xs py-m sm:grid-cols-[minmax(0,1fr)_minmax(0,2fr)_auto]"
      >
        <span className="font-medium">{name}</span>
        <span className="text-neutral-7 max-sm:col-start-1 max-sm:row-start-2">{text}</span>
        <ArrowUpRightIcon
          aria-hidden
          className="size-4 text-neutral-6 transition-[color,translate] duration-(--motion-duration) ease-theme group-hover:translate-x-0.5 group-hover:-translate-y-0.5 group-hover:text-neutral-10 max-sm:row-span-2"
        />
      </a>
    </li>
  );
}

/** What a program reads of the service, and where an agent starts. */
export function LandingAgents({ api, site }: { api: string; site: string }) {
  const prompt = m.landing_agents_prompt({ url: `${site}/llms.txt` });

  return (
    <section aria-labelledby={SECTIONS.agents} className={`${column} ${apart} grid gap-xl`}>
      <SectionTitle
        id={SECTIONS.agents}
        title={m.landing_agents_title()}
        more={m.landing_agents_more()}
        className="max-w-4xl scroll-mt-xl"
      />
      <div className="grid gap-xl lg:grid-cols-12 lg:gap-x-xl">
        <div className="grid content-start gap-l lg:col-span-6">
          <p className="text-neutral-7">{m.landing_agents_body()}</p>
          <ul>
            <Resource href="/llms.txt" name="llms.txt" text={m.landing_agents_llms_text()} />
            <Resource
              href={`${api}/v1/openapi.json`}
              name={m.landing_agents_spec_name()}
              text={m.landing_agents_spec_text()}
            />
            <Resource
              href={`${api}/v1/docs`}
              name={m.landing_agents_docs_name()}
              text={m.landing_agents_docs_text()}
            />
            <Resource
              href={FEEDBACK_URL}
              name={m.landing_agents_key_name()}
              text={m.landing_agents_key_text()}
            />
          </ul>
        </div>

        <div className="grid content-start gap-m lg:col-span-6">
          <Card className="grid gap-s">
            <div className="flex items-center justify-between gap-m">
              <h3 className="text-s text-neutral-7">{m.landing_agents_prompt_label()}</h3>
              <CopyButton text={prompt} />
            </div>
            <p>{prompt}</p>
          </Card>
          <Card className="grid gap-s">
            <h3 className="text-s text-neutral-7">{m.landing_agents_request_label()}</h3>
            <pre className="overflow-x-auto font-mono text-s" translate="no">
              <code>
                {`curl ${api}/v1/stations/${EXAMPLE_STATION} \\\n  -H "Authorization: Bearer $${KEY_VARIABLE}"`}
                <span className="text-neutral-7">{`\n\n${ANSWER}`}</span>
              </code>
            </pre>
          </Card>
        </div>
      </div>
    </section>
  );
}
