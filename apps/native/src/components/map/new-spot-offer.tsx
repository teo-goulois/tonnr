import { router } from "expo-router";
import { useState } from "react";
import { type StyleProp, View, type ViewStyle } from "react-native";

import { useAlerts } from "@/components/alerts/use-alerts";
import { askToDescribe } from "@/components/guides/describing";
import { usePlaceRecord } from "@/components/place/use-place";
import { placeParam } from "@/components/sessions/session-logic";
import { Button } from "@/components/ui/button";
import { edge } from "@/components/ui/edge";
import { Text } from "@/components/ui/text";
import { useTheme } from "@/lib/theme";
import { m } from "@/paraglide/messages";

// What a spot just added offers its owner, at the top of its sheet, as the web's `SpotPanel` offers
// it: a spot is saved with a point and a name, and the rest may wait. First to describe it, then,
// once that is answered, an alert there, unless it has one. The sheet opens on it by
// `?new=1`, which the screen that adds a spot gives it. Decisions 006 and 031.

/** A line that offers one thing, with what does it and what puts it off: the web's offer. */
export function Offer({
  text,
  action,
  onAction,
  onLater,
  style,
}: {
  text: string;
  action: string;
  onAction: () => void;
  onLater: () => void;
  style?: StyleProp<ViewStyle>;
}) {
  const { colors, space, radius } = useTheme();
  return (
    <View
      style={[
        {
          alignItems: "flex-start",
          gap: space.xs,
          padding: space.s,
          borderRadius: radius.s,
          borderCurve: "continuous",
          ...edge(colors["neutral-4"]),
        },
        style,
      ]}
    >
      <Text size="s">{text}</Text>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space.xs }}>
        {/* The web's small buttons, which a phone's screen draws at their full size. */}
        <Button variant="secondary" onPress={onAction}>
          {action}
        </Button>
        <Button variant="ghost" onPress={onLater}>
          {m.spot_later()}
        </Button>
      </View>
    </View>
  );
}

/**
 * The offers of a spot just added, while its sheet stays open: to describe it, which opens its
 * guide on what describes it, then an alert there. Its owner's alone.
 */
export function NewSpotOffer({
  id,
  onDescribe,
  style,
}: {
  id: string;
  onDescribe: () => void;
  // Where it stands in the sheet, which it takes only while it offers something.
  style?: StyleProp<ViewStyle>;
}) {
  const record = usePlaceRecord("spot", id);
  const { alerts } = useAlerts();
  const [step, setStep] = useState<"describe" | "alert" | "done">("describe");
  if (!record.isOwner || step === "done") return null;

  if (step === "describe") {
    return (
      <Offer
        text={m.spot_new_describe()}
        action={m.spot_guide_describe()}
        onAction={() => {
          setStep("alert");
          askToDescribe(id);
          onDescribe();
        }}
        onLater={() => setStep("alert")}
        style={style}
      />
    );
  }
  // A spot that has an alert, or whose alerts are not known yet, is offered none: the offer stays
  // until one is saved there or it is put off.
  const here = alerts?.filter((alert) => alert.spotIds.includes(id));
  if (!here || here.length > 0) return null;
  return (
    <Offer
      text={m.alert_offer()}
      action={m.alert_create()}
      onAction={() =>
        router.push({ pathname: "/alert/new", params: { place: placeParam({ kind: "spot", id }) } })
      }
      onLater={() => setStep("done")}
      style={style}
    />
  );
}
