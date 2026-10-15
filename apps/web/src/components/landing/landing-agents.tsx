import { Link } from "@tanstack/react-router";
import { APP_NAME, REPOSITORY_URL } from "@repo/config/app";
import { Button, buttonVariants } from "@repo/ui/components/ui/button";
import {
  ArrowRightIcon,
  ArrowUpRightIcon,
  CircleCheckIcon,
  ClaudeIcon,
  CopyIcon,
  OpenAIIcon,
  SparklesFillDuoIcon,
} from "@repo/ui/icon";
import { cn } from "@repo/ui/lib/utils";
import { type ReactNode, useEffect, useState } from "react";

import { EXAMPLE_STATION, KEY_VARIABLE } from "@/lib/llms";
import { WAVE_PERIOD_SCALE, scaleColor } from "@/lib/sea-scales";
import { m } from "@/paraglide/messages.js";

import {
  Card,
  SECTIONS,
  SectionTitle,
  Tile,
  Woven,
  apart,
  arrive,
  column,
  order,
  ruled,
  under,
  useArriving,
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

// The assistants a person adds the server to, each with where its connectors are set and what
// it asks first. Claude takes a custom connector on every plan, ChatGPT in its developer mode.
const ASSISTANTS = [
  {
    name: "Claude",
    icon: <ClaudeIcon />,
    steps: m.landing_agents_claude_steps,
    href: "https://claude.ai/settings/connectors",
  },
  {
    name: "ChatGPT",
    icon: <OpenAIIcon />,
    steps: m.landing_agents_chatgpt_steps,
    href: "https://chatgpt.com/#settings/Connectors",
  },
];

// An assistant's mark, on a white square as its own app icon stands.
function Mark({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <Tile className={cn("edge bg-white text-black [&_svg]:size-[0.62em]", className)}>
      {children}
    </Tile>
  );
}

// A link that leads on within the site, as a row of a list.
const row = "group focus-ring flex items-center justify-between gap-m rounded-xs py-m font-medium";
const onward =
  "size-4 text-neutral-6 transition-[color,translate] duration-(--motion-duration) ease-theme group-hover:translate-x-0.5 group-hover:text-neutral-10";

/**
 * How an account adds the server to Claude or ChatGPT: the address to paste, then what each one
 * asks, with the way to its connectors. No key: the account signs the assistant in, decision 047.
 */
function Connect({ api }: { api: string }) {
  return (
    <div className="grid gap-m">
      <Copyable label={m.landing_agents_connector_label()} text={`${api}/mcp`} isCode />
      <ul className="grid gap-m sm:grid-cols-2">
        {ASSISTANTS.map((assistant) => (
          <li key={assistant.name} className="grid content-start gap-xs">
            <h3 className="flex items-center gap-xs font-medium">
              <span className="text-l leading-none">
                <Mark className="mr-0">{assistant.icon}</Mark>
              </span>
              {assistant.name}
            </h3>
            <p className="text-neutral-7 text-pretty">{assistant.steps({ name: APP_NAME })}</p>
            <a
              href={assistant.href}
              target="_blank"
              rel="noreferrer"
              className={cn(
                buttonVariants({ variant: "secondary", size: "sm" }),
                "mt-xxs justify-self-start",
              )}
            >
              {m.landing_agents_open({ name: assistant.name })}
              <ArrowUpRightIcon data-slot="icon" aria-hidden />
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** The way to ask for a key: the form of `/contact`, opened on its topic. */
function KeyLink() {
  return (
    <Link to="/contact" search={{ topic: "key" }} className={row}>
      {m.landing_agents_dev_key()}
      <ArrowRightIcon aria-hidden className={onward} />
    </Link>
  );
}

/**
 * On the landing: that Claude or ChatGPT reads the service too, and how to add it. An account
 * adds the address as a connector and signs it in, with no key (decision 047). A developer asks
 * for a key, by the form of `/contact` for now.
 */
export function LandingAgents({ api }: { api: string }) {
  const arriving = useArriving<HTMLElement>();
  return (
    <section
      {...arriving}
      aria-labelledby={SECTIONS.agents}
      className={`${column} ${apart} ${under} group/arrival grid`}
    >
      <SectionTitle
        id={SECTIONS.agents}
        title={
          <Woven
            say={m.landing_agents_title}
            words={{
              claude: (
                <>
                  <Mark>
                    <ClaudeIcon />
                  </Mark>
                  Claude
                </>
              ),
              chatgpt: (
                <>
                  <Mark>
                    <OpenAIIcon />
                  </Mark>
                  ChatGPT
                </>
              ),
            }}
          />
        }
        more={m.landing_agents_more()}
        className={cn(arrive, "max-w-4xl scroll-mt-[calc(var(--space-xxl)*2)]")}
      />
      <div className="grid items-start gap-l lg:grid-cols-12 lg:gap-x-xl">
        <div style={order(1)} className={cn(arrive, "lg:col-span-8")}>
          <Connect api={api} />
        </div>
        {/* Whoever builds on the data: the API, and how a key is had. */}
        <div style={order(2)} className={cn(arrive, "grid gap-xs lg:col-span-4")}>
          <h3 className="font-medium">{m.landing_agents_dev_name()}</h3>
          <p className="text-neutral-7 text-pretty">{m.landing_agents_dev_text()}</p>
          <ul className="mt-xs">
            <li className={ruled}>
              <KeyLink />
            </li>
            <li className={ruled}>
              <Link to="/agents" className={row}>
                {m.landing_agents_all()}
                <ArrowRightIcon aria-hidden className={onward} />
              </Link>
            </li>
            <Resource href="/llms.txt" name="llms.txt" />
          </ul>
        </div>
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

// The tools of the MCP server, as `docs/mcp.md` lists them: those every caller is given, then
// those an account's assistant is given too. A tool that comes or goes changes here.
const SHARED_TOOLS = [
  ["list_stations", m.agents_tool_list_stations],
  ["get_station", m.agents_tool_get_station],
  ["get_station_readings", m.agents_tool_get_station_readings],
  ["get_forecast", m.agents_tool_get_forecast],
  ["get_tide_extremes", m.agents_tool_get_tide_extremes],
  ["get_tide_timeline", m.agents_tool_get_tide_timeline],
  ["list_surf_breaks", m.agents_tool_list_surf_breaks],
  ["search_surf_breaks", m.agents_tool_search_surf_breaks],
  ["get_surf_break", m.agents_tool_get_surf_break],
  ["get_surf_break_guide", m.agents_tool_get_surf_break_guide],
] as const;
const ACCOUNT_TOOLS = [
  ["list_my_spots", m.agents_tool_list_my_spots],
  ["list_my_alerts", m.agents_tool_list_my_alerts],
  ["list_my_alert_notifications", m.agents_tool_list_my_alert_notifications],
  ["list_my_sessions", m.agents_tool_list_my_sessions],
  ["get_my_session", m.agents_tool_get_my_session],
  ["get_my_sessions_recap", m.agents_tool_get_my_sessions_recap],
] as const;

function Tools({
  title,
  tools,
}: {
  title: string;
  tools: ReadonlyArray<readonly [string, () => string]>;
}) {
  return (
    <div className="grid content-start gap-xs">
      <h3 className="font-medium">{title}</h3>
      <ul>
        {tools.map(([name, says]) => (
          <li
            key={name}
            className={`${ruled} grid gap-xxs py-s sm:grid-cols-[minmax(0,2fr)_minmax(0,3fr)] sm:gap-m`}
          >
            <code className="font-mono text-s" translate="no">
              {name}
            </code>
            <span className="text-neutral-7">{says()}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

// A part of the page, under a title of its own.
function Part({ title, more, children }: { title: string; more: string; children: ReactNode }) {
  return (
    <section className="grid gap-l">
      <div className="grid max-w-3xl gap-xxs">
        <h2 className="text-l font-medium">{title}</h2>
        <p className="text-neutral-7 text-pretty">{more}</p>
      </div>
      {children}
    </section>
  );
}

/**
 * The page for whoever plugs an assistant or a program into the service: an account adds it to
 * Claude or ChatGPT, what its tools read, then a developer's key, the API and an example.
 */
export function AgentsGuide({ api, site }: { api: string; site: string }) {
  return (
    <div className={`${column} grid gap-xxl pt-xl lg:pt-xxl`}>
      <h1 className="max-w-4xl text-l font-medium text-balance lg:text-xl">
        <Woven
          say={m.agents_page_title}
          words={{
            assistant: (
              <>
                <Tile color={AGENT_COLOR}>
                  <SparklesFillDuoIcon />
                </Tile>
                {m.agents_page_word()}
              </>
            ),
          }}
        />
        <span className="text-neutral-7"> {m.agents_page_more()}</span>
      </h1>

      <Part title={m.agents_account_title()} more={m.agents_account_more({ name: APP_NAME })}>
        <div className="lg:w-2/3">
          <Connect api={api} />
        </div>
      </Part>

      <Part title={m.agents_tools_title()} more={m.agents_tools_more()}>
        <div className="grid gap-xl lg:grid-cols-2 lg:gap-x-xl">
          <Tools title={m.agents_tools_shared()} tools={SHARED_TOOLS} />
          <Tools title={m.agents_tools_account()} tools={ACCOUNT_TOOLS} />
        </div>
      </Part>

      <Part title={m.landing_agents_dev_name()} more={m.landing_agents_dev_text()}>
        <div className="grid gap-xl lg:grid-cols-12 lg:gap-x-xl">
          <ul className="lg:col-span-5">
            <li className={ruled}>
              <KeyLink />
            </li>
            <Resource
              href="/llms.txt"
              name="llms.txt"
              text={m.landing_agents_llms_text({ name: APP_NAME })}
            />
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
          </ul>
          <div className="grid content-start gap-m lg:col-span-7">
            <div className="grid gap-xs">
              <Copyable label={m.landing_agents_mcp_label()} text={connect(api)} isCode />
              <p className="px-l text-s text-neutral-7">{m.landing_agents_mcp_text()}</p>
            </div>
            <Copyable
              label={m.landing_agents_prompt_label()}
              text={m.landing_agents_prompt({ url: `${site}/llms.txt`, name: APP_NAME })}
            />
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
      </Part>
    </div>
  );
}
