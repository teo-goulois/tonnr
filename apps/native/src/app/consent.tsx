import { router, useLocalSearchParams, useNavigation } from "expo-router";
import { type ComponentRef, useEffect, useEffectEvent, useRef } from "react";
import { AccessibilityInfo, Pressable, StyleSheet, useWindowDimensions, View } from "react-native";
import Animated, { Easing, Keyframe } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useOpenPage } from "@/components/account/open-page";
import { siteAddress } from "@/components/account/site-pages";
import { setConsent } from "@/components/account/use-consent";
import { Button } from "@/components/ui/button";
import { edge } from "@/components/ui/edge";
import { TARGET } from "@/components/ui/metrics";
import { Text } from "@/components/ui/text";
import { ENV } from "@/env";
import { useTheme } from "@/lib/theme";
import { m } from "@/paraglide/messages";
import { getLocale } from "@/paraglide/runtime";

// The web's dialog: as wide as 26 rem, or the screen less a step of 16 points on each side.
const DIALOG_WIDTH = 416;
const DIALOG_MARGIN = 16;

// It comes as the web's does: from 98 % of its size, fading in, in a fifth of a second.
const OPENING = new Keyframe({
  0: { opacity: 0, transform: [{ scale: 0.98 }] },
  100: { opacity: 1, transform: [{ scale: 1 }], easing: Easing.bezier(0, 0, 0.2, 1) },
}).duration(200);

/**
 * The one question about analytics and error reports, asked once over the map as the web asks
 * it in its dialog, in its words and its order: what the app would send, then Decline and Accept,
 * which look the same, and a link to what the privacy policy says of it. The screen reader starts
 * on Accept, as the web's focus does, which grants nothing by itself. Leaving it any other way, by
 * a press beside it, Android's back or a screen reader's escape, declines, as the web's Escape and
 * a press beside its dialog do. Decisions 044 and 054. `?sample=1` opens the design system's,
 * which keeps nothing, in development only.
 */
export default function ConsentScreen() {
  const { sample } = useLocalSearchParams<{ sample?: string }>();
  const keeps = !(__DEV__ && sample === "1");
  const { colors, space, radius } = useTheme();
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();
  const { openAddress } = useOpenPage();
  const accept = useRef<ComponentRef<typeof View>>(null);
  const answered = useRef(false);

  const answer = (choice: "granted" | "denied") => {
    if (answered.current) return;
    answered.current = true;
    if (keeps) setConsent(choice);
  };
  const choose = (choice: "granted" | "denied") => {
    answer(choice);
    if (router.canGoBack()) router.back();
  };

  const leaving = useEffectEvent(() => answer("denied"));
  useEffect(() => {
    const unsubscribe = navigation.addListener("removed", () => leaving());
    // The event comes after the screen's effects are cleaned up.
    return () => queueMicrotask(unsubscribe);
  }, [navigation]);

  // Once it has come in, so that the screen reader does not take it back to the screen's start.
  useEffect(() => {
    const timer = setTimeout(() => {
      if (accept.current) AccessibilityInfo.sendAccessibilityEvent(accept.current, "focus");
    }, 300);
    return () => clearTimeout(timer);
  }, []);

  const privacy = `${siteAddress(ENV.EXPO_PUBLIC_SITE_URL, getLocale(), "privacy")}#analytics`;

  return (
    <View
      accessibilityViewIsModal
      onAccessibilityEscape={() => choose("denied")}
      style={{
        flex: 1,
        alignItems: "center",
        justifyContent: "center",
        paddingTop: insets.top,
        paddingBottom: insets.bottom,
        backgroundColor: colors["neutral-10-transparent"],
      }}
    >
      {/* A press beside the dialog declines. A screen reader leaves by its escape instead. */}
      <Pressable
        accessible={false}
        importantForAccessibility="no"
        onPress={() => choose("denied")}
        style={StyleSheet.absoluteFill}
      />
      <Animated.View
        entering={OPENING}
        style={[
          {
            width: Math.min(DIALOG_WIDTH, width - 2 * DIALOG_MARGIN),
            padding: space.l,
            gap: space.m,
            borderRadius: radius.m,
            borderCurve: "continuous",
            backgroundColor: colors["neutral-1"],
          },
          edge(colors["neutral-4-transparent"]),
        ]}
      >
        <Text size="l" weight="medium" accessibilityRole="header">
          {m.analytics_title()}
        </Text>
        <Text tone="muted">{m.analytics_description()}</Text>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space.s }}>
          <Button variant="secondary" onPress={() => choose("denied")}>
            {m.analytics_refuse()}
          </Button>
          <Button ref={accept} variant="secondary" onPress={() => choose("granted")}>
            {m.analytics_allow()}
          </Button>
        </View>
        <Pressable
          accessibilityRole="link"
          onPress={() => void openAddress(privacy)}
          hitSlop={{ left: space.xxs, right: space.xxs }}
          style={{ alignSelf: "flex-start", minHeight: TARGET, justifyContent: "center" }}
        >
          {({ pressed }) => (
            <Text size="s" style={{ textDecorationLine: "underline", opacity: pressed ? 0.6 : 1 }}>
              {m.analytics_details()}
            </Text>
          )}
        </Pressable>
      </Animated.View>
    </View>
  );
}
