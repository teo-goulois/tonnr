import type { SessionPlace } from "@repo/client/sessions/types";
import { APP_NAME } from "@repo/config/app";
import { router, useLocalSearchParams } from "expo-router";
import { type ReactNode, useEffect, useRef, useState } from "react";
import { BackHandler, Platform, ScrollView, View } from "react-native";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { sessionShown } from "@/activities/session-shown";
import { sessionWriting } from "@/activities/writing";
import { AccountPrompt } from "@/components/auth/account-prompt";
import { confirmDestructive } from "@/components/saved/confirm";
import {
  type LiveSession,
  type LiveState,
  elapsedOf,
  liveMinutes,
} from "@/components/sessions/live-logic";
import { FigureLine, LiveSea } from "@/components/sessions/live-sea";
import { PlacePicker } from "@/components/sessions/place-picker";
import { dayWords, placeOfParam } from "@/components/sessions/session-logic";
import { usePlaceKnown } from "@/components/sessions/session-place";
import { useNearestPlace } from "@/components/sessions/use-nearest";
import { Button } from "@/components/ui/button";
import { Row, Section } from "@/components/ui/list";
import { PanelHeader, SheetRoot } from "@/components/ui/sheet";
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
// (its choice "Now"), by an address that names a place, `?place=<break|spot>:<id>`, or
// `?place=last` for the place looked at last (decision 042), which no widget or quick action
// opens yet, by the session's Live Activity or its notification, `?end=1` to end it, and by the
// app as it starts, for a session that was never ended or never written. The web has no such
// screen: it is drawn as the web's sheets are (`ViewerDrawer`), its head with the title at the
// start and the cross, a chevron back where there is a step to go back to, and rows on its ground.

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

/**
 * A step of the screen: the sheet's head, then what it holds under it, which `SheetRoot` keeps
 * where the sheet lays it out when it scrolls. Android's back takes an `inner` step back to the
 * one it was opened from, as its chevron does, and as the form's step that asks where does.
 */
function Step({
  title,
  description,
  onBack,
  inner = false,
  children,
}: {
  title: string;
  description?: string | undefined;
  onBack?: (() => void) | undefined;
  inner?: boolean;
  children?: ReactNode;
}) {
  const { colors } = useTheme();
  useEffect(() => {
    if (!inner || !onBack) return;
    const listener = BackHandler.addEventListener("hardwareBackPress", () => {
      onBack();
      return true;
    });
    return () => listener.remove();
  }, [inner, onBack]);
  return (
    <SheetRoot style={{ flex: 1, backgroundColor: colors["neutral-1"] }}>
      <PanelHeader title={title} description={description} onBack={onBack} onClose={leave} />
      {children}
    </SheetRoot>
  );
}

/** What stands under the head while a session starts, ends, or is read: its time and its sea. */
function LiveSkeleton({ label }: { label?: string }) {
  const { space, type } = useTheme();
  return (
    <Loading {...(label !== undefined && { label })}>
      <View style={{ gap: space.l, padding: space.m }}>
        <View style={{ alignItems: "center", gap: space.xs }}>
          <Skeleton height={type.xxl.line} width="50%" />
          <Skeleton height={type.m.size} width="30%" />
        </View>
        <View style={{ gap: space.s }}>
          <Skeleton height={type.m.size} width="45%" />
          <Skeleton height={type.s.size} />
          <Skeleton height={type.s.size} />
          <Skeleton height={type.s.size} width="60%" />
        </View>
      </View>
    </Loading>
  );
}

/** A session that runs: where, the time since its start, what the sea did then, and its end. */
function Running({ session, asked }: { session: LiveSession; asked: SessionPlace | null }) {
  const { space } = useTheme();
  const insets = useSafeAreaInsets();
  const now = useSecond(true);
  const [isEnding, setEnding] = useState(false);
  const [isMoving, setMoving] = useState(false);
  const shown = sessionShown(session, sessionWriting());
  const elsewhere =
    asked && (asked.kind !== session.place.kind || asked.id !== session.place.id) ? asked : null;

  if (isMoving) {
    return (
      <Step title={m.native_live_where()} onBack={() => setMoving(false)} inner>
        <KeyboardAwareScrollView
          style={{ flex: 1 }}
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
      </Step>
    );
  }

  // The place is said under the title, as the web's sheet of a new session says it, and chosen
  // again by the chevron back, as there.
  return (
    <Step
      title={m.native_live_title()}
      description={session.place.name}
      onBack={() => setMoving(true)}
    >
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{
          gap: space.l,
          padding: space.m,
          paddingBottom: insets.bottom + space.xl,
        }}
      >
        {elsewhere ? (
          <Text tone="muted">{m.native_live_other({ place: session.place.name })}</Text>
        ) : null}
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
        {session.figures ? <LiveSea figures={session.figures} /> : null}
        {/* Once the phone said it could not show the session, and not while it is asked. */}
        {session.shown === false ? (
          <Text size="s" tone="muted">
            {Platform.OS === "ios"
              ? m.native_live_hidden_ios({ name: APP_NAME })
              : m.native_live_hidden_android({ name: APP_NAME })}
          </Text>
        ) : null}
        <View style={{ gap: space.xs }}>
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
    </Step>
  );
}

