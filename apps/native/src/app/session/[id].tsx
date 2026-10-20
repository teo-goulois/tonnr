import type { MediaItem, SessionDetail } from "@repo/client/viewer/types";
import { MapPinIcon, TrashIcon } from "@repo/ui/icon";
import { router, useLocalSearchParams } from "expo-router";
import { useRef, useState } from "react";
import { View } from "react-native";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useSessionDraft } from "@/components/sessions/session-draft";
import { SessionFields, SizesStep } from "@/components/sessions/session-form";
import { openPlaceOnMap } from "@/components/sessions/session-place";
import { askToDelete, placeHref, sessionWhen } from "@/components/sessions/session-row";
import { SessionConditions, SessionCredits } from "@/components/sessions/session-sea";
import {
  useMediaStatus,
  useSessionDetail,
  useSessionWrites,
} from "@/components/sessions/use-sessions";
import { Button } from "@/components/ui/button";
import { ErrorState } from "@/components/ui/error-state";
import { Row, Section } from "@/components/ui/list";
import { SheetHeader, useSheetGuard } from "@/components/ui/sheet";
import { Loading, Skeleton, SkeletonText } from "@/components/ui/skeleton";
import { Text } from "@/components/ui/text";
import { useTheme } from "@/lib/theme";
import { m } from "@/paraglide/messages";

type Props = {
  session: SessionDetail;
  // What it keeps of photos and videos: undefined while they are asked for.
  kept: readonly MediaItem[] | undefined;
};

/** A session of the log, to be read and changed. */
function SessionSheet({ session, kept }: Props) {
  const { colors, space } = useTheme();
  const insets = useSafeAreaInsets();
  const [now] = useState(Date.now);
  const drafting = useSessionDraft(session, kept, now);
  const mediaStatus = useMediaStatus();
  const writes = useSessionWrites();
  const { close, cancel } = useSheetGuard(drafting.isDirty);
  const [isSizing, setIsSizing] = useState(false);
  const place = placeHref(session);
  const busy = writes.isSaving || writes.isDeleting;

  async function save() {
    if (!drafting.isDirty || drafting.isAhead || drafting.isAsking || busy) return;
    if (await writes.change(session, drafting.changed)) close();
  }

  async function remove() {
    if (busy || !(await askToDelete())) return;
    if (await writes.remove(session)) close();
  }

  if (isSizing) {
    return (
      <View style={{ flex: 1, backgroundColor: colors["neutral-1"] }}>
        <SizesStep
          waves={drafting.waveSize}
          sets={drafting.setSize}
          onBack={() => setIsSizing(false)}
          onDone={(waves, sets) => {
            drafting.setSizes(waves, sets);
            setIsSizing(false);
          }}
        />
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors["neutral-1"] }}>
      <SheetHeader
        title={session.place.name}
        onCancel={cancel}
        onSave={() => void save()}
        saveLabel={m.session_save_changes()}
        canSave={drafting.isDirty && !drafting.isAhead && !drafting.isAsking}
        saving={writes.isSaving}
      />
      <KeyboardAwareScrollView
        keyboardShouldPersistTaps="handled"
        bottomOffset={space.l}
        contentContainerStyle={{
          gap: space.l,
          padding: space.m,
          paddingBottom: insets.bottom + space.xl,
        }}
      >
        <Text tone="muted" numeric style={{ textAlign: "center" }}>
          {sessionWhen(session, now)}
        </Text>

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

        <SessionFields
          drafting={drafting}
          now={now}
          disabled={busy}
          mediaStatus={mediaStatus.data}
          onSizes={() => setIsSizing(true)}
          onOpenMedia={(item) =>
            router.push({ pathname: "/media/[id]", params: { id: item.id, session: session.id } })
          }
        />

        <Section>
          {place ? (
            <Row
              icon={MapPinIcon}
              title={m.session_open_place()}
              // The place opens over the map. While something written here is not saved, the
              // session's sheet gives its place to the place's, asking first.
              onPress={() => (drafting.isDirty ? router.replace(place) : openPlaceOnMap(place))}
              disabled={busy}
            />
          ) : null}
          <Row
            icon={TrashIcon}
            title={m.session_delete_confirm()}
            destructive
            chevron={false}
            onPress={() => void remove()}
            disabled={busy}
          />
        </Section>

        <SessionCredits session={session} />
      </KeyboardAwareScrollView>
    </View>
  );
}

/**
 * Reads a session of the log, with what the sea did while it lasted, and changes it or deletes
 * it. Its sheet has Cancel and Save, and asks before what was changed is lost. The web's
 * `SessionSheet` does the same. Decisions 043 and 066.
 */
export default function SessionScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { colors, space } = useTheme();
  const { detail, media } = useSessionDetail(id);
  // A session deleted here stays drawn while its sheet leaves.
  const last = useRef(detail.data);
  if (detail.data) last.current = detail.data;
  const session = detail.data ?? last.current;

  if (session) {
    // Another session starts its sheet over.
    return <SessionSheet key={session.id} session={session} kept={media.data} />;
  }
  return (
    <View style={{ flex: 1, backgroundColor: colors["neutral-1"] }}>
      <SheetHeader title={m.sessions_title()} onCancel={() => router.back()} />
      {detail.isError ? (
        <ErrorState
          title={m.session_not_found()}
          onRetry={() => void detail.refetch()}
          retrying={detail.isFetching}
        />
      ) : (
        <Loading>
          <View style={{ gap: space.l, padding: space.m }}>
            <Skeleton height={20} width="50%" />
            <SkeletonText lines={4} />
            <Skeleton height={220} />
          </View>
        </Loading>
      )}
    </View>
  );
}
