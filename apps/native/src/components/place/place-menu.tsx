import { DIRECTIONS_APPS, type DirectionsApp, directionsUrl } from "@repo/client/directions";
import { APP_NAME } from "@repo/config/app";
import { BellIcon, GlobalIcon, MapPinIcon, PenIcon, ShareIcon, TrashIcon } from "@repo/ui/icon";
import { router } from "expo-router";
import { useEffect, useState } from "react";
import { BackHandler, Linking, Platform, ScrollView, Share, View } from "react-native";
import { KeyboardAvoidingView } from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useOpenPage } from "@/components/account/open-page";
import { placeLinkOf } from "@/components/lists/links";
import { TextField } from "@/components/lists/text-field";
import { NAME_MOST } from "@/components/map/new-spot";
import { confirmDestructive } from "@/components/saved/confirm";
import { Button } from "@/components/ui/button";
import { Row, Section } from "@/components/ui/list";
import { Surface } from "@/components/ui/surface";
import { Text } from "@/components/ui/text";
import { ENV } from "@/env";
import type { Route } from "@/lib/links";
import { useRequireAccount } from "@/lib/require-account";
import { useTheme } from "@/lib/theme";
import { m } from "@/paraglide/messages";
import { getLocale } from "@/paraglide/runtime";

import { StepHeader } from "./save-lists";
import type { PlaceKind } from "./tabs";
import { usePlaceRecord } from "./use-place";
import { useSpotActions } from "./use-spot";

// What is seldom done with a place, in one sheet, as the web's `PlaceMenu` and `SpotActions` hold
// it: begin an alert there (decision 064), send its short address through the platform's share
// sheet (decision 056), go there with a map app, and for a spot of the account's own, rename it,
// move it, ask that it be made public or take the request back, and delete it (decision 034).
// Renaming and asking are a second step of the same sheet, and deleting is asked first.

// An app's name, which its maker gives it in each language.
const APP_NAMES: Record<DirectionsApp, () => string> = {
  apple: m.directions_apple,
  google: () => "Google Maps",
  waze: () => "Waze",
};
// Apple's maps live on Apple's phones: elsewhere their address opens a page.
const APPS = DIRECTIONS_APPS.filter((app) => app !== "apple" || Platform.OS === "ios");

// The word for the moderator, as long as the API takes it.
const NOTE_MOST = 280;

type Step = "menu" | "rename" | "publish";

