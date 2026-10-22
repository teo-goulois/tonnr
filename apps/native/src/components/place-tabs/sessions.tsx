import type { Session } from "@repo/client/viewer/types";
import { likedConditions, LIKED_FROM, LIKED_SESSIONS } from "@repo/conditions/sessions/liked";
import { PlusIcon } from "@repo/ui/icon";
import { useQueryClient } from "@tanstack/react-query";
import { router } from "expo-router";
import { useMemo, useState } from "react";
import { RefreshControl, ScrollView, View } from "react-native";

import { keepCopy } from "@/components/alerts/copies";
import { ConditionsSummary } from "@/components/sessions/liked-conditions";
import { placeParam, usePlaceKnown } from "@/components/sessions/session-place";
import { SessionRow } from "@/components/sessions/session-row";
import { useSessionsAt, useSessionWrites } from "@/components/sessions/use-sessions";
import { Button } from "@/components/ui/button";
import { edge } from "@/components/ui/edge";
import { Text } from "@/components/ui/text";
import { useAccount } from "@/lib/account";
import { useRequireAccount } from "@/lib/require-account";
import { useTheme } from "@/lib/theme";
import { useNow } from "@/lib/use-now";
import { m } from "@/paraglide/messages";
import { orpc } from "@/utils/orpc";

import { LinesLoading, TabFailure } from "./tab-states";
import { AccountPrompt } from "@/components/auth/account-prompt";

export type PlaceTabProps = { kind: "break" | "station" | "spot"; id: string };

type SessionAt = { kind: "break" | "spot"; id: string };
type KnownPlace = ReturnType<typeof usePlaceKnown>;

/**
 * What the account likes at the place: the conditions its best sessions there had in common, said
 * as an alert says its own, with what begins an alert of them; or how many more it takes.
 */
function Liked({
  place,
  known,
  sessions,
}: {
  place: SessionAt;
  known: KnownPlace["point"];
  sessions: readonly Session[];
}) {
  const { colors, space, radius } = useTheme();
  const liked = useMemo(() => likedConditions([...sessions]), [sessions]);
  const missing = LIKED_SESSIONS - liked.liked;
  const { criteria } = liked;

  return (
    // The web's edged box: a fine line of the theme's grey with no ground, at the radius of its
    // buttons.
    <View
      style={[
        edge(colors["neutral-4"]),
        { gap: space.xs, padding: space.s, borderRadius: radius.s, borderCurve: "continuous" },
      ]}
    >
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
              it is saved: the alert's sheet begins from it as from a copy, as the web's viewer
              hands its editor the same draft. */}
          <Button
            variant="secondary"
            disabled={!known}
            onPress={() => {
              if (!known) return;
              const key = keepCopy({
                draft: {
                  name: m.sessions_liked_alert_name({ spot: known.name }),
                  criteria,
                  enabled: true,
                  shortestMinutes: 120,
                  spotIds: place.kind === "spot" ? [place.id] : [],
                  breakIds: place.kind === "break" ? [place.id] : [],
                },
                places: [{ ...place, ...known }],
              });
              router.push({ pathname: "/alert/new", params: { copy: key } });
            }}
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
    </View>
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
  // The screens' one clock, read again each minute as the web's route reads its own, and not only
  // as the tab is pulled: a tab once seen stays drawn.
  const now = useNow();
  const [isRefreshing, setIsRefreshing] = useState(false);

  async function refresh() {
    setIsRefreshing(true);
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
      <ScrollView
        style={{ flex: 1 }}
        nestedScrollEnabled
        contentContainerStyle={{ padding: space.m, paddingBottom: space.xxl }}
      >
        <AccountPrompt text={m.session_sign_in_prompt()} />
      </ScrollView>
    );
  }
  // A spot that is another's, in a list shared with the account, takes no session of it.
  if (place.kind === "spot" && known.isMissing) return null;

  const sessions = here.data;
  return (
    <ScrollView
      style={{ flex: 1 }}
      nestedScrollEnabled
      contentContainerStyle={{ gap: space.m, padding: space.m, paddingBottom: space.xxl }}
      refreshControl={
        <RefreshControl
          refreshing={isRefreshing}
          onRefresh={() => void refresh()}
          tintColor={colors["neutral-7"]}
        />
      }
    >
      {/* As the web's panel: what failed in a line, with no retry, since the tab is pulled to be
          read again, and two lines to come while it loads. */}
      {here.isError ? (
        <TabFailure text={m.sessions_load_failed()} />
      ) : !sessions ? (
        <LinesLoading />
      ) : (
        <>
          {sessions.length === 0 ? (
            <Text tone="muted">{m.sessions_here_empty()}</Text>
          ) : (
            <Liked place={place} known={known.point} sessions={sessions} />
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
            // The web's plain rows, a small step apart with no line between them, which run a
            // small step past the panel so that their words line up with the rest.
            <View style={{ gap: space.xxs, marginHorizontal: -space.xs }}>
              {sessions.map((session) => (
                <SessionRow
                  key={session.id}
                  session={session}
                  now={now}
                  media={media[session.id]}
                  onDelete={(gone) => void writes.remove(gone)}
                  plain
                />
              ))}
            </View>
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
