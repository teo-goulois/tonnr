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
import { AccessibilityInfo, StyleSheet, View } from "react-native";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import Animated, { FadeIn, FadeInLeft, FadeInRight, ZoomIn } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Svg, { Defs, LinearGradient, Rect, Stop } from "react-native-svg";

import { useOwnAccount } from "@/components/account/use-own-account";
import { UsernameForm } from "@/components/account/username-form";
import { Glyph } from "@/components/shared/glyph";
import { Button, IconButton } from "@/components/ui/button";
import { feel } from "@/components/ui/haptics";
import { Text } from "@/components/ui/text";
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

const HINTS: Partial<Record<Step, () => string>> = {
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

/** The picture the questions open on, with the title over it on a shade that keeps it read. */
function WelcomePicture() {
  const { radius, space } = useTheme();
  return (
    <View
      style={{
        aspectRatio: 750 / 460,
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
            <Stop offset="0" stopColor="#000000" stopOpacity={0.7} />
            <Stop offset="0.5" stopColor="#000000" stopOpacity={0.2} />
            <Stop offset="1" stopColor="#000000" stopOpacity={0} />
          </LinearGradient>
        </Defs>
        <Rect width="100%" height="100%" fill="url(#shade)" />
      </Svg>
      <View style={{ position: "absolute", left: space.m, right: space.m, bottom: space.s }}>
        <Text size="xl" weight="heavy" accessibilityRole="header" style={{ color: "#ffffff" }}>
          {m.onboarding_title({ name: APP_NAME })}
        </Text>
      </View>
    </View>
  );
}

/** The three lines of what the app does best, each tile coming in once its line has. */
function WelcomeLines() {
  const { space, radius } = useTheme();
  return (
    <View style={{ gap: space.s }}>
      {LINES.map(({ icon, text, color }, place) => (
        <View key={place} style={{ flexDirection: "row", alignItems: "flex-start", gap: space.s }}>
          <Animated.View
            entering={ZoomIn.delay(500 + place * 100).springify()}
            accessibilityElementsHidden
            importantForAccessibility="no-hide-descendants"
            style={{
              width: 32,
              height: 32,
              borderRadius: radius.xs,
              borderCurve: "continuous",
              alignItems: "center",
              justifyContent: "center",
              backgroundColor: color,
            }}
          >
            <Glyph icon={icon} size={18} color={light["neutral-1"]} />
          </Animated.View>
          <Text style={{ flex: 1 }}>{text()}</Text>
        </View>
      ))}
    </View>
  );
}

/** A part of a step as it comes: from the side the step comes from, a fade alone for no motion. */
function Arrive({ from, children }: { from: "start" | "end"; children: ReactNode }) {
  const { motion, space } = useTheme();
  const entering = (from === "end" ? FadeInRight : FadeInLeft).duration(motion.largeDuration);
  return (
    <Animated.View entering={entering} style={{ gap: space.l }}>
      {children}
    </Animated.View>
  );
}

/**
 * What an account is asked once, as it comes, existing accounts as new ones, over the whole
 * screen: what the app does best, in three lines, then a few questions one at a time, each of
 * which may be skipped, with a bar that says how far it is. The last keeps the answers, which
 * set how much a panel shows, and leads to the map. Leaving, by its button or the platform's
 * way back, puts the questions off: the account answers them later in its tab. An account with
 * no username chooses it first. Decision 063.
 */
export function Onboarding() {
  const { colors, space } = useTheme();
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();
  const tell = useTell();
  const profiling = useProfile();
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

  const username = named ?? own.account?.username ?? session.username;
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

  function putOff() {
    settled.current = true;
    profiling.onPutOff();
    if (router.canGoBack()) router.back();
  }

  async function finish() {
    if (!(await profiling.onSave(answers))) {
      tell({ title: m.profile_error(), tone: "danger" });
      return;
    }
    settled.current = true;
    feel("done");
    router.dismissTo("/");
  }

  const answered = step !== "welcome" && hasAnswer(step, answers, username);
  const hint = HINTS[step];

  return (
    <View
      style={{
        flex: 1,
        backgroundColor: colors["cte-canvas"],
        paddingTop: insets.top + space.s,
        paddingBottom: insets.bottom + space.s,
      }}
    >
      {step === "welcome" ? null : (
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: space.s,
            paddingLeft: space.m,
            paddingRight: space.xs,
          }}
        >
          <Progress at={at} count={steps.length} />
          <IconButton icon={XIcon} label={m.action_close()} variant="ghost" onPress={putOff} />
        </View>
      )}

      <KeyboardAwareScrollView
        keyboardShouldPersistTaps="handled"
        bottomOffset={space.l}
        style={{ flex: 1 }}
        contentContainerStyle={{ padding: space.m, paddingBottom: space.xl }}
      >
        <Arrive key={step} from={from}>
          {step === "welcome" ? (
            <>
              <WelcomePicture />
              <Text tone="muted">{m.onboarding_text()}</Text>
              <WelcomeLines />
            </>
          ) : (
            <View style={{ gap: space.xxs }}>
              <Text size="xl" weight="heavy" accessibilityRole="header">
                {TITLES[step]()}
              </Text>
              {hint ? <Text tone="muted">{hint()}</Text> : null}
            </View>
          )}

          {step === "username" ? (
            <View style={{ gap: space.s }}>
              <Text size="s" tone="muted">
                {m.username_none()}
              </Text>
              <UsernameForm
                current={username}
                autoFocus
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
      </KeyboardAwareScrollView>

      {/* Leaving at the start, going on at the end, as the web's buttons stand. */}
      <View
        style={{
          flexDirection: "row",
          flexWrap: "wrap",
          justifyContent: "space-between",
          gap: space.xs,
          paddingHorizontal: space.m,
          paddingTop: space.s,
        }}
      >
        {step === "welcome" ? (
          <>
            <Button variant="ghost" onPress={putOff}>
              {m.onboarding_later()}
            </Button>
            <Button onPress={start}>{m.onboarding_start()}</Button>
          </>
        ) : (
          <>
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
          </>
        )}
      </View>
    </View>
  );
}
