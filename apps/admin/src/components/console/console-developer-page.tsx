import { Badge } from "@repo/ui/components/ui/badge";
import type { ReactNode } from "react";

import { KeysTable } from "@/components/developers/keys-table";
import { CallsMeter } from "@/components/shared/calls-meter";
import type { ConsoleDeveloper } from "@/lib/api";
import { m } from "@/paraglide/messages.js";

type ConsoleDeveloperPageProps = {
  developer: ConsoleDeveloper;
  now: number;
  // The account's calls: the route draws them, since it knows the span of time on screen.
  children: ReactNode;
};

/**
 * One developer account, as a member reads it: its limit, its keys by name, and its calls. It
 * changes nothing: an operator makes the keys and sets the limit.
 */
export function ConsoleDeveloperPage({ developer, now, children }: ConsoleDeveloperPageProps) {
  const suspended = developer.suspendedAt !== null;

  return (
    <>
      <div className="grid gap-xs">
        <div className="flex min-w-0 items-center gap-s">
          <h1 className="truncate text-l font-medium">{developer.name}</h1>
          {suspended && <Badge variant="warning">{m.developer_suspended()}</Badge>}
        </div>
        <p className="max-w-(--container-2xl) text-s text-neutral-7">
          {suspended ? m.console_suspended_note() : m.console_read_only()}
        </p>
      </div>

      <dl className="grid gap-x-l gap-y-m sm:grid-cols-[repeat(auto-fit,minmax(12rem,1fr))]">
        <div className="grid content-start gap-xxs">
          <dt className="text-s text-neutral-7">{m.developer_calls_this_hour()}</dt>
          <dd>
            <CallsMeter
              calls={developer.callsThisHour}
              limit={developer.callsPerHour}
              label={m.developer_calls_this_hour()}
            />
          </dd>
        </div>
        <div className="grid content-start gap-xxs">
          <dt className="text-s text-neutral-7">{m.developer_limit()}</dt>
          <dd>
            {developer.callsPerHour === null ? m.developer_no_limit() : developer.callsPerHour}
          </dd>
        </div>
      </dl>

      <section className="grid grid-cols-1 gap-s">
        <h2 className="text-m font-medium">{m.developer_keys()}</h2>
        <KeysTable keys={developer.keys} suspended={suspended} readOnly now={now} />
      </section>

      {children}
    </>
  );
}
