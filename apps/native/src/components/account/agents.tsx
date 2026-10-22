import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { View } from "react-native";

import { Button } from "@/components/ui/button";
import { feel } from "@/components/ui/haptics";
import { Section } from "@/components/ui/list";
import { Text } from "@/components/ui/text";
import { useTell } from "@/components/ui/toast";
import { useAccount } from "@/lib/account";
import { useTheme } from "@/lib/theme";
import { m } from "@/paraglide/messages";
import { orpc } from "@/utils/orpc";

/**
 * The assistants the account signed in to read it (decision 047), as the web's `AccountPanel`
 * lists them: what they are over the list, then each by its name with what disconnects it at
 * once. Nothing when there is none: an account connects one from the assistant itself, which
 * `/connect` on the web answers.
 */
export function AgentsSection() {
  const { space } = useTheme();
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

  return (
    <Section plain title={m.account_agents_title()} lead={m.account_agents_hint()}>
      <View style={{ gap: space.xs }}>
        {agents.map((agent) => {
          const name = agent.name ?? m.connect_client_unnamed();
          return (
            <View
              key={agent.clientId}
              style={{
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "space-between",
                gap: space.s,
              }}
            >
              <Text numberOfLines={1} style={{ flexShrink: 1 }}>
                {name}
              </Text>
              <Button
                variant="outline"
                disabled={disconnect.isPending && disconnect.variables?.clientId === agent.clientId}
                onPress={() => disconnect.mutate({ clientId: agent.clientId })}
                accessibilityHint={name}
              >
                {m.account_agent_disconnect()}
              </Button>
            </View>
          );
        })}
      </View>
    </Section>
  );
}
