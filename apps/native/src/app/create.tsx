import { BellIcon, ChevronRightIcon, LogbookIcon, PinPlusIcon } from "@repo/ui/icon";
import { router } from "expo-router";
import { Fragment } from "react";
import { Pressable, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Glyph, type GlyphIcon } from "@/components/shared/glyph";
import { Separator } from "@/components/ui/separator";
import { Surface } from "@/components/ui/surface";
import { Text } from "@/components/ui/text";
import { useAccount } from "@/lib/account";
import { useTheme } from "@/lib/theme";
import { m } from "@/paraglide/messages";

// What the "+" beside the tabs opens: what an account adds, a session, a spot or an alert, each a
// large row with its icon and a line that says what it is. What is chosen takes the sheet's place,
// and asks where when it has to. A visitor sees the same choices, and is asked for an account at
// the one it makes, which then goes on. The web's `CreateSheet` offers the same. Decision 040.

const TILE = 44;

type Choice = {
  icon: GlyphIcon;
  title: string;
  hint: string;
  // Where it goes, and what a visitor is told it needs an account for.
  to: "/session/new" | "/spot/new" | "/alert/new";
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

  // What is added most often comes first: a session after each time in the water.
  const choices: Choice[] = [
    {
      icon: LogbookIcon,
      title: m.create_session(),
      hint: m.native_create_session_hint(),
      to: "/session/new",
      reason: m.auth_reason_add_session(),
    },
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

  // The sheet gives its place to what was chosen, or to the sign-in that goes on there.
  const choose = (choice: Choice) => {
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
        {m.nav_add()}
      </Text>
      <Surface insetEdge style={{ overflow: "hidden" }}>
        {choices.map((choice, index) => (
          <Fragment key={choice.to}>
            {index > 0 ? <Separator inset={space.m + TILE + space.s} /> : null}
            <ChoiceRow choice={choice} onPress={() => choose(choice)} />
          </Fragment>
        ))}
      </Surface>
    </View>
  );
}
