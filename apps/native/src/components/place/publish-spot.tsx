import { router } from "expo-router";
import { useState } from "react";
import { Platform, ScrollView, View } from "react-native";
import { KeyboardAvoidingView } from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useOpenPage } from "@/components/account/open-page";
import { TextField } from "@/components/lists/text-field";
import { Button } from "@/components/ui/button";
import { Surface } from "@/components/ui/surface";
import { Text } from "@/components/ui/text";
import { useTheme } from "@/lib/theme";
import { m } from "@/paraglide/messages";

import { StepHeader } from "./save-lists";
import { usePlaceRecord } from "./use-place";
import { useSpotActions } from "./use-spot";

// Asking that a spot of the account's own be made public, with a word for the moderator, in a
// sheet that the spot's menu opens, as the web's `SpotActions` asks it in a dialog: what it means,
// the word, the licence the spot then takes, and the request sent or not. Decision 034.

// The word for the moderator, as long as the API takes it.
const NOTE_MOST = 280;

export function PublishSpot({ id }: { id: string }) {
  const { space, type } = useTheme();
  const insets = useSafeAreaInsets();
  const { openPage } = useOpenPage();
  const { spot: read, isOwner } = usePlaceRecord("spot", id);
  const spot = isOwner ? read : undefined;
  const actions = useSpotActions();
  // The word written before, when the spot was asked for once.
  const [note, setNote] = useState<string>();
  const written = note ?? spot?.publication?.note ?? "";
  const close = () => router.back();

  if (!spot) return null;
  return (
    <KeyboardAvoidingView behavior="padding" enabled={Platform.OS === "android"}>
      <StepHeader title={m.spot_publish_title({ name: spot.name })} />
      <ScrollView
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{
          gap: space.m,
          paddingTop: space.s,
          paddingHorizontal: space.m,
          paddingBottom: insets.bottom + space.m,
        }}
      >
        <Text size="s">{m.spot_publish_what()}</Text>
        <Text size="s" tone="muted">
          {m.spot_publish_then()}
        </Text>
        <View style={{ gap: space.xs }}>
          <Text size="s" weight="medium">
            {m.spot_publish_note()}
          </Text>
          <Surface insetEdge>
            <TextField
              accessibilityLabel={m.spot_publish_note()}
              placeholder={m.spot_publish_note_placeholder()}
              value={written}
              onChangeText={setNote}
              maxLength={NOTE_MOST}
              multiline
              textAlignVertical="top"
              editable={!actions.isPublishing}
              style={{
                flex: 0,
                minHeight: 96,
                paddingHorizontal: space.m,
                paddingVertical: space.s,
                lineHeight: type.m.line,
              }}
            />
          </Surface>
        </View>
        <Text size="s" tone="muted">
          {m.spot_publish_license()}{" "}
          <Text
            size="s"
            tone="muted"
            accessibilityRole="link"
            onPress={() => void openPage("terms")}
            style={{ textDecorationLine: "underline" }}
          >
            {m.terms_title()}
          </Text>
        </Text>
        {/* The web's dialog ends on its two buttons, the one that sends last. */}
        <View
          style={{
            flexDirection: "row",
            flexWrap: "wrap",
            justifyContent: "flex-end",
            gap: space.xs,
          }}
        >
          <Button variant="ghost" onPress={close} disabled={actions.isPublishing}>
            {m.action_cancel()}
          </Button>
          <Button
            loading={actions.isPublishing}
            onPress={() => actions.publish(spot, written.trim(), close)}
          >
            {m.spot_publish_send()}
          </Button>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