/** A session that ended and was not written, or that was never ended: offered to be written. */
function Unwritten({ session, state }: { session: LiveSession; state: "ended" | "unended" }) {
  const { space } = useTheme();
  const insets = useSafeAreaInsets();
  const [now] = useState(Date.now);
  const start = new Date(session.startedAt);
  return (
    <Step
      title={state === "ended" ? m.native_live_ended_title() : m.native_live_unended_title()}
      description={session.place.name}
    >
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{
          gap: space.l,
          padding: space.m,
          paddingBottom: insets.bottom + space.xl,
        }}
      >
        <Text tone="muted">
          {state === "ended" ? m.native_live_ended() : m.native_live_unended()}
        </Text>
        <View>
          <FigureLine
            name={m.session_when()}
            parts={[{ text: `${dayWords(start, now)} ${formatClock(start)}` }]}
          />
          {session.endedAt === undefined ? null : (
            <FigureLine
              name={m.session_duration()}
              parts={[{ text: formatDuration(liveMinutes(session.startedAt, session.endedAt)) }]}
            />
          )}
        </View>
        <View style={{ gap: space.xs }}>
          <Button onPress={openForm}>{m.native_live_write()}</Button>
          <Button variant="ghost" onPress={() => void askToForget()}>
            {m.native_live_forget()}
          </Button>
        </View>
      </ScrollView>
    </Step>
  );
}

/** Where a session that begins now is: the place the phone stands near, or asked. */
function Where({ onPick }: { onPick: (place: SessionPlace) => void }) {
  const { space, type } = useTheme();
  const insets = useSafeAreaInsets();
  const nearest = useNearestPlace(true);
  const [isAsking, setAsking] = useState(false);

  if (!nearest.settled) {
    return (
      <Step title={m.native_live_title()}>
        <Loading>
          <View style={{ gap: space.l, padding: space.m }}>
            <View style={{ gap: space.xxs }}>
              <Skeleton height={type.m.size} width="60%" />
              <Skeleton height={type.s.size} width="35%" />
            </View>
            <Skeleton height={type.m.line + 2 * space.xs} corner="s" />
          </View>
        </Loading>
      </Step>
    );
  }

  const near = nearest.place;
  if (near && !isAsking) {
    return (
      <Step title={m.native_live_title()}>
        <View style={{ gap: space.l, padding: space.m, paddingBottom: insets.bottom + space.xl }}>
          <Section plain>
            <Row
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
      </Step>
    );
  }

  return (
    <Step title={m.native_live_where()} onBack={near ? () => setAsking(false) : undefined} inner>
      <KeyboardAwareScrollView
        style={{ flex: 1 }}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ padding: space.m, paddingBottom: insets.bottom + space.xl }}
      >
        <PlacePicker near={nearest.phone} onPick={onPick} />
      </KeyboardAwareScrollView>
    </Step>
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
  const { space } = useTheme();
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

  // A place the route names starts the session at once.
  const named = asked !== null && asked !== "naming" ? asked : null;
  useEffect(() => {
    if (!signedIn || ending || session || !named) return;
    start(named);
  }, [signedIn, ending, session, named]);

  if (!signedIn) {
    // The sheet that signs in stands over this one, and goes back to it once done: the session
    // then starts at the place the address named, which this screen still holds.
    return (
      <Step title={m.native_live_title()}>
        {pending ? (
          <LiveSkeleton />
        ) : (
          <View style={{ padding: space.m }}>
            <AccountPrompt text={m.session_sign_in_prompt()} />
          </View>
        )}
      </Step>
    );
  }

  if (session) {
    if (ending || state === null) {
      return (
        <Step title={m.native_live_title()} description={session.place.name}>
          <LiveSkeleton />
        </Step>
      );
    }
    if (state === "running") {
      return <Running session={session} asked={named} />;
    }
    return <Unwritten session={session} state={state} />;
  }

  if (ending) {
    return (
      <Step title={m.native_live_title()}>
        <View style={{ padding: space.m }}>
          <Text size="s" tone="muted">
            {m.native_live_none()}
          </Text>
        </View>
      </Step>
    );
  }

  if (isStarting || asked === "naming" || named) {
    return (
      <Step title={m.native_live_title()} description={named?.name}>
        <LiveSkeleton label={m.native_live_starting()} />
      </Step>
    );
  }

  return <Where onPick={start} />;
}
