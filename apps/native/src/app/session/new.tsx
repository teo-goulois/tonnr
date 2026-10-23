import type { SessionPlace } from "@repo/client/sessions/types";
import { useLocalSearchParams } from "expo-router";
import { useEffect, useState } from "react";
import { BackHandler, View } from "react-native";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { AccountPrompt } from "@/components/auth/account-prompt";
import { DurationStep } from "@/components/sessions/duration-field";
import { timedOf } from "@/components/sessions/live-logic";
import { PlacePicker } from "@/components/sessions/place-picker";
import { SessionForm, useSessionForm } from "@/components/sessions/session-form";
import { placeOfParam, usePlaceName } from "@/components/sessions/session-place";
import { SizesStep } from "@/components/sessions/surf-size";
import { useNearestPlace } from "@/components/sessions/use-nearest";
import { useMediaStatus, useSessionWrites } from "@/components/sessions/use-sessions";
import { FormScroll } from "@/components/ui/form";
import { PanelHeader, SheetRoot, useSheetGuard } from "@/components/ui/sheet";
import { Loading, Skeleton } from "@/components/ui/skeleton";
import { useAccount } from "@/lib/account";
import { forgetLiveSession } from "@/lib/live-session";
import { useTheme } from "@/lib/theme";
import { m } from "@/paraglide/messages";

type Params = {
  // Where it was, `<break|spot>:<id>`, when it was begun at a place.
  place?: string;
  // The place's name, when whoever opened the sheet knew it: else the API is asked.
  name?: string;
  // A session timed while it lasted (decision 074): its start, its length once it was ended,
  // and `live`, which forgets it on the phone once it is written or dropped.
  start?: string;
  minutes?: string;
  live?: string;
};

/** A place a session is written at, its name undefined while the API is asked it. */
type AtPlace = Pick<SessionPlace, "kind" | "id"> & { name?: string | undefined };

/** What stands in for the form while the phone says where it is: the box, the note, the button. */
function FormSkeleton() {
  const { space, type } = useTheme();
  return (
    <Loading>
      <View style={{ gap: space.m, padding: space.m }}>
        <Skeleton height={4 * 56} />
        <Skeleton height={82} />
        <Skeleton height={type.m.line + 2 * space.xs} />
      </View>
    </Loading>
  );
}

/**
 * Where a session was, as the web's sheet asks it with its search, under its head: "New session",
 * and the question under it. A chevron goes back to the form when there is one to go back to, as
 * Android's back does.
 */
function WhereStep({
  near,
  onPick,
  onBack,
  onClose,
}: {
  near: { latitude: number; longitude: number } | null;
  onPick: (place: SessionPlace) => void;
  onBack?: () => void;
  onClose: () => void;
}) {
  const { colors, space } = useTheme();
  const insets = useSafeAreaInsets();

  useEffect(() => {
    if (!onBack) return;
    const listener = BackHandler.addEventListener("hardwareBackPress", () => {
      onBack();
      return true;
    });
    return () => listener.remove();
  }, [onBack]);

  return (
    <SheetRoot style={{ flex: 1, backgroundColor: colors["neutral-1"] }}>
      <PanelHeader
        title={m.session_new()}
        description={m.session_where()}
        onBack={onBack}
        onClose={onClose}
      />
      <KeyboardAwareScrollView
        style={{ flex: 1 }}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ padding: space.m, paddingBottom: insets.bottom + space.xl }}
      >
        <PlacePicker near={near} onPick={onPick} />
      </KeyboardAwareScrollView>
    </SheetRoot>
  );
}

type NewSessionSheetProps = {
  place: AtPlace;
  now: number;
  timed: ReturnType<typeof timedOf>;
  isLive: boolean;
  near: { latitude: number; longitude: number } | null;
  /** Another place: the form starts over there. */
  onPlace: (place: SessionPlace) => void;
};

/**
 * The form of a new session at its place, under the web drawer's head: "New session", the place
 * under it, a chevron that asks where again, and the cross, which asks before what was written is
 * lost. How big the waves looked, a length of one's own and where it was are steps of the sheet.
 */
