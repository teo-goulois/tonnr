import type { Upload } from "@repo/client/sessions/types";
import { View } from "react-native";
import { ScopedTheme } from "uniwind";

import { Text } from "@/components/ui/text";
import { edge } from "@/components/ui/edge";
import { useTheme } from "@/lib/theme";
import { m } from "@/paraglide/messages";

import { MediaStrip, type MediaEntry } from "./media-strip";
import { MediaTile } from "./media-tile";

// The photos and the videos of a form, with invented files, as the web's design system shows its
// `SessionMediaField`: each state a tile can be in, in the light theme and the dark one, whose veil
// turns light, and a strip as a form holds it, then paused by its instance, then full. Nothing is
// sent from here. Decision 066.

const TILE = 64;

function upload(key: string, change: Partial<Upload>): Upload {
  return {
    key,
    name: `${key}.jpg`,
    purpose: "session",
    kind: "photo",
    type: "image/jpeg",
    // No picture: what covers a tile reads the same on its grey square.
    preview: "",
    progress: 0,
    state: "sending",
    error: null,
    id: null,
    ...change,
  };
}

/** The files of the sample strip, in the words of the language in force. */
function sampleUploads(): ReadonlyMap<string, Upload> {
  return new Map(
    [
      upload("sending", { progress: 0.4 }),
      upload("video", { kind: "video", type: "video/mp4", name: "video.mp4", progress: 0.7 }),
      upload("failed", { state: "failed", error: m.media_send_failed({ name: "failed.jpg" }) }),
      upload("sent", { state: "sent", progress: 1, id: "sent" }),
    ].map((one) => [one.key, one]),
  );
}
const ENTRIES: MediaEntry[] = ["sending", "video", "failed", "sent"].map((key) => ({
  upload: key,
}));

function Tiles() {
  const { space, radius } = useTheme();
  const shape = { size: TILE, corner: radius.xs, uri: null, durationMs: null, video: false };
  return (
    <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space.xs }}>
      <MediaTile {...shape} cover={{ state: "sending", progress: 0.4 }} />
      <MediaTile {...shape} cover={{ state: "processing" }} />
      <MediaTile
        {...shape}
        cover={{ state: "failed", words: m.media_failure_gave_up(), onRetry: () => {} }}
      />
      <MediaTile {...shape} cover={{ state: "failed", words: m.media_failure_too_long() }} />
      <MediaTile {...shape} video durationMs={42_000} onOpen={() => {}} onRemove={() => {}} />
    </View>
  );
}

function InTheme({ theme }: { theme: "light" | "dark" }) {
  return (
    <ScopedTheme theme={theme}>
      <ThemedTiles title={theme === "light" ? "Light" : "Dark"} />
    </ScopedTheme>
  );
}

function ThemedTiles({ title }: { title: string }) {
  const { colors, space, radius } = useTheme();
  return (
    <View
      style={[
        { gap: space.s, padding: space.s, borderRadius: radius.xs },
        { backgroundColor: colors["neutral-1"] },
        edge(colors["neutral-4"]),
      ]}
    >
      <Text size="s" weight="medium">
        {title}
      </Text>
      <Tiles />
    </View>
  );
}

function Strip({ paused = false, full = false }: { paused?: boolean; full?: boolean }) {
  return (
    <MediaStrip
      purpose="session"
      entries={ENTRIES}
      kept={[]}
      uploads={sampleUploads()}
      disabled={false}
      paused={paused}
      most={full ? ENTRIES.length : 10}
      onAdd={() => {}}
      onRemove={() => {}}
      onRetry={() => {}}
    />
  );
}

export function MediaSamples() {
  const { space } = useTheme();
  const note = (words: string) => (
    <Text size="xs" tone="muted">
      {words}
    </Text>
  );
  return (
    <View style={{ gap: space.m }}>
      <InTheme theme="light" />
      <InTheme theme="dark" />
      {note(
        "Sending at 40%, made by the worker, failed and sent again with a press, failed for good, and a video ready to open, with its cross.",
      )}
      <Strip />
      {note("A form's strip: a photo and a video going up, one that failed, one sent, and add.")}
      <Strip paused />
      {note("Uploads paused by the instance: what the form holds stays, and nothing is added.")}
      <Strip full />
      {note("Full: no square to add another.")}
    </View>
  );
}
