import type { SurfSize } from "@repo/client/sessions/types";
import { APP_NAME } from "@repo/config/app";
import { REPORT_MOST_MEDIA, REPORT_NOTE_MOST } from "@repo/config/media";
import { CameraIcon, TriangleAlertIcon } from "@repo/ui/icon";
import { useQuery } from "@tanstack/react-query";
import type { ImagePickerAsset } from "expo-image-picker";
import { router, useLocalSearchParams } from "expo-router";
import { openBrowserAsync } from "expo-web-browser";
import { Spinner } from "heroui-native";
import { useEffect, useRef, useState } from "react";
import { View } from "react-native";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { ENV } from "@/env";
import { MediaStrip } from "@/components/media/media-strip";
import { pickFromLibrary, takeWithCamera, tellCameraDenied } from "@/components/media/pick-media";
import {
  positionAllowed,
  REPORT_RADIUS_KM,
  useBreakReports,
  useReportWrites,
  whereThePhoneIs,
} from "@/components/reports/use-reports";
import { UsernameStep } from "@/components/reports/username-step";
import { FormRow, NoteField, SizePill, SizesStep } from "@/components/sessions/session-form";
import { distanceKm } from "@/components/sessions/session-logic";
import { useMediaStatus } from "@/components/sessions/use-sessions";
import { Glyph } from "@/components/shared/glyph";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { feel } from "@/components/ui/haptics";
import { SheetHeader, useSheetGuard } from "@/components/ui/sheet";
import { Surface } from "@/components/ui/surface";
import { Text } from "@/components/ui/text";
import { useTell } from "@/components/ui/toast";
import { useAccount } from "@/lib/account";
import { useTheme } from "@/lib/theme";
import { dropUpload, retryUpload, startUploads, useUploads } from "@/lib/uploads";
import { formatDistance } from "@/lib/units";
import { m } from "@/paraglide/messages";
import { getLocale } from "@/paraglide/runtime";
import { orpc } from "@/utils/orpc";

// How long the sheet waits, once it is up, before the camera takes its place: a picker asked for
// while the sheet still rises would not open.
const CAMERA_AFTER_MS = 450;

/** The terms of use on the web, in the reader's language: English has no prefix. */
function termsAddress() {
  const locale = getLocale();
  return `${ENV.EXPO_PUBLIC_SITE_URL}${locale === "en" ? "" : `/${locale}`}/terms`;
}

/** What the phone says of where it stands against the break, before a photo is taken there. */
function usePositionWarning(point: { latitude: number; longitude: number } | undefined) {
  const [warning, setWarning] = useState<string | null>(null);
  useEffect(() => {
    if (!point) return;
    let isLive = true;
    void (async () => {
      const allowed = await positionAllowed();
      // Not asked yet: the phone is asked as the report is sent.
      if (allowed === "undetermined") return;
      if (allowed === "denied") {
        if (isLive) setWarning(m.native_report_position_off({ name: APP_NAME }));
        return;
      }
      const phone = await whereThePhoneIs(false);
      if (!isLive || !phone) return;
      const km = distanceKm(phone, point);
      setWarning(
        km > REPORT_RADIUS_KM ? m.native_report_far({ distance: formatDistance(km, 1) }) : null,
      );
    })();
    return () => {
      isLive = false;
    };
  }, [point]);
  return warning;
}

