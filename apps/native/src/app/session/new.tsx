import type { SessionPlace } from "@repo/client/sessions/types";
import { LogbookIcon, PinIcon, WaveIcon } from "@repo/ui/icon";
import { router, useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { View } from "react-native";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { PlacePicker } from "@/components/sessions/place-picker";
import { useSessionDraft } from "@/components/sessions/session-draft";
import { SessionFields, SizesStep, StepHeader } from "@/components/sessions/session-form";
import { placeOfParam, usePlaceName } from "@/components/sessions/session-place";
import { useNearestPlace } from "@/components/sessions/use-nearest";
import { useMediaStatus, useSessionWrites } from "@/components/sessions/use-sessions";
import { EmptyState } from "@/components/ui/empty-state";
import { Row, Section } from "@/components/ui/list";
import { SheetHeader, useSheetGuard } from "@/components/ui/sheet";
import { Loading, Skeleton } from "@/components/ui/skeleton";
import { useAccount } from "@/lib/account";
import { useTheme } from "@/lib/theme";
import { m } from "@/paraglide/messages";

type Params = {
  // Where it was, `<break|spot>:<id>`, when it was begun at a place.
  place?: string;
  // The place's name, when whoever opened the sheet knew it: else the API is asked.
  name?: string;
};

type Step = "form" | "where" | "sizes";

/** What stands in for the form while the phone says where it is. */
function FormSkeleton() {
  const { space } = useTheme();
  return (
    <Loading>
      <View style={{ gap: space.l, padding: space.m }}>
        <Skeleton height={56} />
        <Skeleton height={220} />
        <Skeleton height={96} />
      </View>
    </Loading>
  );
}

/**
 * Logs a session: where, at `?place=` or the place nearest the phone among the account's spots and
 * the breaks it looked at last, else asked by a search; then when, how long, how big, how it was,
 * its photos and videos and a few words. Its sheet has Cancel and Save, and asks before what was
 * written is lost. The web's `SessionSheet` does the same. Decisions 040 and 043.
 */
export default function NewSession() {
  const params = useLocalSearchParams<Params>();
  const { colors, space } = useTheme();
  const insets = useSafeAreaInsets();
  const { signedIn, pending } = useAccount();
  const [now] = useState(Date.now);

  const asked = placeOfParam(params.place);
  const askedName = usePlaceName(asked, params.name);
  const nearest = useNearestPlace(asked === null && signedIn);
  // The place chosen in the sheet, which wins over the one it was begun at or found near.
  const [picked, setPicked] = useState<SessionPlace | null>(null);
  const place: (Pick<SessionPlace, "kind" | "id"> & { name?: string }) | null =
    picked ?? (asked ? { ...asked, name: askedName } : null) ?? nearest.place;
  const isNear = picked === null && asked === null && nearest.place !== null;

  // The step the sheet is at: chosen, or else the form once a place is known, the search when the
  // phone said nothing near, and a moment of waiting while it is asked.
  const [chosenStep, setChosenStep] = useState<Step | null>(null);
  const step: Step | "waiting" =
    chosenStep ?? (place ? "form" : nearest.settled ? "where" : "waiting");

  const drafting = useSessionDraft(undefined, undefined, now);
  const mediaStatus = useMediaStatus();
  const writes = useSessionWrites();
  const { close, cancel } = useSheetGuard(drafting.isDirty);
  const canSave = place !== null && !drafting.isAhead && !drafting.isAsking;

  async function save() {
    if (!place || !canSave || writes.isSaving) return;
    const kept = await writes.add(
      { kind: place.kind, id: place.id, name: place.name ?? "" },
      drafting.draft,
    );
    if (kept) close();
  }

  if (!signedIn) {
    return (
      <View style={{ flex: 1, backgroundColor: colors["neutral-1"] }}>
        <SheetHeader title={m.session_new()} onCancel={() => router.back()} />
        {pending ? (
          <FormSkeleton />
        ) : (
          <EmptyState
            icon={LogbookIcon}
            title={m.auth_reason_add_session()}
            description={m.session_sign_in_prompt()}
            action={{
              label: m.auth_sign_in(),
              onPress: () =>
                router.replace({
                  pathname: "/sign-in",
                  params: { reason: m.auth_reason_add_session(), next: "/session/new" },
                }),
            }}
          />
        )}
      </View>
    );
  }

  if (step === "where") {
    return (
      <View style={{ flex: 1, backgroundColor: colors["neutral-1"] }}>
        <StepHeader
          title={m.session_where()}
          // With no place yet, the way back leaves the sheet; else it goes back to the form.
          backLabel={place ? undefined : m.action_cancel()}
          onBack={place ? () => setChosenStep("form") : cancel}
        />
        <KeyboardAwareScrollView
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{ padding: space.m, paddingBottom: insets.bottom + space.xl }}
        >
          <PlacePicker
            near={nearest.phone}
            onPick={(found) => {
              setPicked(found);
              setChosenStep("form");
            }}
          />
        </KeyboardAwareScrollView>
      </View>
    );
  }

  if (step === "sizes") {
    return (
      <View style={{ flex: 1, backgroundColor: colors["neutral-1"] }}>
        <SizesStep
          waves={drafting.waveSize}
          sets={drafting.setSize}
          onBack={() => setChosenStep("form")}
          onDone={(waves, sets) => {
            drafting.setSizes(waves, sets);
            setChosenStep("form");
          }}
        />
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors["neutral-1"] }}>
      <SheetHeader
        title={m.session_new()}
        onCancel={cancel}
        onSave={() => void save()}
        canSave={canSave}
        saving={writes.isSaving}
      />
      {step === "waiting" ? (
        <FormSkeleton />
      ) : (
        <KeyboardAwareScrollView
          keyboardShouldPersistTaps="handled"
          bottomOffset={space.l}
          contentContainerStyle={{
            gap: space.l,
            padding: space.m,
            paddingBottom: insets.bottom + space.xl,
          }}
        >
          <Section>
            {place?.name ? (
              <Row
                icon={place.kind === "spot" ? PinIcon : WaveIcon}
                title={place.name}
                description={isNear ? m.native_session_place_near() : undefined}
                accessibilityHint={m.native_session_place_change()}
                onPress={() => setChosenStep("where")}
                disabled={writes.isSaving}
              />
            ) : (
              <View style={{ padding: space.m }}>
                <Skeleton height={24} width="60%" />
              </View>
            )}
          </Section>
          <SessionFields
            drafting={drafting}
            now={now}
            disabled={writes.isSaving}
            mediaStatus={mediaStatus.data}
            onSizes={() => setChosenStep("sizes")}
          />
        </KeyboardAwareScrollView>
      )}
    </View>
  );
}
