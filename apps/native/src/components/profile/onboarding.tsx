import { APP_NAME } from "@repo/config/app";
import { scaleColor, WAVE_HEIGHT_SCALE } from "@repo/client/sea-scales";
import type { ProfileAnswers } from "@repo/client/viewer/types";
import {
  BellOnFillDuoIcon,
  BookBookmarkFillDuoIcon,
  SparklesFillDuoIcon,
  XIcon,
} from "@repo/ui/icon";
import { Image } from "expo-image";
import { router, useNavigation } from "expo-router";
import { type ReactNode, useEffect, useEffectEvent, useRef, useState } from "react";
import {
  AccessibilityInfo,
  ScrollView,
  type StyleProp,
  StyleSheet,
  useWindowDimensions,
  View,
  type ViewStyle,
} from "react-native";
import { KeyboardAvoidingView } from "react-native-keyboard-controller";
import Animated, {
  Easing,
  FadeIn,
  Keyframe,
  ReduceMotion,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withSequence,
  withTiming,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Svg, { Defs, LinearGradient, Rect, Stop } from "react-native-svg";

import { useOwnAccount } from "@/components/account/use-own-account";
import { UsernameForm } from "@/components/account/username-form";
import { Button, IconButton } from "@/components/ui/button";
import { edge } from "@/components/ui/edge";
import { feel } from "@/components/ui/haptics";
import { Text } from "@/components/ui/text";
import { Tile } from "@/components/ui/tile";
import { useTell } from "@/components/ui/toast";
import { useAccount } from "@/lib/account";
import { useTheme } from "@/lib/theme";
import { light } from "@/theme/tokens";
import { m } from "@/paraglide/messages";

import { hasAnswer, NO_ANSWERS, type Step, stepsOf } from "./profiling";
import { BoardChoice, LevelChoice, ReadingChoice, WaveRange } from "./questions";
import { useProfile } from "./use-profile";

// The web's picture of a surfer on a wave, in black and white, read from where the web keeps
// it so that it is kept once: Metro reads the workspace.
const WELCOME = require("../../../../web/public/onboarding/welcome.webp");

// How long a choice that leads on stays in view, chosen, before the next question comes.
const SEEN_CHOSEN = 220;

// The web's dialog: as wide as 28 rem, or the screen less a step of 16 points on each side, and
// as tall as 85 % of the screen at most, its parts scrolled inside it.
const DIALOG_WIDTH = 448;
const DIALOG_MARGIN = 16;

// How far a part slides as it comes, the web's `slide-in-from-*-3`, and how long after the part
// before it: a tenth of a second.
const SLIDE = 12;
const STAGGER = 100;

// What the app does best, each line with a tile in a color of the sea's scales, as the web says it.
const LINES = [
  { icon: BellOnFillDuoIcon, text: m.onboarding_alerts, color: scaleColor(WAVE_HEIGHT_SCALE, 4) },
  {
    icon: BookBookmarkFillDuoIcon,
    text: m.onboarding_logbook,
    color: scaleColor(WAVE_HEIGHT_SCALE, 1.5),
  },
  { icon: SparklesFillDuoIcon, text: m.onboarding_agents, color: scaleColor(WAVE_HEIGHT_SCALE, 8) },
];

const TITLES: Record<Exclude<Step, "welcome">, () => string> = {
  username: m.profile_username_title,
  level: m.profile_level_title,
  waves: m.profile_waves_title,
  reading: m.profile_reading_title,
  boards: m.profile_boards_title,
};

// What a step says under its title, the welcome's in the place of one.
const HINTS: Partial<Record<Step, () => string>> = {
  welcome: m.onboarding_text,
  reading: m.profile_reading_hint,
  boards: m.profile_boards_hint,
};

/** Where the questions are: one mark for each, filled up to the one in view; said as "2 of 5". */
function Progress({ at, count }: { at: number; count: number }) {
  const { colors, space, motion } = useTheme();
  return (
    <View
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel={m.onboarding_step({ step: at + 1, count })}
      accessibilityValue={{ min: 1, max: count, now: at + 1 }}
      style={{ flex: 1, flexDirection: "row", gap: space.xxs }}
    >
      {Array.from({ length: count }, (_, place) => (
        <Animated.View
          key={`${place}-${place <= at}`}
          entering={FadeIn.duration(motion.largeDuration)}
          style={{
            flex: 1,
            height: 4,
            borderRadius: 2,
            backgroundColor: place <= at ? colors["neutral-10"] : colors["neutral-4"],
          }}
        />
      ))}
    </View>
  );
}

/**
 * The picture the questions open on, with the title over it on a shade that keeps it read: black
 * under white whatever the theme, as the web draws it over the photograph. A hairline inside its
 * corners, the web's outline, keeps the white of its foam apart from the dialog's ground.
 */
function WelcomePicture() {
  const { radius, space, scheme } = useTheme();
  return (
    <View
      style={{
        aspectRatio: 3,
        borderRadius: radius.s,
        borderCurve: "continuous",
        overflow: "hidden",
      }}
    >
      <Image
        source={WELCOME}
        contentFit="cover"
        contentPosition={{ top: "35%", left: "50%" }}
        style={StyleSheet.absoluteFill}
        accessible={false}
      />
      <Svg style={StyleSheet.absoluteFill} accessible={false}>
        <Defs>
          <LinearGradient id="shade" x1="0" y1="1" x2="0" y2="0">
            <Stop offset="0" stopColor={light["neutral-10"]} stopOpacity={0.7} />
            <Stop offset="0.5" stopColor={light["neutral-10"]} stopOpacity={0.2} />
            <Stop offset="1" stopColor={light["neutral-10"]} stopOpacity={0} />
          </LinearGradient>
        </Defs>
        <Rect width="100%" height="100%" fill="url(#shade)" />
      </Svg>
      <View
        pointerEvents="none"
        style={[
          StyleSheet.absoluteFill,
          { borderRadius: radius.s, borderCurve: "continuous" },
          edge(scheme === "dark" ? "rgba(255, 255, 255, 0.1)" : "rgba(0, 0, 0, 0.1)", {
            inset: true,
            width: 1,
          }),
        ]}
      />
      <View style={{ position: "absolute", left: space.m, right: space.m, bottom: space.s }}>
        <Text
          size="l"
          weight="medium"
          accessibilityRole="header"
          style={{ color: light["neutral-1"] }}
        >
          {m.onboarding_title({ name: APP_NAME })}
        </Text>
      </View>
    </View>
  );
}

/**
 * A line's tile, there from the start, which says it is there once, `after` its line has come:
 * it swells and turns a little on the theme's large easing, and holds still for a reader who
 * asked for no motion, as the web's `landing-pop`.
 */
function PoppingTile({
  icon,
  color,
  after,
}: Omit<(typeof LINES)[number], "text"> & { after: number }) {
  const { motion } = useTheme();
  const still = useReducedMotion();
  const pop = useSharedValue(0);
  useEffect(() => {
    if (still) return;
    const [x1, y1, x2, y2] = motion.largeEasing;
    const easing = Easing.bezier(x1, y1, x2, y2);
    // 600 ms, at its fullest four tenths in.
    pop.set(
      withDelay(
        after,
        withSequence(
          withTiming(1, { duration: 240, easing }),
          withTiming(0, { duration: 360, easing }),
        ),
      ),
    );
  }, [still, after, pop, motion]);
  const popping = useAnimatedStyle(() => ({
    transform: [{ scale: 1 + 0.12 * pop.get() }, { rotate: `${-4 * pop.get()}deg` }],
  }));
  return (
    <Animated.View style={[{ marginTop: 2 }, popping]}>
      <Tile icon={icon} color={color} />
    </Animated.View>
  );
}

/** The three lines of what the app does best, each tile saying it is there once its line has. */
function WelcomeLines() {
  const { space } = useTheme();
  return (
    <View style={{ gap: space.s }}>
      {LINES.map(({ icon, text, color }, place) => (
        <View key={place} style={{ flexDirection: "row", alignItems: "flex-start", gap: space.s }}>
          <PoppingTile icon={icon} color={color} after={500 + place * 100} />
          <Text style={{ flex: 1 }}>{text()}</Text>
        </View>
      ))}
    </View>
  );
}

/**
 * A part of a step as it comes: a fade and a slide from the side the step comes from, on the
 * theme's large easing, a tenth of a second after the part before it, as the web's. A reader who
 * asked for no motion gets the fade alone. The web's blur is left out: a phone's view has none.
 */
function Arrive({
  place,
  from,
  style,
  children,
}: {
  place: number;
  from: "start" | "end";
  style?: StyleProp<ViewStyle>;
  children: ReactNode;
}) {
  const { motion } = useTheme();
  const still = useReducedMotion();
  const delay = place * STAGGER;
  const [x1, y1, x2, y2] = motion.largeEasing;
  const entering = still
    ? FadeIn.duration(motion.largeDuration).delay(delay).reduceMotion(ReduceMotion.Never)
    : new Keyframe({
        0: { opacity: 0, transform: [{ translateX: from === "end" ? SLIDE : -SLIDE }] },
        100: { opacity: 1, transform: [{ translateX: 0 }], easing: Easing.bezier(x1, y1, x2, y2) },
      })
        .duration(motion.largeDuration)
        .delay(delay);
  return (
    <Animated.View entering={entering} style={style}>
      {children}
    </Animated.View>
  );
}

// What the design system's questions do with their answers: nothing.
const SAMPLE = { isSaving: false, onSave: async () => true, onPutOff: () => {} };

// The dialog as it opens, the web's: from a little smaller, as it fades in.
const OPENING = new Keyframe({
  0: { opacity: 0, transform: [{ scale: 0.98 }] },
  100: { opacity: 1, transform: [{ scale: 1 }], easing: Easing.bezier(0, 0, 0.2, 1) },
}).duration(200);

/**
 * What an account is asked once, as it comes, existing accounts as new ones, in a dialog over the
 * map as the web asks it: what the app does best, in three lines, then a few questions one at a
 * time, each of which may be skipped, with a bar that says how far it is. The last keeps the
 * answers, which set how much a panel shows, and closes over what was under it. Leaving, by its
 * buttons or the platform's way back, puts the questions off: the account answers them later in
 * its tab. A press beside the dialog does nothing, since it would lose the answers. An account
 * with no username chooses it first. Decision 063.
 *
 * `sample` is the design system's: the questions keep nothing and put nothing off, and ask no
 * username, which they would choose for good.
 */
export function Onboarding({ sample = false }: { sample?: boolean }) {
  const { colors, space, radius } = useTheme();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const navigation = useNavigation();
  const tell = useTell();
  const kept = useProfile();
  const profiling = sample ? SAMPLE : kept;
  const own = useOwnAccount();
  const session = useAccount();
  const [step, setStep] = useState<Step>("welcome");
  const [from, setFrom] = useState<"start" | "end">("end");
  const [answers, setAnswers] = useState<ProfileAnswers>(NO_ANSWERS);
  // The username chosen here, once it is.
  const [named, setNamed] = useState<string | null>(null);
  // The questions, fixed as they begin, so that a username chosen keeps its step.
  const [steps, setSteps] = useState<Exclude<Step, "welcome">[]>(() => stepsOf(false));
  // Once the answers are kept or put off, leaving puts nothing off.
  const settled = useRef(false);

  const username = sample ? "maelle_lg" : (named ?? own.account?.username ?? session.username);
  const at = step === "welcome" ? -1 : steps.indexOf(step);
  const change = (part: Partial<ProfileAnswers>) =>
    setAnswers((current) => ({ ...current, ...part }));

  // Leaving any other way than by its buttons puts the questions off too, as the web's Escape.
  const leaving = useEffectEvent(() => {
    if (settled.current) return;
    settled.current = true;
    profiling.onPutOff();
  });
  useEffect(() => {
    const unsubscribe = navigation.addListener("removed", () => leaving());
    // The event comes after the screen's effects are cleaned up.
    return () => queueMicrotask(unsubscribe);
  }, [navigation]);

  // A screen reader hears the question that comes.
  useEffect(() => {
    if (step !== "welcome") AccessibilityInfo.announceForAccessibility(TITLES[step]());
  }, [step]);

  const goTo = (next: Step, side: "start" | "end") => {
    setFrom(side);
    setStep(next);
  };
  const start = () => {
    const asked = stepsOf(username === null);
    setSteps(asked);
    goTo(asked[0] ?? "level", "end");
  };
  const next = () => {
    const following = steps[at + 1];
    if (following) goTo(following, "end");
  };
  const back = () => goTo(at > 0 ? (steps[at - 1] ?? "welcome") : "welcome", "start");
  // A choice that leads on is seen chosen first.
  const nextSoon = () => setTimeout(next, SEEN_CHOSEN);

  const close = () => {
    if (router.canGoBack()) router.back();
  };

  function putOff() {
    settled.current = true;
    profiling.onPutOff();
    close();
  }

  async function finish() {
    if (!(await profiling.onSave(answers))) {
      tell({ title: m.profile_error(), tone: "danger" });
      return;
    }
    settled.current = true;
    feel("done");
    close();
  }

  const answered = step !== "welcome" && hasAnswer(step, answers, username);
  const hint = HINTS[step];
  const isWelcome = step === "welcome";
  const buttons: ViewStyle = {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    justifyContent: "space-between",
    gap: space.xs,
  };

  return (
    <View
      accessibilityViewIsModal
      // A screen reader's way out puts the questions off, as the web's Escape does.
      onAccessibilityEscape={putOff}
      style={{
        flex: 1,
        paddingTop: insets.top,
        paddingBottom: insets.bottom,
        backgroundColor: colors["neutral-10-transparent"],
      }}
    >
      {/* The keyboard takes its room from under the dialog, which stays in the middle of what
          is left. */}
      <KeyboardAvoidingView
        behavior="padding"
        style={{ flex: 1, alignItems: "center", justifyContent: "center" }}
      >
        <Animated.View
          entering={OPENING}
          style={{
            width: Math.min(DIALOG_WIDTH, width - 2 * DIALOG_MARGIN),
            maxHeight: "85%",
            borderRadius: radius.m,
            borderCurve: "continuous",
            overflow: "hidden",
            backgroundColor: colors["neutral-1"],
          }}
        >
          <ScrollView
            keyboardShouldPersistTaps="handled"
            style={{ flexGrow: 0 }}
            contentContainerStyle={{ padding: space.l, gap: space.m }}
          >
            {isWelcome ? (
              <Arrive place={0} from={from}>
                <WelcomePicture />
              </Arrive>
            ) : null}

            <View style={{ gap: space.xs }}>
              {/* Where the questions are, on the line of the button that leaves them. The
                  welcome is left by its own "Later", and by the platform's way back. */}
              {isWelcome ? null : (
                <View style={{ flexDirection: "row", alignItems: "center", gap: space.s }}>
                  <Progress at={at} count={steps.length} />
                  <IconButton
                    icon={XIcon}
                    label={m.action_close()}
                    variant="ghost"
                    onPress={putOff}
                    style={{ marginVertical: -space.xs, marginRight: -space.xs }}
                  />
                </View>
              )}
              <Arrive
                key={`${step}-words`}
                place={isWelcome ? 1 : 0}
                from={from}
                style={{ gap: space.xxs }}
              >
                {isWelcome ? null : (
                  <Text size="l" weight="medium" accessibilityRole="header">
                    {TITLES[step]()}
                  </Text>
                )}
                {hint ? <Text tone="muted">{hint()}</Text> : null}
              </Arrive>
            </View>

            <Arrive key={`${step}-control`} place={isWelcome ? 2 : 1} from={from}>
              {isWelcome ? <WelcomeLines /> : null}
              {step === "username" ? (
                <View style={{ gap: space.s }}>
                  <Text size="s" tone="muted">
                    {m.username_none()}
                  </Text>
                  <UsernameForm
                    current={username}
                    onSaved={(chosen) => {
                      setNamed(chosen);
                      next();
                    }}
                  />
                </View>
              ) : null}
              {step === "level" ? (
                <LevelChoice
                  value={answers.level}
                  onPick={(level) => {
                    change({ level });
                    nextSoon();
                  }}
                />
              ) : null}
              {step === "waves" ? (
                <WaveRange
                  smallest={answers.smallestWave}
                  biggest={answers.biggestWave}
                  onChange={(smallestWave, biggestWave) => change({ smallestWave, biggestWave })}
                />
              ) : null}
              {step === "reading" ? (
                <ReadingChoice
                  value={answers.reading}
                  onPick={(reading) => {
                    change({ reading });
                    nextSoon();
                  }}
                />
              ) : null}
              {step === "boards" ? (
                <BoardChoice value={answers.boards} onChange={(boards) => change({ boards })} />
              ) : null}
            </Arrive>

            {/* Leaving at the start, going on at the end, as the web's buttons stand. */}
            {isWelcome ? (
              <Arrive place={3} from={from} style={buttons}>
                <Button variant="ghost" onPress={putOff}>
                  {m.onboarding_later()}
                </Button>
                <Button onPress={start}>{m.onboarding_start()}</Button>
              </Arrive>
            ) : (
              <View style={buttons}>
                <Button variant="ghost" onPress={back}>
                  {m.action_back()}
                </Button>
                {step === "boards" ? (
                  <Button loading={profiling.isSaving} onPress={() => void finish()}>
                    {m.onboarding_explore()}
                  </Button>
                ) : (
                  <Button variant={answered ? "primary" : "ghost"} onPress={next}>
                    {answered ? m.onboarding_next() : m.onboarding_skip()}
                  </Button>
                )}
              </View>
            )}
          </ScrollView>
          {/* It clips what scrolls in it to its corners, so its edge is drawn inside, over what
              scrolls, which would otherwise cover it. */}
          <View
            pointerEvents="none"
            style={[
              StyleSheet.absoluteFill,
              { borderRadius: radius.m, borderCurve: "continuous" },
              edge(colors["neutral-4-transparent"], { inset: true }),
            ]}
          />
        </Animated.View>
      </KeyboardAvoidingView>
    </View>
  );
}
