import type { ConnectedAgent } from "@repo/client/viewer/types";
import { SparkleIcon } from "@repo/ui/icon";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { confirmDestructive } from "@/components/saved/confirm";
import { feel } from "@/components/ui/haptics";
import { Row, Section } from "@/components/ui/list";
import { useTell } from "@/components/ui/toast";
import { useAccount } from "@/lib/account";
import { formatDate } from "@/lib/format";
import { m } from "@/paraglide/messages";
import { orpc } from "@/utils/orpc";

import { SwipeRow } from "./swipe-row";

// What an assistant says of itself: its site's host, and since when the account let it read.
function describe(agent: ConnectedAgent) {
  let host: string | undefined;
  try {
    host = agent.site ? new URL(agent.site).host : undefined;
  } catch {
    host = undefined;
  }
  const since = agent.since ? m.native_agent_since({ date: formatDate(agent.since) }) : undefined;
  return [host, since].filter(Boolean).join(" · ") || undefined;
}

/**
 * The assistants the account signed in to read it (decision 047), each of which a swipe, or a
 * press, disconnects once the person said to. Nothing when there is none: an account connects
 * one from the assistant itself, which `/connect` on the web answers.
 */
export function AgentsSection() {
  const { signedIn } = useAccount();
  const queryClient = useQueryClient();
  const tell = useTell();
  const listed = useQuery(
    orpc.v1.agents.list.queryOptions({
      enabled: signedIn,
      // An API from before the assistants answers with an error: the tab then lists none.
      retry: false,
    }),
  );
  const disconnect = useMutation(
    orpc.v1.agents.disconnect.mutationOptions({
      onSuccess: () => feel("done"),
      onError: () => tell({ title: m.auth_failed(), tone: "danger" }),
      onSettled: () => queryClient.invalidateQueries({ queryKey: orpc.v1.agents.list.key() }),
    }),
  );
  const agents = listed.data?.agents ?? [];
  if (!signedIn || agents.length === 0) return null;

  async function ask(agent: ConnectedAgent) {
    const name = agent.name ?? m.connect_client_unnamed();
    const sure = await confirmDestructive({
      title: m.native_agent_disconnect_title({ name }),
      message: m.native_agent_disconnect_message(),
      confirm: m.account_agent_disconnect(),
    });
    if (sure) disconnect.mutate({ clientId: agent.clientId });
  }

  return (
    <Section title={m.account_agents_title()} footer={m.account_agents_hint()}>
      {agents.map((agent) => (
        <SwipeRow
          key={agent.clientId}
          actionLabel={m.account_agent_disconnect()}
          onAction={() => void ask(agent)}
        >
          <Row
            icon={SparkleIcon}
            title={agent.name ?? m.connect_client_unnamed()}
            description={describe(agent)}
            onPress={() => void ask(agent)}
            chevron={false}
            disabled={disconnect.isPending && disconnect.variables?.clientId === agent.clientId}
            accessibilityHint={m.account_agent_disconnect()}
          />
        </SwipeRow>
      ))}
    </Section>
  );
}