export function PlaceMenu({ kind, id }: { kind: PlaceKind; id: string }) {
  const { space, type } = useTheme();
  const insets = useSafeAreaInsets();
  const requireAccount = useRequireAccount();
  const { openPage } = useOpenPage();
  const record = usePlaceRecord(kind, id);
  const actions = useSpotActions();
  const [step, setStep] = useState<Step>("menu");
  const [name, setName] = useState("");
  const [note, setNote] = useState("");
  // Android's back goes from a second step to the menu, as the button over it does.
  useEffect(() => {
    if (step === "menu") return;
    const listener = BackHandler.addEventListener("hardwareBackPress", () => {
      setStep("menu");
      return true;
    });
    return () => listener.remove();
  }, [step]);
  const title = record.name ?? "";
  const spot = record.isOwner ? record.spot : undefined;
  const status = spot?.publication?.status;

  const close = () => router.back();
  // What an alert is set on: a surf break of the catalogue, or a spot of the account's own.
  const alertPlace =
    kind === "break" && record.found ? `break:${id}` : spot ? `spot:${id}` : undefined;
  // A spot of an account's own is sent in a shared list, never by an address of its own.
  const url = placeLinkOf(ENV.EXPO_PUBLIC_SITE_URL, getLocale(), { kind, id });

  async function share() {
    if (!url) return;
    const text = m.place_share_text({ name: title, app: APP_NAME });
    try {
      // iOS shows the address apart, as a link. Android takes one text, which ends with it.
      await Share.share(
        Platform.OS === "ios"
          ? { title, message: text, url }
          : { title, message: `${text}\n${url}` },
      );
      close();
    } catch {
      // Whoever closes the sheet without sending has done nothing wrong.
    }
  }

  function directions(app: DirectionsApp) {
    if (!record.point) return;
    // A web address that the app answers when it is installed, and its site when it is not.
    Linking.openURL(directionsUrl(app, record.point)).then(close, () => {});
  }

  async function askDelete() {
    if (!spot) return;
    const sure = await confirmDestructive({
      title: m.spot_delete_title({ name: spot.name }),
      message: status === "accepted" ? m.spot_delete_text_public() : m.spot_delete_text(),
      confirm: m.action_delete(),
    });
    // The spot's sheet goes with it.
    if (sure) actions.remove(spot, () => router.dismissAll());
  }

  const padding = { paddingHorizontal: space.m, paddingBottom: insets.bottom + space.m };

  if (step === "rename" && spot) {
    const renamed = name.trim();
    const save = () => {
      if (!renamed || renamed === spot.name || actions.isChanging) return;
      actions.rename(spot, renamed, close);
    };
    return (
      <KeyboardAvoidingView behavior="padding" enabled={Platform.OS === "android"}>
        <StepHeader
          title={m.native_spot_rename_title({ name: spot.name })}
          onBack={() => setStep("menu")}
        />
        <View style={{ gap: space.m, paddingTop: space.s, ...padding }}>
          <Surface insetEdge style={{ paddingHorizontal: space.m }}>
            <TextField
              accessibilityLabel={m.spot_name_label()}
              placeholder={m.spot_name_placeholder()}
              value={name}
              onChangeText={setName}
              maxLength={NAME_MOST}
              autoFocus
              selectTextOnFocus
              autoComplete="off"
              autoCapitalize="words"
              returnKeyType="done"
              submitBehavior="blurAndSubmit"
              onSubmitEditing={save}
              style={{ flex: 0 }}
            />
          </Surface>
          <Button
            fill
            onPress={save}
            disabled={!renamed || renamed === spot.name}
            loading={actions.isChanging}
          >
            {m.spot_edit_save()}
          </Button>
        </View>
      </KeyboardAvoidingView>
    );
  }

  if (step === "publish" && spot) {
    return (
      <KeyboardAvoidingView behavior="padding" enabled={Platform.OS === "android"}>
        <StepHeader
          title={m.spot_publish_title({ name: spot.name })}
          onBack={() => setStep("menu")}
        />
        <ScrollView
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{ gap: space.m, paddingTop: space.s, ...padding }}
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
                value={note}
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
          <Button
            fill
            loading={actions.isPublishing}
            onPress={() => actions.publish(spot, note.trim(), close)}
          >
            {m.spot_publish_send()}
          </Button>
        </ScrollView>
      </KeyboardAvoidingView>
    );
  }

  return (
    <View>
      <StepHeader title={title} onClose={close} />
      <ScrollView contentContainerStyle={{ gap: space.l, paddingTop: space.s, ...padding }}>
        {(alertPlace || url) && (
          <Section>
            {alertPlace ? (
              <Row
                title={m.alert_create()}
                icon={BellIcon}
                onPress={() => {
                  const next = `/alert/new?place=${encodeURIComponent(alertPlace)}` as Route;
                  requireAccount(m.auth_reason_add_alert(), () => router.replace(next), next);
                }}
              />
            ) : null}
            {url ? (
              <Row title={m.place_share()} icon={ShareIcon} chevron={false} onPress={share} />
            ) : null}
          </Section>
        )}
        {/* A station has no way to it: the sea is read there, not surfed. */}
        {kind !== "station" && record.point && (
          <Section title={m.directions_choose()}>
            {APPS.map((app) => (
              <Row
                key={app}
                title={APP_NAMES[app]()}
                chevron={false}
                onPress={() => directions(app)}
              />
            ))}
          </Section>
        )}
        {spot && (
          <Section>
            <Row
              title={m.native_spot_rename()}
              icon={PenIcon}
              onPress={() => {
                setName(spot.name);
                setStep("rename");
              }}
            />
            <Row
              title={m.native_spot_move()}
              icon={MapPinIcon}
              onPress={() => router.replace({ pathname: "/place/move", params: { id: spot.id } })}
            />
            {status === "pending" ? (
              <Row
                title={m.spot_publish_cancel()}
                icon={GlobalIcon}
                chevron={false}
                disabled={actions.isPublishing}
                onPress={() => actions.cancelPublication(spot, close)}
              />
            ) : status !== "accepted" ? (
              // A spot that is public already is not asked for again.
              <Row
                title={m.spot_publish()}
                icon={GlobalIcon}
                onPress={() => {
                  setNote(spot.publication?.note ?? "");
                  setStep("publish");
                }}
              />
            ) : null}
            <Row
              title={m.action_delete()}
              icon={TrashIcon}
              destructive
              chevron={false}
              disabled={actions.isRemoving}
              onPress={() => void askDelete()}
            />
          </Section>
        )}
      </ScrollView>
    </View>
  );
}
