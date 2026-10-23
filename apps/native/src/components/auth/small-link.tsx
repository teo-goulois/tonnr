import { Pressable } from "react-native";

import { TARGET } from "@/components/ui/metrics";
import { Text } from "@/components/ui/text";
import { useTheme } from "@/lib/theme";

/**
 * A link in small text that stands on a line of its own, or a button drawn as one, as the web's
 * sign-in draws them: underlined, in the theme's ink and medium, as the switch between signing
 * in and creating an account, or `muted` in its seventh grey and regular, as a link that stands
 * aside, the forgotten password and the way back to signing in. It is a finger's height to a
 * press, past the line it is drawn on, so that it stands as close to what is around it as the
 * web's. A link inside a sentence is a `Text` of the sentence, as the terms are.
 */
export function SmallLink({
  label,
  onPress,
  role = "link",
  muted = false,
}: {
  label: string;
  onPress: () => void;
  role?: "link" | "button";
  muted?: boolean;
}) {
  const { space, type } = useTheme();
  const slop = Math.ceil(Math.max(0, TARGET - type.s.line) / 2);
  return (
    <Pressable
      accessibilityRole={role}
      onPress={onPress}
      hitSlop={{ top: slop, bottom: slop, left: space.xxs, right: space.xxs }}
    >
      {({ pressed }) => (
        <Text
          size="s"
          weight={muted ? "regular" : "medium"}
          tone={muted ? "muted" : "default"}
          style={{ textDecorationLine: "underline", opacity: pressed ? 0.6 : 1 }}
        >
          {label}
        </Text>
      )}
    </Pressable>
  );
}
