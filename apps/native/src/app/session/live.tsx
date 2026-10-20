import type { SessionPlace } from "@repo/client/sessions/types";
import { APP_NAME } from "@repo/config/app";
import { LogbookIcon, PinIcon, WaveIcon } from "@repo/ui/icon";
import { router, useLocalSearchParams } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { Platform, ScrollView, View } from "react-native";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { type SessionWind, sessionShown } from "@/activities/session-shown";
import { sessionWriting } from "@/activities/writing";
import { Bearing } from "@/components/forecast/bearing";
import { confirmDestructive } from "@/components/saved/confirm";
import {
  type LiveSession,
  type LiveState,
  elapsedOf,
  liveMinutes,
} from "@/components/sessions/live-logic";
import { PlacePicker } from "@/components/sessions/place-picker";
import { StepHeader } from "@/components/sessions/session-form";
import { dayWords, placeOfParam } from "@/components/sessions/session-logic";
import { usePlaceKnown } from "@/components/sessions/session-place";
import { useNearestPlace } from "@/components/sessions/use-nearest";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Row, Section } from "@/components/ui/list";
import { TARGET } from "@/components/ui/metrics";
import { Loading, Skeleton } from "@/components/ui/skeleton";
import { Text } from "@/components/ui/text";
import { useAccount } from "@/lib/account";
import { formatClock, formatDuration } from "@/lib/format";
import {
  endLiveSession,
  forgetLiveSession,
  liveFormQuery,
  liveStateNow,
  moveLiveSession,
  startLiveSession,
  useLiveSession,
} from "@/lib/live-session";
import { useRecents } from "@/lib/recents";
import { useTheme } from "@/lib/theme";
import { m } from "@/paraglide/messages";

// A session timed while it lasts: decision 074, "A session in progress". This screen starts one,
// shows the one that runs, and ends it, which opens the session's form. It is opened by the "+"
// (its choice "Now"), by the widget of a place, `?place=<break|spot>:<id>`, by the quick action,
// `?place=last` for the place looked at last (decision 042), by the session's Live Activity or
// its notification, `?end=1` to end it, and by the app as it starts, for a session that was never
// ended or never written.

type Params = {
  // Where it is: `<break|spot>:<id>`, or `last` for the place looked at last.
  place?: string;
  name?: string;
  // Set by the activity's or the notification's "End".
  end?: string;
};

const SECOND_MS = 1000;

/** The time, read each second while a session runs on screen. */
function useSecond(running: boolean) {
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    if (!running) return;
    const timer = setInterval(() => setNow(Date.now()), SECOND_MS);
    return () => clearInterval(timer);
  }, [running]);
  return now;
}

/** What the session is now: running, ended or never ended, read again when it changes. */
function useLiveState(session: LiveSession | null) {
  const [state, setState] = useState<LiveState | null>(null);
  useEffect(() => {
    let isLive = true;
    void liveStateNow().then((read) => {
      if (isLive) setState(read);
    });
    return () => {
      isLive = false;
    };
  }, [session]);
  return session ? state : null;
}

/** Where the sheet that signs in goes on to: this screen, with the place it was opened at. */
function liveNext(place: string | undefined, name: string | undefined) {
  const query = [
    place ? `place=${encodeURIComponent(place)}` : null,
    place && name ? `name=${encodeURIComponent(name)}` : null,
  ].filter((part) => part !== null);
  return query.length > 0 ? `/session/live?${query.join("&")}` : "/session/live";
}

/** Leaves the screen: back, or to the map when a link opened it with nothing under it. */
function leave() {
  if (router.canGoBack()) router.back();
  else router.replace("/");
}

/** Opens the form of the session kept, in this screen's place. */
function openForm() {
  const query = liveFormQuery();
  if (query) router.replace({ pathname: "/session/new", params: query });
}

async function askToForget() {
  const sure = await confirmDestructive({
    title: m.native_live_forget_title(),
    message: m.native_live_forget_message(),
    confirm: m.native_live_forget(),
  });
  if (!sure) return;
  await forgetLiveSession();
  leave();
}

function Header({ title }: { title: string }) {
  return <StepHeader title={title} backLabel={m.action_close()} onBack={leave} />;
}

/**
 * The wind measured as the session began, a line of the list: where it comes from as everywhere
 * in the app, with `Bearing`, and the line as it is said to a screen reader.
 */
function WindRow({ wind }: { wind: SessionWind }) {
  const { space } = useTheme();
  return (
    <View
      accessible
      accessibilityLabel={wind.spoken}
      style={{
        minHeight: TARGET,
        flexDirection: "row",
        flexWrap: "wrap",
        alignItems: "center",
        paddingHorizontal: space.m,
        paddingVertical: space.xs,
      }}
    >
      <Text style={wind.bearing ? { marginRight: space.xxs } : undefined}>{wind.before}</Text>
      {wind.bearing ? <Bearing degrees={wind.bearing.from} size="m" /> : null}
      {wind.after ? <Text>{wind.after}</Text> : null}
    </View>
  );
}

