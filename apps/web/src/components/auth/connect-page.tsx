import { APP_NAME } from "@repo/config/app";
import { Button } from "@repo/ui/components/ui/button";
import { Skeleton } from "@repo/ui/components/ui/skeleton";
import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";

import type { AgentClient } from "@/lib/agent-sign-in";
import { m } from "@/paraglide/messages.js";

import { AuthForm, type AuthMode } from "./auth-form";
import { PageColumn } from "@/components/shared/page-column";

type ConnectPageProps =
  // Nothing asked: the page was opened by its address alone.
  | { state: "nothing" }
  // The browser's session is not known yet.
  | { state: "waiting" }
  | {
      state: "sign-in";
      mode: AuthMode;
      onModeChange: (mode: AuthMode) => void;
      // The account is signed in: the API is asked again, with its session.
      onSignedIn: () => void;
    }
  | {
      state: "asking";
      // What the assistant named itself. Undefined while the API has not said.
      client: AgentClient | undefined;
      // What others read of the account that answers. Null for one with no username.
      username: string | null;
      // The host the answer goes to. Null for an app of the account's own machine.
      returnsTo: string | null;
      isAnswering: boolean;
      // The API did not take the answer, or did not say what the assistant is.
      failed: boolean;
      onAllow: () => void;
      onDeny: () => void;
    };

// A page of its own, with no header and no tabs: the account came from an assistant, and has one
// thing to do here. The product's mark says whose page it is.
function Frame({ busy, children }: { busy?: boolean; children: ReactNode }) {
  return (
    <PageColumn className="gap-xl" aria-busy={busy}>
      <p className="flex items-center gap-xs font-bold tracking-[-0.02em]">
        <img src="/favicon.svg" alt="" width={24} height={24} className="size-6" />
        {APP_NAME}
      </p>
      <div className="grid gap-l">{children}</div>
    </PageColumn>
  );
}

// What a token lets an assistant read, in the order the account thinks of it.
const READS = [
  m.connect_read_spots,
  m.connect_read_alerts,
  m.connect_read_sessions,
  m.connect_read_shared,
];

/**
 * Where an assistant sends an account that it wants to read: the account signs in, is told
 * what the assistant will read and where its answer goes, and allows it or refuses. Decision
 * 047. What an assistant says of itself is its own word, so the page names the host as well.
 */
export function ConnectPage(props: ConnectPageProps) {
  if (props.state === "nothing") {
    return (
      <Frame>
        <div className="grid gap-xs">
          <h1 className="text-l font-medium">{m.connect_nothing_title()}</h1>
          <p className="text-neutral-7">{m.connect_nothing_text({ app: APP_NAME })}</p>
        </div>
        <div>
          <Link to="/app" className="focus-ring rounded-(--radius-xs) underline underline-offset-4">
            {m.verify_open_map()}
          </Link>
        </div>
      </Frame>
    );
  }

  if (props.state === "waiting") {
    return (
      <Frame busy>
        <div className="grid gap-xs">
          <Skeleton className="h-7 w-64" />
          <Skeleton className="h-5 w-80 max-w-full" />
        </div>
        <Skeleton className="h-10 w-40 rounded-(--radius-s)" />
      </Frame>
    );
  }

  if (props.state === "sign-in") {
    return (
      <Frame>
        <div className="grid gap-xs">
          <h1 className="text-l font-medium">{m.connect_title_sign_in()}</h1>
          <p className="text-neutral-7">{m.connect_sign_in_text({ app: APP_NAME })}</p>
        </div>
        <AuthForm
          mode={props.mode}
          onModeChange={props.onModeChange}
          onSuccess={props.onSignedIn}
        />
      </Frame>
    );
  }

  const { client, username, returnsTo, isAnswering, failed, onAllow, onDeny } = props;
  return (
    <Frame busy={client === undefined && !failed}>
      <div className="grid gap-xs">
        {client === undefined && !failed ? (
          <Skeleton className="h-7 w-72 max-w-full" />
        ) : (
          <h1 className="text-l font-medium text-pretty">
            {m.connect_title({ client: client?.name ?? m.connect_client_unnamed() })}
          </h1>
        )}
        {username && <p className="text-neutral-7">{m.connect_account({ name: username })}</p>}
      </div>

      <div className="grid gap-xs">
        <h2 className="text-s font-medium text-neutral-7">{m.connect_reads()}</h2>
        <ul className="grid list-disc gap-xxs pl-m">
          {READS.map((read) => (
            <li key={read()}>{read()}</li>
          ))}
        </ul>
        <p>{m.connect_no_write()}</p>
        <p className="text-s text-neutral-7">{m.connect_take_back()}</p>
      </div>

      <p className="text-s text-pretty text-neutral-7">
        {returnsTo ? m.connect_returns({ host: returnsTo }) : m.connect_returns_here()}
      </p>

      {failed && (
        <p role="alert" className="text-s text-error">
          {m.connect_failed()}
        </p>
      )}
      <div className="flex flex-wrap items-center gap-s">
        <Button disabled={isAnswering || failed} onClick={onAllow}>
          {m.connect_allow()}
        </Button>
        <Button variant="outline" disabled={isAnswering} onClick={onDeny}>
          {m.connect_deny()}
        </Button>
      </div>
    </Frame>
  );
}
