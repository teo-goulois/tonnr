import { DIRECTIONS_APPS, type DirectionsApp, directionsUrl } from "@repo/client/directions";
import { APP_NAME } from "@repo/config/app";
import { BellIcon, GlobalIcon, MapPinIcon, PenIcon, ShareIcon, TrashIcon } from "@repo/ui/icon";
import * as WebBrowser from "expo-web-browser";
import { router } from "expo-router";
import { useEffect, useState } from "react";
import { Alert, BackHandler, Linking, Platform, ScrollView, Share, View } from "react-native";
import { KeyboardAvoidingView } from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Button } from "@/components/ui/button";
import { feel } from "@/components/ui/haptics";
import { Row, Section } from "@/components/ui/list";
import { Text } from "@/components/ui/text";
import { ENV } from "@/env";
import { useRequireAccount } from "@/lib/require-account";
import { useTheme } from "@/lib/theme";
import { m } from "@/paraglide/messages";
import { baseLocale, getLocale } from "@/paraglide/runtime";

import { placeLink, shareContent, siteLink } from "./place-link";
import { StepHeader } from "./save-lists";
import type { PlaceKind } from "./tabs";
import { TextField } from "./text-field";
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

// A spot's name, and the word for the moderator, as long as the API takes them.
const NAME_MOST = 80;
const NOTE_MOST = 280;

type Step = "menu" | "rename" | "publish";

export function PlaceMenu({ kind, id }: { kind: PlaceKind; id: string }) {
  const { space } = useTheme();
  const insets = useSafeAreaInsets();
  const requireAccount = useRequireAccount();
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
  const languages = { site: ENV.EXPO_PUBLIC_SITE_URL, locale: getLocale(), baseLocale };

  const close = () => router.back();
  // What an alert is set on: a surf break of the catalogue, or a spot of the account's own.
  const alertPlace =
    kind === "break" && record.found ? `break:${id}` : spot ? `spot:${id}` : undefined;
  const shared =
    kind === "break" ? { breakId: id } : kind === "station" ? { stationId: id } : undefined;

  async function share() {
    if (!shared) return;
    const url = placeLink(shared, languages);
    try {
      await Share.share(
        shareContent(
          { title, text: m.place_share_text({ name: title, app: APP_NAME }), url },
          Platform.OS,
        ),
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

  function askDelete() {
    if (!spot) return;
    feel("warn");
    Alert.alert(
      m.spot_delete_title({ name: spot.name }),
      status === "accepted" ? m.spot_delete_text_public() : m.spot_delete_text(),
      [
        { text: m.action_cancel(), style: "cancel" },
        {
          text: m.action_delete(),
          style: "destructive",
          // The spot's sheet goes with it.
          onPress: () => actions.remove(spot, () => router.dismissAll()),
        },
      ],
    );
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
          <TextField
            label={m.spot_name_label()}
            value={name}
            onChangeText={setName}
            maxLength={NAME_MOST}
            autoFocus
            selectTextOnFocus
            autoComplete="off"
            returnKeyType="done"
            onSubmitEditing={save}
          />
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
            <TextField
              label={m.spot_publish_note()}
              placeholder={m.spot_publish_note_placeholder()}
              value={note}
              onChangeText={setNote}
              maxLength={NOTE_MOST}
              multiline
              editable={!actions.isPublishing}
            />
          </View>
          <Text size="s" tone="muted">
            {m.spot_publish_license()}{" "}
            <Text
              size="s"
              tone="muted"
              accessibilityRole="link"
              onPress={() => void WebBrowser.openBrowserAsync(siteLink("/terms", languages))}
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
        {(alertPlace || shared) && (
          <Section>
            {alertPlace ? (
              <Row
                title={m.alert_create()}
                icon={BellIcon}
                onPress={() => {
                  const next = `/alert/new?place=${encodeURIComponent(alertPlace)}`;
                  requireAccount(m.auth_reason_add_alert(), () => router.replace(next), next);
                }}
              />
            ) : null}
            {shared ? (
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
              onPress={askDelete}
            />
          </Section>
        )}
      </ScrollView>
    </View>
  );
}
