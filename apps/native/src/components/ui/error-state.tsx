import { AlertCircleIcon } from "@repo/ui/icon";
import { View } from "react-native";

import { Glyph } from "@/components/shared/glyph";
import { useTheme } from "@/lib/theme";
import { m } from "@/paraglide/messages";

import { Button } from "./button";
import { Text } from "./text";

// What a screen says when what it asked could not be had: what failed, in the screen's own
// words ("Your lists could not be loaded."), and a press that asks again. A screen reader is
// told as it appears.

type ErrorStateProps = {
  title: string;
  description?: string;
  /** Asks again. Without it, the state says what failed and offers nothing. */
  onRetry?: () => void;
  /** Asking again: the button waits. */
  retrying?: boolean;
};

export function ErrorState({ title, description, onRetry, retrying = false }: ErrorStateProps) {
  const { colors, space } = useTheme();
  return (
    <View
      accessibilityRole="alert"
      accessibilityLiveRegion="polite"
      style={{ alignItems: "center", gap: space.s, padding: space.l }}
    >
      <Glyph icon={AlertCircleIcon} size={24} color={colors["neutral-6"]} />
      <View style={{ alignItems: "center", gap: space.xxs }}>
        <Text weight="medium" style={{ textAlign: "center" }}>
          {title}
        </Text>
        {description ? (
          <Text size="s" tone="muted" style={{ textAlign: "center" }}>
            {description}
          </Text>
        ) : null}
      </View>
      {onRetry ? (
        <Button
          variant="secondary"
          onPress={onRetry}
          loading={retrying}
          style={{ alignSelf: "center" }}
        >
          {m.action_retry()}
        </Button>
      ) : null}
    </View>
  );
}
