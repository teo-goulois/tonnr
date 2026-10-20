import type { Session } from "@repo/client/viewer/types";
import { likedConditions, LIKED_FROM, LIKED_SESSIONS } from "@repo/conditions/sessions/liked";
import { BellIcon, LogbookIcon, PlusIcon } from "@repo/ui/icon";
import { useQueryClient } from "@tanstack/react-query";
import { router } from "expo-router";
import { Fragment, useMemo, useState } from "react";
import { RefreshControl, ScrollView, View } from "react-native";

import { ConditionsSummary } from "@/components/sessions/liked-conditions";
import { placeParam, usePlaceKnown } from "@/components/sessions/session-place";
import { SessionRow } from "@/components/sessions/session-row";
import { useSessionsAt, useSessionWrites } from "@/components/sessions/use-sessions";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { Separator } from "@/components/ui/separator";
import { Loading, Skeleton, SkeletonText } from "@/components/ui/skeleton";
import { Surface } from "@/components/ui/surface";
import { Text } from "@/components/ui/text";
import { useAccount } from "@/lib/account";
import { useRequireAccount } from "@/lib/require-account";
import { useTheme } from "@/lib/theme";
import { m } from "@/paraglide/messages";
import { orpc } from "@/utils/orpc";

export type PlaceTabProps = { kind: "break" | "station" | "spot"; id: string };

type SessionAt = { kind: "break" | "spot"; id: string };

/**
 * What the account likes at the place: the conditions its best sessions there had in common, said
 * as an alert says its own, with what begins an alert of them; or how many more it takes.
 */
function Liked({
  place,
  name,
  sessions,
}: {
  place: SessionAt;
  name: string | undefined;
  sessions: readonly Session[];
}) {
  const { space } = useTheme();
  const liked = useMemo(() => likedConditions([...sessions]), [sessions]);
  const missing = LIKED_SESSIONS - liked.liked;
  const { criteria } = liked;

  return (
    <Surface style={{ gap: space.xs, padding: space.m }}>
      <Text weight="medium" accessibilityRole="header">
        {m.sessions_liked_title()}
      </Text>
      {criteria ? (
        <>
          <ConditionsSummary criteria={criteria} />
          <Text size="xs" tone="muted">
            {m.sessions_liked_from({ count: liked.liked, rating: LIKED_FROM })}
          </Text>
          {/* An alert of what was liked there, named after the place, to be looked over before
              it is saved: the alert's sheet reads the conditions and the name it is given. */}
          <Button
            variant="secondary"
            icon={BellIcon}
            disabled={!name}
            onPress={() =>
              router.push({
                pathname: "/alert/new",
                params: {
                  place: placeParam(place),
                  name: m.sessions_liked_alert_name({ spot: name ?? "" }),
                  criteria: JSON.stringify(criteria),
                },
              })
            }
            style={{ alignSelf: "flex-start", marginTop: space.xxs }}
          >
            {m.sessions_liked_alert()}
          </Button>
        </>
      ) : (
        <Text size="s" tone="muted">
          {missing > 0
            ? missing === 1
              ? m.sessions_liked_missing_one({ rating: LIKED_FROM })
              : m.sessions_liked_missing({ count: missing, rating: LIKED_FROM })
            : m.sessions_liked_unread()}
        </Text>
      )}
    </Surface>
  );
}

/** The sessions surfed at a break or at a spot of the account's own. */
function PlaceSessions({ place }: { place: SessionAt }) {
  const { colors, space } = useTheme();
  const queryClient = useQueryClient();
  const { signedIn, pending } = useAccount();
  const requireAccount = useRequireAccount();
  const known = usePlaceKnown(place);
  const { here, media } = useSessionsAt(place);
  const writes = useSessionWrites();
  const [now, setNow] = useState(Date.now);
  const [isRefreshing, setIsRefreshing] = useState(false);

  async function refresh() {
    setIsRefreshing(true);
    setNow(Date.now());
    await Promise.all([
      here.refetch(),
      queryClient.invalidateQueries({ queryKey: orpc.v1.media.sessions.key() }),
    ]).finally(() => setIsRefreshing(false));
  }

  const add = () =>
    requireAccount(m.auth_reason_add_session(), () =>
      router.push({
        pathname: "/session/new",
        params: { place: placeParam(place), ...(known.name && { name: known.name }) },
      }),
    );

  if (!signedIn) {
    return pending ? null : (
      <EmptyState
        icon={LogbookIcon}
        title={m.auth_reason_add_session()}
        description={m.session_sign_in_prompt()}
        action={{ label: m.auth_sign_in(), onPress: add }}
      />
    );
  }
  // A spot that is another's, in a list shared with the account, takes no session of it.
  if (place.kind === "spot" && known.isMissing) return null;

  const sessions = here.data;
  return (
    <ScrollView
      style={{ flex: 1 }}
      nestedScrollEnabled
      contentContainerStyle={{ gap: space.l, padding: space.m, paddingBottom: space.xxl }}
      refreshControl={
        <RefreshControl
          refreshing={isRefreshing}
          onRefresh={() => void refresh()}
          tintColor={colors["neutral-7"]}
        />
      }
    >
      {here.isError ? (
        <ErrorState
          title={m.sessions_load_failed()}
          onRetry={() => void here.refetch()}
          retrying={here.isFetching}
        />
      ) : !sessions ? (
        <Loading>
          <View style={{ gap: space.m }}>
            <Skeleton height={112} />
            <SkeletonText lines={2} />
          </View>
        </Loading>
      ) : (
        <>
          {sessions.length === 0 ? (
            <Text tone="muted">{m.sessions_here_empty()}</Text>
          ) : (
            <Liked place={place} name={known.name} sessions={sessions} />
          )}
          <Button
            variant="secondary"
            icon={PlusIcon}
            onPress={add}
            style={{ alignSelf: "flex-start" }}
          >
            {m.session_add()}
          </Button>
          {sessions.length > 0 ? (
            <Surface insetEdge style={{ overflow: "hidden" }}>
              {sessions.map((session, index) => (
                <Fragment key={session.id}>
                  {index > 0 ? <Separator inset={space.m} /> : null}
                  <SessionRow
                    session={session}
                    now={now}
                    media={media[session.id]}
                    onDelete={(gone) => void writes.remove(gone)}
                  />
                </Fragment>
              ))}
            </Surface>
          ) : null}
        </>
      )}
    </ScrollView>
  );
}

/**
 * The sessions the account surfed at a place, the latest first, and what it likes there: the
 * conditions its best sessions had in common, said as an alert's are, with what begins an alert
 * of them, and what logs a session there. A station takes no session. The web's `PlaceSessions`
 * shows the same. Decision 043.
 */
export function SessionsTab({ kind, id }: PlaceTabProps) {
  if (kind === "station") return null;
  return <PlaceSessions key={`${kind}:${id}`} place={{ kind, id }} />;
}