/** What a report is made of, at one break: camera first, then how big and a few words. */
function ReportForm({ breakId }: { breakId: string }) {
  const { colors, space } = useTheme();
  const insets = useSafeAreaInsets();
  const tell = useTell();
  const uploads = useUploads();
  const status = useMediaStatus();
  const reports = useBreakReports(breakId);
  const writes = useReportWrites();
  const found = useQuery(orpc.v1.breaks.get.queryOptions({ input: { id: breakId }, retry: false }));
  const warning = usePositionWarning(found.data);

  const [entries, setEntries] = useState<string[]>([]);
  const [waveSize, setWaveSize] = useState<SurfSize | null>(null);
  const [setSize, setSetSize] = useState<SurfSize | null>(null);
  const [note, setNote] = useState("");
  const [isSizing, setIsSizing] = useState(false);
  const [isPicking, setIsPicking] = useState(false);

  const isDirty = entries.length > 0 || note.trim() !== "" || waveSize !== null;
  const { close, cancel } = useSheetGuard(isDirty);

  // What was sent from this form and not sent with a report is let go as it closes.
  const owned = useRef<string[]>([]);
  owned.current = entries;
  useEffect(() => () => owned.current.forEach((key) => dropUpload(key, true)), []);

  const shown = entries.map((key) => uploads.get(key));
  const isGoing = shown.some((upload) => upload?.state === "sending");
  const sent = shown.filter((upload) => upload?.state === "sent").length;
  const paused = status.data?.paused === true || reports.data?.offered === false;

  function add(assets: ImagePickerAsset[]) {
    const room = REPORT_MOST_MEDIA - entries.length;
    const { started, refused } = startUploads(assets.slice(0, Math.max(0, room)), "report");
    for (const file of refused) {
      tell({
        title:
          file.why === "type"
            ? m.media_refused_type({ name: file.name })
            : m.media_refused_size({ name: file.name }),
        tone: "danger",
      });
    }
    if (started.length > 0) feel("select");
    setEntries((before) => [...before, ...started]);
  }

  async function take(from: "camera" | "library") {
    if (isPicking || paused) return;
    setIsPicking(true);
    try {
      const picked =
        from === "camera"
          ? await takeWithCamera("report")
          : await pickFromLibrary("report", REPORT_MOST_MEDIA - entries.length);
      if (picked === "denied") tellCameraDenied();
      else if (picked !== "cancelled") add(picked.assets);
    } finally {
      setIsPicking(false);
    }
  }

  // The camera comes first: a report is what the waves look like now. Once, as the form is first
  // drawn with what the instance takes, and not once it is closed.
  const shot = useRef<ReturnType<typeof setTimeout> | "taken" | null>(null);
  useEffect(() => {
    if (shot.current !== null || paused || status.data === undefined) return;
    shot.current = setTimeout(() => {
      shot.current = "taken";
      void take("camera");
    }, CAMERA_AFTER_MS);
  }, [paused, status.data]);
  useEffect(
    () => () => {
      if (shot.current !== null && shot.current !== "taken") clearTimeout(shot.current);
    },
    [],
  );

  async function send() {
    if (isGoing || sent === 0 || writes.isSending) return;
    const done = await writes.send(breakId, { uploads: entries, waveSize, setSize, note }, uploads);
    if (!done) return;
    // The report took them: they are no longer this form's to let go.
    owned.current = [];
    close();
  }

  if (isSizing) {
    return (
      <SizesStep
        waves={waveSize}
        sets={setSize}
        onBack={() => setIsSizing(false)}
        onDone={(waves, sets) => {
          setWaveSize(waves);
          setSetSize(sets);
          setIsSizing(false);
        }}
      />
    );
  }

  return (
    <>
      <SheetHeader
        title={m.report_new()}
        onCancel={cancel}
        onSave={() => void send()}
        saveLabel={m.native_send()}
        canSave={sent > 0 && !isGoing}
        saving={writes.isSending}
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
        {found.data ? (
          <Text tone="muted" style={{ textAlign: "center" }}>
            {found.data.name}
          </Text>
        ) : null}

        {warning ? (
          <Surface
            variant="muted"
            accessibilityRole="alert"
            style={{ flexDirection: "row", gap: space.s, padding: space.m }}
          >
            <Glyph icon={TriangleAlertIcon} size={16} color={colors.warning} />
            <Text size="s" style={{ flex: 1 }}>
              {warning}
            </Text>
          </Surface>
        ) : null}

        <Text size="s" tone="muted">
          {m.report_rules()}
        </Text>

        {entries.length === 0 && !paused ? (
          <View style={{ gap: space.xs }}>
            <Button icon={CameraIcon} onPress={() => void take("camera")} loading={isPicking} fill>
              {m.native_report_shoot()}
            </Button>
            <Button variant="ghost" onPress={() => void take("library")} disabled={isPicking} fill>
              {m.native_media_choose()}
            </Button>
          </View>
        ) : (
          <View style={{ gap: space.xs }}>
            <Text size="s" weight="medium" tone="muted" accessibilityRole="header">
              {m.media_title()}
            </Text>
            <MediaStrip
              purpose="report"
              entries={entries.map((key) => ({ upload: key }))}
              kept={[]}
              uploads={uploads}
              disabled={writes.isSending}
              paused={paused}
              most={REPORT_MOST_MEDIA}
              onAdd={add}
              onRemove={(index) => {
                const key = entries[index];
                if (key) dropUpload(key, true);
                setEntries(entries.filter((_, at) => at !== index));
              }}
              onRetry={retryUpload}
            />
          </View>
        )}

        <Surface insetEdge style={{ overflow: "hidden" }}>
          <FormRow label={m.surf_size_title()}>
            <SizePill
              waves={waveSize}
              sets={setSize}
              onPress={() => setIsSizing(true)}
              disabled={writes.isSending}
            />
          </FormRow>
        </Surface>

        <NoteField
          value={note}
          onChange={setNote}
          label={m.report_note()}
          placeholder={m.report_note_placeholder()}
          most={REPORT_NOTE_MOST}
          disabled={writes.isSending}
        />

        {isGoing ? (
          <View
            accessible
            accessibilityLiveRegion="polite"
            style={{ flexDirection: "row", alignItems: "center", gap: space.xs }}
          >
            <Spinner size="sm" color={colors["neutral-7"]} />
            <Text size="s" tone="muted">
              {m.report_waiting_uploads()}
            </Text>
          </View>
        ) : null}

        <View style={{ gap: space.xxs }}>
          <Text size="xs" tone="muted">
            {m.report_rights()}
          </Text>
          <Button
            variant="ghost"
            onPress={() => void openBrowserAsync(termsAddress())}
            style={{ alignSelf: "flex-start", marginHorizontal: -space.m }}
          >
            {m.report_rights_link()}
          </Button>
        </View>
      </KeyboardAwareScrollView>
    </>
  );
}