function NewSessionSheet({ place, now, timed, isLive, near, onPlace }: NewSessionSheetProps) {
  const { colors, space } = useTheme();
  const insets = useSafeAreaInsets();
  const mediaStatus = useMediaStatus();
  const writes = useSessionWrites();
  const [step, setStep] = useState<"form" | "where" | "sizes" | "duration">("form");
  const forming = useSessionForm({
    now,
    timed,
    onSave: async (draft) => {
      const kept = await writes.add(
        { kind: place.kind, id: place.id, name: place.name ?? "" },
        draft,
      );
      if (!kept) return;
      if (isLive) await forgetLiveSession();
      close();
    },
  });
  const { form } = forming;
  const { close, cancel } = useSheetGuard(forming.isDirty, () => {
    if (isLive) void forgetLiveSession();
  });
  const toForm = () => setStep("form");

  if (step === "where") {
    return (
      <WhereStep
        near={near}
        onBack={toForm}
        onClose={cancel}
        onPick={(found) => {
          // The same place keeps what was written; another starts the form over, as the web's.
          if (found.kind === place.kind && found.id === place.id) toForm();
          else onPlace(found);
        }}
      />
    );
  }
  if (step === "sizes") {
    const sizes = form.getFieldValue("sizes");
    return (
      <SheetRoot style={{ flex: 1, backgroundColor: colors["neutral-1"] }}>
        <SizesStep
          waves={sizes.waves}
          sets={sizes.sets}
          onClose={toForm}
          onDone={(waves, sets) => {
            form.setFieldValue("sizes", { waves, sets });
            toForm();
          }}
        />
      </SheetRoot>
    );
  }
  if (step === "duration") {
    return (
      <SheetRoot style={{ flex: 1, backgroundColor: colors["neutral-1"] }}>
        <DurationStep
          value={form.getFieldValue("minutes")}
          onClose={toForm}
          onDone={(minutes) => {
            form.setFieldValue("minutes", minutes);
            toForm();
          }}
        />
      </SheetRoot>
    );
  }

  return (
    <SheetRoot style={{ flex: 1, backgroundColor: colors["neutral-1"] }}>
      <PanelHeader
        title={m.session_new()}
        // The place's name, which pulses while the API is asked it.
        description={place.name ?? null}
        onBack={() => {
          if (!writes.isSaving) setStep("where");
        }}
        onClose={cancel}
      />
      <FormScroll
        style={{ flex: 1 }}
        contentContainerStyle={{ padding: space.m, paddingBottom: insets.bottom + space.xl }}
      >
        <SessionForm
          forming={forming}
          now={now}
          saving={writes.isSaving}
          disabled={writes.isSaving}
          mediaStatus={mediaStatus.data}
          submitLabel={m.session_save()}
          onSizes={() => setStep("sizes")}
          onDuration={() => setStep("duration")}
        />
      </FormScroll>
    </SheetRoot>
  );
}

/**
 * Logs a session: where, at `?place=` or the place nearest the phone among the account's spots and
 * the breaks it looked at last, else asked by a search; then when, how long, how big, its photos
 * and videos, how it was and a few words, sent by "Add to the log" at the end of the form. The
 * web's `SessionSheet` does the same, under the same head, and a visitor is asked for an account
 * in the same words. Another place starts the form over. Decisions 040 and 043. A session timed
 * while it lasted opens it with its start and its length, `?start=` and `?minutes=`, and is
 * forgotten on the phone once it is saved or dropped (decision 074).
 */
export default function NewSession() {
  const params = useLocalSearchParams<Params>();
  const { colors, space } = useTheme();
  const { signedIn, pending } = useAccount();
  const [now] = useState(Date.now);

  const asked = placeOfParam(params.place);
  const askedName = usePlaceName(asked, params.name);
  const nearest = useNearestPlace(asked === null && signedIn);
  // The place chosen in the sheet, which wins over the one it was begun at or found near.
  const [picked, setPicked] = useState<SessionPlace | null>(null);
  const place: AtPlace | null =
    picked ?? (asked ? { ...asked, name: askedName } : null) ?? nearest.place;

  const isLive = params.live === "1";
  const [timed] = useState(() => timedOf(params, now));
  // Before a place is known, only a session timed while it lasted holds something: its time.
  const { cancel } = useSheetGuard(isLive && signedIn && place === null, () => {
    void forgetLiveSession();
  });

  if (!signedIn) {
    return (
      <View style={{ flex: 1, backgroundColor: colors["neutral-1"] }}>
        <PanelHeader title={m.session_new()} onClose={cancel} />
        {pending ? (
          <FormSkeleton />
        ) : (
          <View style={{ padding: space.m }}>
            {/* Once signed in, the sign-in sheet goes back to this one, which then holds the
                form where it was begun: a `next` would put a second one over it. */}
            <AccountPrompt text={m.session_sign_in_prompt()} />
          </View>
        )}
      </View>
    );
  }

  if (place === null) {
    // A moment, while the phone says where it is.
    if (!nearest.settled) {
      return (
        <View style={{ flex: 1, backgroundColor: colors["neutral-1"] }}>
          <PanelHeader title={m.session_new()} description={null} onClose={cancel} />
          <FormSkeleton />
        </View>
      );
    }
    return <WhereStep near={nearest.phone} onPick={setPicked} onClose={cancel} />;
  }

  return (
    <NewSessionSheet
      // Another place starts its form over, as the web's.
      key={`${place.kind} ${place.id}`}
      place={place}
      now={now}
      timed={timed}
      isLive={isLive}
      near={nearest.phone}
      onPlace={setPicked}
    />
  );
}
