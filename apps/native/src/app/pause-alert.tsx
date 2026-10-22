import { useMutation, useQueryClient } from "@tanstack/react-query";
import { router, useLocalSearchParams } from "expo-router";
import { useEffect } from "react";
import { View } from "react-native";

import { endWindowActivitiesOf } from "@/activities/window-activity";
import { Button } from "@/components/ui/button";
import { Loading, Skeleton } from "@/components/ui/skeleton";
import { Text } from "@/components/ui/text";
import { useTheme } from "@/lib/theme";
import { m } from "@/paraglide/messages";
import { orpc } from "@/utils/orpc";

/**
 * What "Not today" on a push, or on the Live Activity of a window, does when the app opens for
 * it: pauses that alert until the end of the account's day, no later than the day the push spoke
 * of, and says what came of it. Decisions 072 and 074.
 */
export default function PauseAlert() {
  const { alert, until } = useLocalSearchParams<{ alert?: string; until?: string }>();
  const { type } = useTheme();
  const queryClient = useQueryClient();
  const pause = useMutation(orpc.v1.alerts.pauseToday.mutationOptions());
  const { mutate } = pause;

  useEffect(() => {
    if (!alert || !until) return;
    mutate(
      { id: alert, until: new Date(until) },
      {
        onSuccess: (saved) => {
          // The alerts' list says it is paused, which it goes back to.
          queryClient.setQueryData(orpc.v1.alerts.list.queryKey(), (answer) =>
            answer
              ? { alerts: answer.alerts.map((one) => (one.id === saved.id ? saved : one)) }
              : answer,
          );
          // The Live Activity of the alert's window goes from the phone at once: the worker
          // would end it at its next pass (decision 074).
          void endWindowActivitiesOf(alert).catch(() => {});
        },
      },
    );
  }, [alert, until, mutate, queryClient]);

  const over = pause.error && "status" in pause.error && pause.error.status === 409;
  const said = pause.isSuccess
    ? m.native_pause_done()
    : over
      ? m.native_pause_over()
      : pause.isError || !alert || !until
        ? m.native_pause_failed()
        : null;

  return (
    <View className="gap-m bg-background p-l">
      <Text size="l" weight="medium">
        {m.native_pause_title()}
      </Text>
      {said === null ? (
        <Loading>
          <Skeleton width="80%" height={type.m.line} />
        </Loading>
      ) : (
        <Text tone="muted">{said}</Text>
      )}
      <Button variant="secondary" onPress={() => router.replace("/alerts")}>
        {m.native_pause_back()}
      </Button>
    </View>
  );
}
