import type { MediaItem, SessionDetail } from "@repo/client/viewer/types";
import { router, useLocalSearchParams } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { AccountPrompt } from "@/components/auth/account-prompt";
import { giveToSheet } from "@/components/map/open-place";
import { codeOf } from "@/components/lists/items";
import { DurationStep } from "@/components/sessions/duration-field";
import { SessionForm, useSessionForm } from "@/components/sessions/session-form";
import { askToDelete, sessionPlaceHref, sessionWhen } from "@/components/sessions/session-row";
import { SessionConditions, SessionCredits } from "@/components/sessions/session-sea";
import { SizesStep } from "@/components/sessions/surf-size";
import {
  useMediaStatus,
  useSessionDetail,
  useSessionWrites,
} from "@/components/sessions/use-sessions";
import { Button } from "@/components/ui/button";
import { ErrorState } from "@/components/ui/error-state";
import { FormScroll } from "@/components/ui/form";
import { askToDiscard, PanelHeader, SheetRoot, useSheetGuard } from "@/components/ui/sheet";
import { Loading, Skeleton } from "@/components/ui/skeleton";
import { useAccount } from "@/lib/account";
import { useTheme } from "@/lib/theme";
import { m } from "@/paraglide/messages";

type Props = {
  session: SessionDetail;
  // What it keeps of photos and videos: undefined while they are asked for.
  kept: readonly MediaItem[] | undefined;
};

/**
 * A session of the log, to be read and changed, under the web drawer's head: its place, and when
 * it was and how long under it. What the sea did comes first, then its form, whose "Save" keeps
 * the sheet open, then what opens its place and what deletes it, asked first in the platform's
 * dialog.
 */
function SessionSheet({ session, kept }: Props) {
  const { colors, space } = useTheme();
  const insets = useSafeAreaInsets();
  const [now] = useState(Date.now);
  const mediaStatus = useMediaStatus();
  const writes = useSessionWrites();
  const [step, setStep] = useState<"form" | "sizes" | "duration">("form");
  // The place is being opened, once the person said what was written could go.
  const [isOpening, setIsOpening] = useState(false);
  const forming = useSessionForm({
    session,
    kept,
    now,
    // The sheet stays, as the web's: it shows the session as it was saved.
    onSave: (_draft, changed) => writes.change(session, changed),
  });
  const { form } = forming;
  const { close, cancel } = useSheetGuard(forming.isDirty && !isOpening);
  const place = sessionPlaceHref(session);
  const busy = writes.isSaving || writes.isDeleting;
  const toForm = () => setStep("form");

  // The place opens over the map, as the web opens its address, once the guard let the sheet go:
  // given to the place's sheet that is open, which this one closes over, or in this sheet's place.
  useEffect(() => {
    if (isOpening && place && !giveToSheet(place)) router.replace(place);
  }, [isOpening, place]);

  async function openPlace() {
    if (busy || (forming.isDirty && !(await askToDiscard()))) return;
    setIsOpening(true);
  }

  async function remove() {
    if (busy || !(await askToDelete())) return;
    if (await writes.remove(session)) close();
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
        title={session.place.name}
        description={sessionWhen(session, now)}
        onClose={cancel}
      />
      <FormScroll
        style={{ flex: 1 }}
        contentContainerStyle={{
          gap: space.l,
          padding: space.m,
          paddingBottom: insets.bottom + space.xl,
        }}
      >
        {/* What a session of the log is opened for comes first: what the sea did. */}
        <View style={{ gap: space.s }}>
          <SessionConditions session={session} />
          {/* The models could not be asked when the session was written: they are asked again. */}
          {session.modelMissing === "unavailable" ? (
            <Button
              variant="secondary"
              onPress={() => void writes.change(session, {})}
              loading={writes.isSaving}
              style={{ alignSelf: "flex-start" }}
            >
              {m.session_sea_read()}
            </Button>
          ) : null}
        </View>

        <SessionForm
          forming={forming}
          now={now}
          saving={writes.isSaving}
          disabled={busy}
          mediaStatus={mediaStatus.data}
          submitLabel={m.session_save_changes()}
          onSizes={() => setStep("sizes")}
          onDuration={() => setStep("duration")}
          onOpenMedia={(item) =>
            router.push({ pathname: "/media/[id]", params: { id: item.id, session: session.id } })
          }
        />

        <View
          style={{ flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: space.xs }}
        >
          {place ? (
            <Button variant="secondary" onPress={() => void openPlace()} disabled={busy}>
              {m.session_open_place()}
            </Button>
          ) : null}
          <Button
            variant="ghost"
            onPress={() => void remove()}
            loading={writes.isDeleting}
            disabled={writes.isSaving}
          >
            {m.action_delete()}
          </Button>
        </View>

        <SessionCredits session={session} />
      </FormScroll>
    </SheetRoot>
  );
}

/** Leaves the sheet: back, or to the map when a link opened it with nothing under it. */
function leave() {
  if (router.canGoBack()) router.back();
  else router.replace("/");
}

/**
 * Reads a session of the log, with what the sea did while it lasted, and changes it or deletes
 * it, as the web's `SessionSheet` does: while it comes, its title and its lines pulse; a session
 * that is gone says so; a visitor is asked for an account in the web's words. The sheet asks
 * before what was changed is lost. Decisions 043 and 066.
 */
export default function SessionScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { colors, space, type } = useTheme();
  const { signedIn, pending } = useAccount();
  const { detail, media } = useSessionDetail(id);
  // A session deleted here stays drawn while its sheet leaves.
  const last = useRef(detail.data);
  if (detail.data) last.current = detail.data;
  const session = detail.data ?? last.current;

  if (session && signedIn) {
    // Another session starts its sheet over.
    return <SessionSheet key={session.id} session={session} kept={media.data} />;
  }
  const isVisitor = !signedIn && !pending;
  return (
    <View style={{ flex: 1, backgroundColor: colors["neutral-1"] }}>
      {/* A visitor's sheet names the log, where the web's pulses for a session it never asks. */}
      <PanelHeader title={isVisitor ? m.sessions_title() : null} onClose={leave} />
      <View style={{ padding: space.m }}>
        {isVisitor ? (
          // Once signed in, the sign-in sheet goes back to this one, which then reads the session:
          // a `next` would put a second one over it.
          <AccountPrompt text={m.session_sign_in_prompt()} />
        ) : detail.isError ? (
          // A session that is gone is said so; one that could not be read is asked again.
          <ErrorState
            plain
            title={m.session_not_found()}
            onRetry={codeOf(detail.error) === "NOT_FOUND" ? undefined : () => void detail.refetch()}
            retrying={detail.isFetching}
          />
        ) : (
          <Loading>
            <View style={{ gap: space.s }}>
              <Skeleton height={40} />
              <Skeleton height={40} />
              <Skeleton height={type.m.line} width="60%" />
            </View>
          </Loading>
        )}
      </View>
    </View>
  );
}