/** A session that runs: where, the time since its start, what the sea did then, and its end. */
function Running({ session, asked }: { session: LiveSession; asked: SessionPlace | null }) {
  const { colors, space } = useTheme();
  const insets = useSafeAreaInsets();
  const now = useSecond(true);
  const [isEnding, setEnding] = useState(false);
  const [isMoving, setMoving] = useState(false);
  const shown = sessionShown(session, sessionWriting());
  const elsewhere =
    asked && (asked.kind !== session.place.kind || asked.id !== session.place.id) ? asked : null;

  if (isMoving) {
    return (
      <View style={{ flex: 1, backgroundColor: colors["neutral-1"] }}>
        <StepHeader title={m.native_live_where()} onBack={() => setMoving(false)} />
        <KeyboardAwareScrollView
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{ padding: space.m, paddingBottom: insets.bottom + space.xl }}
        >
          <PlacePicker
            onPick={(place) => {
              setMoving(false);
              void moveLiveSession(place);
            }}
          />
        </KeyboardAwareScrollView>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors["neutral-1"] }}>
      <Header title={m.native_live_title()} />
      <ScrollView
        contentContainerStyle={{
          gap: space.l,
          padding: space.m,
          paddingBottom: insets.bottom + space.xl,
        }}
      >
        {elsewhere ? (
          <Text tone="muted">{m.native_live_other({ place: session.place.name })}</Text>
        ) : null}
        <Section>
          <Row
            icon={session.place.kind === "spot" ? PinIcon : WaveIcon}
            title={session.place.name}
            accessibilityHint={m.native_session_place_change()}
            onPress={() => setMoving(true)}
          />
        </Section>
        <View style={{ alignItems: "center", gap: space.xs }}>
          <Text
            size="xxl"
            weight="medium"
            numeric
            accessibilityRole="timer"
            accessibilityLabel={formatDuration(Math.floor((now - session.startedAt) / 60_000))}
          >
            {elapsedOf(session.startedAt, now)}
          </Text>
          <Text tone="muted">{shown.since}</Text>
        </View>
        {/* The sea, once `places.now` answered, which it may never do. */}
        {session.figures ? (
          <Section title={m.native_live_sea_at_start()}>
            {shown.lines.map((line) => (
              <Row key={line} title={line} chevron={false} />
            ))}
            {shown.wind ? <WindRow key="wind" wind={shown.wind} /> : null}
            {shown.lines.length === 0 && !shown.wind ? (
              <Row title={m.native_live_nothing()} chevron={false} />
            ) : null}
          </Section>
        ) : null}
        {/* Once the phone said it could not show the session, and not while it is asked. */}
        {session.shown === false ? (
          <Text size="s" tone="muted">
            {Platform.OS === "ios"
              ? m.native_live_hidden_ios({ name: APP_NAME })
              : m.native_live_hidden_android({ name: APP_NAME })}
          </Text>
        ) : null}
        <View style={{ gap: space.s }}>
          <Button
            loading={isEnding}
            onPress={() => {
              setEnding(true);
              void endLiveSession().then(openForm);
            }}
          >
            {m.native_live_end_write()}
          </Button>
          <Button variant="ghost" onPress={() => void askToForget()}>
            {m.native_live_forget()}
          </Button>
        </View>
      </ScrollView>
    </View>
  );
}

/** A session that ended and was not written, or that was never ended: offered to be written. */
function Unwritten({ session, state }: { session: LiveSession; state: "ended" | "unended" }) {
  const { colors, space } = useTheme();
  const insets = useSafeAreaInsets();
  const [now] = useState(Date.now);
  const start = new Date(session.startedAt);
  return (
    <View style={{ flex: 1, backgroundColor: colors["neutral-1"] }}>
      <Header
        title={state === "ended" ? m.native_live_ended_title() : m.native_live_unended_title()}
      />
      <ScrollView
        contentContainerStyle={{
          gap: space.l,
          padding: space.m,
          paddingBottom: insets.bottom + space.xl,
        }}
      >
        <Text tone="muted">
          {state === "ended" ? m.native_live_ended() : m.native_live_unended()}
        </Text>
        <Section>
          <Row
            icon={session.place.kind === "spot" ? PinIcon : WaveIcon}
            title={session.place.name}
            chevron={false}
          />
          <Row
            title={m.session_when()}
            value={`${dayWords(start, now)} ${formatClock(start)}`}
            chevron={false}
          />
          {session.endedAt === undefined ? null : (
            <Row
              title={m.session_duration()}
              value={formatDuration(liveMinutes(session.startedAt, session.endedAt))}
              chevron={false}
            />
          )}
        </Section>
        <View style={{ gap: space.s }}>
          <Button onPress={openForm}>{m.native_live_write()}</Button>
          <Button variant="ghost" onPress={() => void askToForget()}>
            {m.native_live_forget()}
          </Button>
        </View>
      </ScrollView>
    </View>
  );
}

