import { useMutation } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

import { MailOffPage } from "@/components/alerts/mail-off-page";
import { AppShell } from "@/components/shared/app-shell";
import { orpc } from "@/utils/orpc";

export const Route = createFileRoute("/mail-off")({
  // The two values the link of an alert mail carries: the account, and the key of its mails.
  validateSearch: z.object({
    u: z.coerce.string().optional().catch(undefined),
    k: z.coerce.string().optional().catch(undefined),
  }),
  // The address carries the key: no search engine lists it, and no other site is told it.
  head: () => ({
    meta: [
      { name: "robots", content: "noindex" },
      { name: "referrer", content: "no-referrer" },
    ],
  }),
  component: MailOff,
});

function MailOff() {
  const { u, k } = Route.useSearch();
  const stop = useMutation(orpc.v1.alerts.mailOff.mutationOptions());
  // A link with a part missing is one that is good no more.
  const state =
    !u || !k
      ? "spent"
      : stop.isError
        ? "failed"
        : stop.data
          ? stop.data.off
            ? "off"
            : "spent"
          : "asked";

  return (
    <AppShell>
      <MailOffPage
        state={state}
        isStopping={stop.isPending}
        onStop={() => {
          if (u && k) stop.mutate({ query: { u, k } });
        }}
      />
    </AppShell>
  );
}
