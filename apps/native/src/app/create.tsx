import {
  BellIcon,
  CalendarIcon,
  ChevronRightIcon,
  ClockIcon,
  LogbookIcon,
  PinPlusIcon,
  PlayIcon,
} from "@repo/ui/icon";
import { router, useLocalSearchParams, useNavigation } from "expo-router";
import { useEffect, useState } from "react";
import { BackHandler, Pressable, View } from "react-native";

import { placeParam } from "@/components/sessions/session-place";
import { Glyph, type GlyphIcon } from "@/components/shared/glyph";
import { PanelHeader, useSheetFoot } from "@/components/ui/sheet";
import { Text } from "@/components/ui/text";
import { useAccount } from "@/lib/account";
import type { Route } from "@/lib/links";
import { useLiveSession } from "@/lib/live-session";
import { useTheme } from "@/lib/theme";
import { m } from "@/paraglide/messages";
import { orpc, queryClient } from "@/utils/orpc";

// What the "+" beside the tabs opens, the web's `CreateSheet`: what an account adds, a session, a
// spot or an alert, each a row with its icon on a disc, on the sheet's own ground under the
// drawer's head. What is chosen takes the sheet's place, and asks where when it has to. A visitor
// sees the same choices, and is asked for an account at the one it makes, before anything else,
// which then goes on. Decisions 040 and 043.
// A session asks next whether it begins now, and is timed while it lasts, or was surfed before,
// a step with its way back to the choices, and a session in progress is found here too
// (decision 074).

// The web's row: 56 points high, its icon at 18 on a disc of 40.
const ROW = 56;
const DISC = 40;
const ICON = 18;

type Step = "choices" | "when";

type Choice = {
  icon: GlyphIcon;
  title: string;
  // Where it goes, and what a visitor is told it needs an account for.
  to: Route;
  reason: string;
};

function ChoiceRow({ choice, onPress }: { choice: Choice; onPress: () => void }) {
  const { colors, space, radius, type } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={choice.title}
      onPress={onPress}
      // Its words stand in line with the title, as the kit's plain `Row` lays them: its room is
      // laid outside it, as the web's `-mx-xs px-xs`, so that only its press shows it.
      style={({ pressed }) => ({
        minHeight: ROW,
        flexDirection: "row",
        alignItems: "center",
        gap: space.s,
        marginHorizontal: -space.xs,
        paddingHorizontal: space.xs,
        borderRadius: radius.xs,
        borderCurve: "continuous",
        backgroundColor: pressed ? colors["neutral-3-transparent"] : "transparent",
      })}
    >
      <View
        style={{
          width: DISC,
          height: DISC,
          borderRadius: DISC / 2,
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: colors["neutral-3"],
        }}
      >
        <Glyph icon={choice.icon} size={ICON} color={colors["neutral-10"]} />
      </View>
      <Text style={{ flex: 1, minWidth: 0 }}>{choice.title}</Text>
      <Glyph icon={ChevronRightIcon} size={type.m.size} color={colors["neutral-7"]} />
    </Pressable>
  );
}

/**
 * The place in view under the sheet, as a session's route names it, which a session begins at, as
 * the web's begins at the break or the account's own spot in view: a station, or a spot that is
 * not the account's, gives none. A place's sheet stands over the bar of tabs, so that the "+" is
 * seldom pressed with one in view, and a session then asks where, as the web's does.
 */
function placeUnder(state: { index: number; routes: { name: string; params?: object }[] }) {
  const under = state.routes[state.index - 1];
  if (under?.name !== "place/[kind]/[id]") return undefined;
  const { kind, id } = (under.params ?? {}) as { kind?: unknown; id?: unknown };
  if (typeof id !== "string" || !id) return undefined;
  if (kind === "break") return placeParam({ kind, id });
  if (kind !== "spot") return undefined;
  const own = queryClient.getQueryData(orpc.v1.spots.list.queryKey())?.spots;
  return own?.some((spot) => spot.id === id) ? placeParam({ kind, id }) : undefined;
}

export default function CreateSheet() {
  const { colors, space } = useTheme();
  const foot = useSheetFoot(space.m);
  const navigation = useNavigation();
  const { signedIn } = useAccount();
  const running = useLiveSession();
  // A visitor who chose a session signs in, and comes back to its second step, `?step=when`.
  const params = useLocalSearchParams<{ step?: string }>();
  const [step, setStep] = useState<Step>(() =>
    params.step === "when" && !running ? "when" : "choices",
  );
  // A session that runs is found among the choices, and asks no "when".
  const isWhen = step === "when" && !running;

  // The back of Android goes back to the choices from the second step, as its chevron does, where
  // the sheet would otherwise close.
  useEffect(() => {
    if (!isWhen) return;
    const listener = BackHandler.addEventListener("hardwareBackPress", () => {
      setStep("choices");
      return true;
    });
    return () => listener.remove();
  }, [isWhen]);

  // A session begins at the place in view, or asks where (decision 074): read as it is chosen,
  // since the account's spots may come after the sheet is drawn.
  const at = (pathname: Route): Route => {
    const place = placeUnder(navigation.getState() ?? { index: 0, routes: [] });
    return place ? (`${pathname}?place=${encodeURIComponent(place)}` as Route) : pathname;
  };

  // A session in progress opens itself, where it is ended and written.
  const session: Choice = running
    ? {
        icon: ClockIcon,
        title: m.native_create_session_running(),
        to: "/session/live",
        reason: m.auth_reason_add_session(),
      }
    : {
        icon: LogbookIcon,
        title: m.create_session(),
        to: "/session/new",
        reason: m.auth_reason_add_session(),
      };
  const sessionWhen: Choice[] = [
    {
      icon: PlayIcon,
      title: m.native_create_session_now(),
      to: "/session/live",
      reason: m.auth_reason_add_session(),
    },
    {
      icon: CalendarIcon,
      title: m.native_create_session_before(),
      to: "/session/new",
      reason: m.auth_reason_add_session(),
    },
  ];

  // What is added most often comes first: a session after each time in the water.
  const choices: Choice[] = isWhen
    ? sessionWhen
    : [
        session,
        {
          icon: PinPlusIcon,
          title: m.create_spot(),
          to: "/spot/new",
          reason: m.auth_reason_add_spot(),
        },
        {
          icon: BellIcon,
          title: m.create_alert(),
          to: "/alert/new",
          reason: m.auth_reason_add_alert(),
        },
      ];

  // The sheet gives its place to what was chosen, or to the sign-in, which goes on there: a
  // visitor is asked for an account at the choice, as the web asks, and a session that does not
  // run yet then comes back to ask when.
  const choose = (choice: Choice) => {
    const asksWhen = !isWhen && !running && choice === session;
    const to = isWhen ? at(choice.to) : choice.to;
    if (!signedIn) {
      const next = asksWhen ? "/create?step=when" : to;
      router.replace({ pathname: "/sign-in", params: { reason: choice.reason, next } });
      return;
    }
    if (asksWhen) setStep("when");
    else router.replace(to);
  };

  return (
    <View
      style={{
        paddingBottom: foot,
        backgroundColor: colors["neutral-1"],
      }}
    >
      <PanelHeader
        title={isWhen ? m.native_create_session_when() : m.nav_add()}
        onBack={isWhen ? () => setStep("choices") : undefined}
        onClose={() => router.back()}
      />
      <View style={{ gap: space.xxs, paddingTop: space.m, paddingHorizontal: space.m }}>
        {choices.map((choice) => (
          <ChoiceRow key={choice.title} choice={choice} onPress={() => choose(choice)} />
        ))}
      </View>
    </View>
  );
}
