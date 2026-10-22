import { View } from "react-native";

import { Button } from "@/components/ui/button";
import { Text } from "@/components/ui/text";
import { useTheme } from "@/lib/theme";
import { m } from "@/paraglide/messages";

// What a tab of a place says while what it shows cannot be had, as the web's panel says it: a
// line of the small muted type from the start of the line, where the screens of the app would
// draw a centred state with an icon, which the web keeps for a whole screen.

/**
 * What could not be loaded, in the tab's own words, and a press that asks again where the web
 * offers one; otherwise the tab is pulled to be read again. A screen reader is told as it comes.
 */
export function TabFailure({
  text,
  onRetry,
  retrying = false,
}: {
  text: string;
  onRetry?: () => void;
  retrying?: boolean;
}) {
  const { space } = useTheme();
  return (
    <View style={{ gap: space.s, alignItems: "flex-start" }}>
      <Text size="s" tone="muted" accessibilityRole="alert" accessibilityLiveRegion="polite">
        {text}
      </Text>
      {onRetry ? (
        <Button variant="secondary" onPress={onRetry} loading={retrying}>
          {m.action_retry()}
        </Button>
      ) : null}
    </View>
  );
}
