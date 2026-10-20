import {
  BellIcon,
  CalendarIcon,
  ChevronRightIcon,
  ClockIcon,
  LogbookIcon,
  PinPlusIcon,
  PlayIcon,
} from "@repo/ui/icon";
import { router } from "expo-router";
import { Fragment, useState } from "react";
import { Pressable, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Glyph, type GlyphIcon } from "@/components/shared/glyph";
import { Separator } from "@/components/ui/separator";
import { Surface } from "@/components/ui/surface";
import { Text } from "@/components/ui/text";
import { useAccount } from "@/lib/account";
import { formatClock } from "@/lib/format";
import { useLiveSession } from "@/lib/live-session";
import { useTheme } from "@/lib/theme";
import { m } from "@/paraglide/messages";

// What the "+" beside the tabs opens: what an account adds, a session, a spot or an alert, each a
// large row with its icon and a line that says what it is. What is chosen takes the sheet's place,
// and asks where when it has to. A visitor sees the same choices, and is asked for an account at
// the one it makes, which then goes on. The web's `CreateSheet` offers the same. Decision 040.
// A session asks first whether it begins now, and is timed while it lasts, or was surfed before,
// and a session in progress is found here too (decision 074).

const TILE = 44;

type Choice = {
  icon: GlyphIcon;
  title: string;
  hint: string;
  // Where it goes, and what a visitor is told it needs an account for.
  to: "/session/new" | "/session/live" | "/spot/new" | "/alert/new";
  reason: string;
};

function ChoiceRow({ choice, onPress }: { choice: Choice; onPress: () => void }) {
  const { colors, space } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={choice.title}
      accessibilityHint={choice.hint}
      onPress={onPress}
      style={({ pressed }) => ({
        minHeight: 68,
        flexDirection: "row",
        alignItems: "center",
        gap: space.s,
        paddingHorizontal: space.m,
        paddingVertical: space.s,
        backgroundColor: pressed ? colors["neutral-3"] : "transparent",
      })}
    >
      <View
        style={{
          width: TILE,
          height: TILE,
          borderRadius: TILE / 2,
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: colors["neutral-3"],
        }}
      >
        <Glyph icon={choice.icon} size={20} color={colors["neutral-10"]} />
      </View>
      <View style={{ flex: 1, gap: 2 }}>
        <Text weight="medium">{choice.title}</Text>
        <Text size="s" tone="muted">
          {choice.hint}
        </Text>
      </View>
      <Glyph icon={ChevronRightIcon} size={16} color={colors["neutral-6"]} />
    </Pressable>
  );
}

export default function CreateSheet() {
  const { colors, space } = useTheme();
  const insets = useSafeAreaInsets();
  const { signedIn } = useAccount();
  const running = useLiveSession();
  // The second step of a session: whether it begins now or was surfed before.
  const [isWhen, setWhen] = useState(false);

  // A session in progress opens itself, where it is ended and written.
  const session: Choice = running
    ? {
        icon: ClockIcon,
        title: m.native_create_session_running(),
        hint: m.native_create_session_running_hint({
          time: formatClock(new Date(running.startedAt)),
        }),
        to: "/session/live",
        reason: m.auth_reason_add_session(),
      }
    : {
        icon: LogbookIcon,
        title: m.create_session(),
        hint: m.native_create_session_hint(),
        to: "/session/new",
        reason: m.auth_reason_add_session(),
      };
  const sessionWhen: Choice[] = [
    {
      icon: PlayIcon,
      title: m.native_create_session_now(),
      hint: m.native_create_session_now_hint(),
      to: "/session/live",
      reason: m.auth_reason_add_session(),
    },
    {
      icon: CalendarIcon,
      title: m.native_create_session_before(),
      hint: m.native_create_session_before_hint(),
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
          hint: m.native_create_spot_hint(),
          to: "/spot/new",
          reason: m.auth_reason_add_spot(),
        },
        {
          icon: BellIcon,
          title: m.create_alert(),
          hint: m.native_create_alert_hint(),
          to: "/alert/new",
          reason: m.auth_reason_add_alert(),
        },
      ];

  // The sheet gives its place to what was chosen, or to the sign-in that goes on there. A session
  // that does not run yet asks when first, in the same sheet.
  const choose = (choice: Choice) => {
    if (signedIn && !isWhen && choice === session && !running) return setWhen(true);
    if (signedIn) router.replace(choice.to);
    else
      router.replace({ pathname: "/sign-in", params: { reason: choice.reason, next: choice.to } });
  };

  return (
    <View
      style={{
        gap: space.m,
        paddingTop: space.l,
        paddingHorizontal: space.m,
        paddingBottom: Math.max(insets.bottom, space.m),
        backgroundColor: colors["neutral-1"],
      }}
    >
      <Text
        size="l"
        weight="medium"
        accessibilityRole="header"
        style={{ paddingHorizontal: space.xs }}
      >
        {isWhen ? m.native_create_session_when() : m.nav_add()}
      </Text>
      <Surface insetEdge style={{ overflow: "hidden" }}>
        {choices.map((choice, index) => (
          <Fragment key={`${choice.to}:${choice.title}`}>
            {index > 0 ? <Separator inset={space.m + TILE + space.s} /> : null}
            <ChoiceRow choice={choice} onPress={() => choose(choice)} />
          </Fragment>
        ))}
      </Surface>
    </View>
  );
}
