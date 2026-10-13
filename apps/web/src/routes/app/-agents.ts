import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import type { ConnectedAgents } from "@/components/viewer/types";
import { orpc } from "@/utils/orpc";

/**
 * The assistants the account signed in to read it through the MCP server: the account's panel
 * lists them, and disconnects one.
 */
export function useAgents(account: string | undefined): ConnectedAgents {
  const queryClient = useQueryClient();
  const listed = useQuery(
    orpc.v1.agents.list.queryOptions({
      enabled: account !== undefined,
      // An API from before the assistants answers with an error: the panel then lists none.
      retry: false,
      meta: { quiet: true },
    }),
  );
  const disconnect = useMutation(
    orpc.v1.agents.disconnect.mutationOptions({
      onSettled: () => queryClient.invalidateQueries({ queryKey: orpc.v1.agents.list.key() }),
    }),
  );

  return {
    list: account === undefined ? undefined : listed.data?.agents,
    disconnecting: disconnect.isPending ? disconnect.variables.clientId : undefined,
    onDisconnect: (clientId) => disconnect.mutate({ clientId }),
  };
}