/**
 * Reports the waves at a break, `?break=<id>`: the camera first, then how big the waves look and
 * a few words, each photo or video sent as a session's are, and the phone's position read as it
 * is sent, with what is said before when it is refused or too far. An account with no username
 * chooses one first: a report is read under it. The web's `ReportSheet` does the same.
 * Decisions 066 and 067.
 */
export default function NewReport() {
  const params = useLocalSearchParams<{ break?: string }>();
  const { colors, space } = useTheme();
  const { signedIn, pending, username } = useAccount();
  // A username kept here, before the session the sign-in library holds is read again.
  const [isNamed, setIsNamed] = useState(false);
  const breakId = params.break;
  const ground = { flex: 1, backgroundColor: colors["neutral-1"] };

  if (!breakId) return null;
  if (signedIn && (username || isNamed)) {
    return (
      <View style={ground}>
        <ReportForm key={breakId} breakId={breakId} />
      </View>
    );
  }
  return (
    <View style={ground}>
      <SheetHeader title={m.report_new()} onCancel={() => router.back()} />
      {pending ? null : signedIn ? (
        <View style={{ padding: space.m }}>
          <UsernameStep why={m.report_username_first()} onSaved={() => setIsNamed(true)} />
        </View>
      ) : (
        <EmptyState
          icon={CameraIcon}
          title={m.report_sign_in_prompt()}
          action={{
            label: m.auth_sign_in(),
            onPress: () =>
              router.replace({
                pathname: "/sign-in",
                params: {
                  reason: m.report_sign_in_prompt(),
                  next: `/report/new?break=${breakId}`,
                },
              }),
          }}
        />
      )}
    </View>
  );
}