/** Where a session that begins now is: the place the phone stands near, or asked. */
function Where({ onPick }: { onPick: (place: SessionPlace) => void }) {
  const { colors, space } = useTheme();
  const insets = useSafeAreaInsets();
  const nearest = useNearestPlace(true);
  const [isAsking, setAsking] = useState(false);

  if (!nearest.settled) {
    return (
      <View style={{ flex: 1, backgroundColor: colors["neutral-1"] }}>
        <Header title={m.native_live_title()} />
        <Loading>
          <View style={{ gap: space.l, padding: space.m }}>
            <Skeleton height={56} />
            <Skeleton height={48} />
          </View>
        </Loading>
      </View>
    );
  }

  const near = nearest.place;
  if (near && !isAsking) {
    return (
      <View style={{ flex: 1, backgroundColor: colors["neutral-1"] }}>
        <Header title={m.native_live_title()} />
        <View style={{ gap: space.l, padding: space.m, paddingBottom: insets.bottom + space.xl }}>
          <Section>
            <Row
              icon={near.kind === "spot" ? PinIcon : WaveIcon}
              title={near.name}
              description={m.native_session_place_near()}
              accessibilityHint={m.native_session_place_change()}
              onPress={() => setAsking(true)}
            />
          </Section>
          <Button onPress={() => onPick({ kind: near.kind, id: near.id, name: near.name })}>
            {m.native_live_start()}
          </Button>
        </View>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors["neutral-1"] }}>
      <StepHeader
        title={m.native_live_where()}
        backLabel={near ? undefined : m.action_cancel()}
        onBack={near ? () => setAsking(false) : leave}
      />
      <KeyboardAwareScrollView
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ padding: space.m, paddingBottom: insets.bottom + space.xl }}
      >
        <PlacePicker near={nearest.phone} onPick={onPick} />
      </KeyboardAwareScrollView>
    </View>
  );
}

/** The place a route names, as a session takes it: given, the place looked at last, or none. */
function useAskedPlace(param: string | undefined, name: string | undefined) {
  const recents = useRecents();
  const last = recents.find((recent) => recent.kind === "break" || recent.kind === "spot");
  const given = param === "last" ? null : placeOfParam(param);
  const known = usePlaceKnown(given, name);
  if (param === "last") {
    return last && (last.kind === "break" || last.kind === "spot")
      ? { kind: last.kind, id: last.id, name: last.name }
      : null;
  }
  // A place the API does not answer, a spot that is not the account's, is asked for instead.
  if (!given || known.isMissing) return null;
  return known.name ? { ...given, name: known.name } : "naming";
}

export default function LiveSessionScreen() {
  const params = useLocalSearchParams<Params>();
  const { colors } = useTheme();
  const { signedIn, pending } = useAccount();
  const session = useLiveSession();
  const state = useLiveState(session);
  const asked = useAskedPlace(params.place, params.name);
  const ending = params.end === "1";
  const [isStarting, setStarting] = useState(false);
  const started = useRef(false);
  const ended = useRef(false);

  // "End", from the activity or the notification: the session ends, and its form opens, once.
  useEffect(() => {
    if (!ending || !session || ended.current) return;
    ended.current = true;
    void endLiveSession().then(openForm);
  }, [ending, session]);

  const start = (place: SessionPlace) => {
    if (started.current) return;
    started.current = true;
    setStarting(true);
    void startLiveSession(place).finally(() => setStarting(false));
  };

  // A place the route names, from a widget or the quick action, starts the session at once.
  const named = asked !== null && asked !== "naming" ? asked : null;
  useEffect(() => {
    if (!signedIn || ending || session || !named) return;
    start(named);
  }, [signedIn, ending, session, named]);

  if (!signedIn) {
    return (
      <View style={{ flex: 1, backgroundColor: colors["neutral-1"] }}>
        <Header title={m.native_live_title()} />
        {pending ? null : (
          <EmptyState
            icon={LogbookIcon}
            title={m.auth_reason_add_session()}
            description={m.session_sign_in_prompt()}
            action={{
              label: m.auth_sign_in(),
              onPress: () =>
                router.replace({
                  pathname: "/sign-in",
                  params: {
                    reason: m.auth_reason_add_session(),
                    // On to the session at the place the widget or the quick action named.
                    next: liveNext(params.place, params.name),
                  },
                }),
            }}
          />
        )}
      </View>
    );
  }

  if (session) {
    if (ending || state === null) {
      return <View style={{ flex: 1, backgroundColor: colors["neutral-1"] }} />;
    }
    if (state === "running") {
      return <Running session={session} asked={named} />;
    }
    return <Unwritten session={session} state={state} />;
  }

  if (ending) {
    return (
      <View style={{ flex: 1, backgroundColor: colors["neutral-1"] }}>
        <Header title={m.native_live_title()} />
        <EmptyState icon={LogbookIcon} title={m.native_live_none()} />
      </View>
    );
  }

  if (isStarting || asked === "naming" || named) {
    return (
      <View style={{ flex: 1, backgroundColor: colors["neutral-1"] }}>
        <Header title={m.native_live_title()} />
        <EmptyState icon={LogbookIcon} title={m.native_live_starting()} />
      </View>
    );
  }

  return <Where onPick={start} />;
}
