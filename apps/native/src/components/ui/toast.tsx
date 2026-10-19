import { AlertCircleIcon, CircleCheckIcon } from "@repo/ui/icon";
import { Toast as HeroToast, type ToastComponentProps, useToast } from "heroui-native";
import { useCallback } from "react";
import { AccessibilityInfo, View } from "react-native";

import { Glyph } from "@/components/shared/glyph";
import { useTheme } from "@/lib/theme";

import { Button } from "./button";
import { edge } from "./edge";
import { feel } from "./haptics";
import { Text } from "./text";

// The one way to tell something briefly: HeroUI Native's toast, which stacks, leaves when
// swiped and stands over a sheet, drawn as the web's Sonner is in the theme, on the surface with
// its edge and the theme's larger radius. It comes from the top, where a phone tells what
// happened, clear of the bar of tabs. A screen reader reads it as it comes, and what went well
// or wrong is felt.

export type Told = {
  title: string;
  description?: string;
  /** What happened: done, failed, or said. */
  tone?: "default" | "success" | "danger";
  /** One thing to do about it: undo, open. */
  action?: { label: string; onPress: () => void };
  /** How long it stays, in milliseconds. */
  duration?: number;
};

/** Tells something briefly. Returns what hides it again. */
export function useTell() {
  const { toast } = useToast();
  return useCallback(
    (told: Told) => {
      if (told.tone === "success") feel("done");
      if (told.tone === "danger") feel("failed");
      AccessibilityInfo.announceForAccessibility(
        told.description ? `${told.title}. ${told.description}` : told.title,
      );
      const id = toast.show({
        duration: told.duration ?? 4000,
        component: (props) => <ToldToast {...props} told={told} />,
      });
      return () => toast.hide(id);
    },
    [toast],
  );
}

function ToldToast({ told, ...props }: ToastComponentProps & { told: Told }) {
  const { colors, space, radius } = useTheme();
  const icon =
    told.tone === "success" ? CircleCheckIcon : told.tone === "danger" ? AlertCircleIcon : null;

  return (
    <HeroToast
      {...props}
      placement="top"
      style={[
        {
          backgroundColor: colors["neutral-1"],
          borderRadius: radius.m,
          borderCurve: "continuous",
          padding: space.m,
        },
        // The toast clips what it holds: its edge is drawn inside.
        edge(colors["neutral-5-transparent"], { inset: true }),
      ]}
    >
      <View style={{ flexDirection: "row", alignItems: "center", gap: space.s }}>
        {icon ? (
          <Glyph
            icon={icon}
            size={16}
            color={told.tone === "danger" ? colors.error : colors["neutral-10"]}
          />
        ) : null}
        <View accessible style={{ flex: 1 }}>
          <Text weight="medium">{told.title}</Text>
          {told.description ? (
            <Text size="s" tone="muted">
              {told.description}
            </Text>
          ) : null}
        </View>
        {told.action ? (
          <Button
            variant="secondary"
            onPress={() => {
              told.action?.onPress();
              props.hide(props.id);
            }}
          >
            {told.action.label}
          </Button>
        ) : null}
      </View>
    </HeroToast>
  );
}
