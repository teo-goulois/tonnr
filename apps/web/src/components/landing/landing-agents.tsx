import { Link } from "@tanstack/react-router";
import { APP_NAME, FEEDBACK_URL, REPOSITORY_URL } from "@repo/config/app";
import { Button } from "@repo/ui/components/ui/button";
import {
  ArrowRightIcon,
  ArrowUpRightIcon,
  CircleCheckIcon,
  CopyIcon,
  SparklesFillDuoIcon,
} from "@repo/ui/icon";
import { useEffect, useState } from "react";

import { EXAMPLE_STATION, KEY_VARIABLE } from "@/lib/llms";
import { WAVE_PERIOD_SCALE, scaleColor } from "@/lib/sea-scales";
import { m } from "@/paraglide/messages.js";

import {
  AppName,
  Card,
  SECTIONS,
  SectionTitle,
  Tile,
  Woven,
  apart,
  column,
  ruled,
} from "./landing-parts";

const COPIED_MS = 2000;
// The violet of a long swell, for what is said to a program.
const AGENT_COLOR = scaleColor(WAVE_PERIOD_SCALE, 14);

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

/** A text someone takes away, under what it is, with the button that copies it. */
function Copyable({
  label,
  text,
  isCode = false,
}: {
  label: string;
  text: string;
  isCode?: boolean;
}) {
  return (
    <Card className="grid gap-s">
      <div className="flex items-center justify-between gap-m">
        <h3 className="text-s text-neutral-7">{label}</h3>
        <CopyButton text={text} />
      </div>
      {isCode ? (
        <pre className="overflow-x-auto font-mono text-s" translate="no">
          <code>{text}</code>
        </pre>
      ) : (
        <p>{text}</p>
      )}
    </Card>
  );
}

// How Claude Code is given the MCP server, as `/llms.txt` and `docs/mcp.md` say it.
const connect = (api: string) =>
  `claude mcp add --transport http ${APP_NAME.toLowerCase()} ${api}/mcp \\\n  --header "Authorization: Bearer $${KEY_VARIABLE}"`;

// The word "agents", with its tile.
function Agents() {
  return (
    <>
      <Tile color={AGENT_COLOR}>
        <SparklesFillDuoIcon />
      </Tile>
      {m.landing_agents_word()}
    </>
  );
}

/** On the landing: that a program reads the service too, and the one thing to say to it. */
export function LandingAgents({ api }: { api: string }) {
  return (
    <section aria-labelledby={SECTIONS.agents} className={`${column} ${apart} grid gap-xl`}>
      <SectionTitle
        id={SECTIONS.agents}
        title={<Woven say={m.landing_agents_title} words={{ agents: <Agents /> }} />}
        more={m.landing_agents_more()}
        className="max-w-4xl scroll-mt-[calc(var(--space-xxl)*2)]"
      />
      <div className="grid items-start gap-l lg:grid-cols-12 lg:gap-x-xl">
        <div className="lg:col-span-8">
          <Copyable label={m.landing_agents_mcp_label()} text={connect(api)} isCode />
        </div>
        <ul className="lg:col-span-4">
          <Resource href="/llms.txt" name="llms.txt" />
          <li className={ruled}>
            <Link
              to="/agents"
              className="group focus-ring flex items-center justify-between gap-m rounded-xs py-m font-medium"
            >
              {m.landing_agents_all()}
              <ArrowRightIcon
                aria-hidden
                className="size-4 text-neutral-6 transition-[color,translate] duration-(--motion-duration) ease-theme group-hover:translate-x-0.5 group-hover:text-neutral-10"
              />
            </Link>
          </li>
        </ul>
      </div>
    </section>
  );
}

function Resource({ href, name, text }: { href: string; name: string; text?: string }) {
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

/** The page for whoever builds on the service: what a program reads, and how it starts. */
export function AgentsGuide({ api, site }: { api: string; site: string }) {
  return (
    <section className={`${column} grid gap-xl pt-xl lg:pt-xxl`}>
      <h1 className="max-w-4xl text-l font-medium text-balance lg:text-xl">
        <Woven
          say={m.landing_agents_page_title}
          words={{ name: <AppName />, agents: <Agents /> }}
        />
        <span className="text-neutral-7"> {m.landing_agents_page_more()}</span>
      </h1>
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
              href={`${REPOSITORY_URL}/blob/main/docs/mcp.md`}
              name="MCP"
              text={m.landing_agents_mcp_docs()}
            />
            <Resource
              href={FEEDBACK_URL}
              name={m.landing_agents_key_name()}
              text={m.landing_agents_key_text()}
            />
          </ul>
        </div>
        <div className="grid content-start gap-m lg:col-span-6">
          <div className="grid gap-xs">
            <Copyable label={m.landing_agents_mcp_label()} text={connect(api)} isCode />
            <p className="px-l text-s text-neutral-7">{m.landing_agents_mcp_text()}</p>
          </div>
          <Copyable
            label={m.landing_agents_prompt_label()}
            text={m.landing_agents_prompt({ url: `${site}/llms.txt` })}
          />
          <Card className="grid gap-s">
            <h2 className="text-s text-neutral-7">{m.landing_agents_request_label()}</h2>
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
