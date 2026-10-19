import type { Upload } from "@repo/client/sessions/types";
import type { MediaItem } from "@repo/client/viewer/types";
import type { MediaPurpose } from "@repo/config/media";
import { PlusIcon } from "@repo/ui/icon";
import type { ImagePickerAsset } from "expo-image-picker";
import { useEffect, useRef, useState } from "react";
import { Pressable, ScrollView, View } from "react-native";

import { Glyph } from "@/components/shared/glyph";
import { feel } from "@/components/ui/haptics";
import { Text } from "@/components/ui/text";
import { useTell } from "@/components/ui/toast";
import { useTheme } from "@/lib/theme";
import { m } from "@/paraglide/messages";

import { MediaTile, failureWords } from "./media-tile";
import { pickMedia, tellCameraDenied } from "./pick-media";

// The photos and the videos of a form, on a line of it: a strip of squares, each with how far it
// went, and a last one that adds more from the camera or the library. A file goes up as soon as it
// is chosen, while the rest of the form is filled in, and one that failed is sent again with a
// press. Decision 066.

const TILE = 64;

/** A photo or a video of a form: one the session keeps, by its id, or one being sent, by its key. */
export type MediaEntry = { kept: string } | { upload: string };

/** The id a session is saved with, or null while the API has given none. */
export function entryId(entry: MediaEntry, uploads: ReadonlyMap<string, Upload>) {
  return "kept" in entry ? entry.kept : (uploads.get(entry.upload)?.id ?? null);
}

type MediaStripProps = {
  purpose: MediaPurpose;
  entries: readonly MediaEntry[];
  // What the session keeps, as the API last said: what each kept entry shows.
  kept: readonly MediaItem[];
  uploads: ReadonlyMap<string, Upload>;
  disabled: boolean;
  // An operator stopped uploads: what the form keeps stays, and nothing is added.
  paused: boolean;
  // How many it takes: a session's ten, or a report's four.
  most: number;
  onAdd: (assets: ImagePickerAsset[]) => void;
  onRemove: (index: number) => void;
  onRetry: (key: string) => void;
  // Opens a photo or a video the session keeps, in the viewer.
  onOpen?: (item: MediaItem) => void;
};

export function MediaStrip({
  purpose,
  entries,
  kept,
  uploads,
  disabled,
  paused,
  most,
  onAdd,
  onRemove,
  onRetry,
  onOpen,
}: MediaStripProps) {
  const { colors, space, radius } = useTheme();
  const tell = useTell();
  const [isPicking, setIsPicking] = useState(false);
  const full = entries.length >= most;

  // A file of this form that fails is told once, with why.
  const told = useRef(new Set<string>());
  useEffect(() => {
    for (const entry of entries) {
      if (!("upload" in entry)) continue;
      const upload = uploads.get(entry.upload);
      if (upload?.state === "failed" && !told.current.has(upload.key)) {
        told.current.add(upload.key);
        tell({ title: upload.error ?? m.media_send_failed({ name: upload.name }), tone: "danger" });
      } else if (upload?.state === "sending") {
        told.current.delete(entry.upload);
      }
    }
  }, [entries, uploads, tell]);

  async function add() {
    if (isPicking) return;
    setIsPicking(true);
    try {
      const picked = await pickMedia(purpose, most - entries.length);
      if (picked === "denied") tellCameraDenied();
      else if (picked !== "cancelled" && picked.assets.length > 0) {
        feel("select");
        onAdd(picked.assets);
      }
    } finally {
      setIsPicking(false);
    }
  }

  return (
    <View style={{ gap: space.xs }}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        accessibilityLabel={m.media_title()}
        contentContainerStyle={{ gap: space.xs, paddingVertical: space.xxs }}
      >
        {entries.map((entry, index) => {
          const key = "kept" in entry ? entry.kept : entry.upload;
          const remove = disabled ? undefined : () => onRemove(index);
          if ("kept" in entry) {
            const item = kept.find((one) => one.id === entry.kept);
            if (!item) return null;
            return (
              <MediaTile
                key={key}
                size={TILE}
                uri={item.thumb}
                recyclingKey={item.id}
                video={item.kind === "video"}
                durationMs={item.durationMs}
                cover={
                  item.state === "uploading" || item.state === "processing"
                    ? { state: "processing" }
                    : item.state === "failed"
                      ? { state: "failed", words: failureWords(item.failure) }
                      : null
                }
                onOpen={onOpen ? () => onOpen(item) : undefined}
                onRemove={remove}
              />
            );
          }
          const upload = uploads.get(entry.upload);
          if (!upload) return null;
          return (
            <MediaTile
              key={key}
              size={TILE}
              uri={upload.kind === "photo" ? upload.preview : null}
              video={upload.kind === "video"}
              durationMs={null}
              cover={
                upload.state === "sending"
                  ? { state: "sending", progress: upload.progress }
                  : upload.state === "failed"
                    ? {
                        state: "failed",
                        words: upload.error ?? m.media_send_failed({ name: upload.name }),
                        onRetry: () => onRetry(upload.key),
                      }
                    : null
              }
              onRemove={remove}
            />
          );
        })}
        {!full && !paused ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={m.media_add()}
            accessibilityState={{ disabled: disabled || isPicking, busy: isPicking }}
            disabled={disabled || isPicking}
            onPress={() => void add()}
            style={({ pressed }) => ({
              width: TILE,
              height: TILE,
              alignItems: "center",
              justifyContent: "center",
              borderRadius: Math.min(radius.xs, TILE / 4),
              borderCurve: "continuous",
              backgroundColor: pressed ? colors["neutral-4"] : colors["neutral-3"],
              opacity: disabled ? 0.5 : 1,
            })}
          >
            <Glyph icon={PlusIcon} size={20} color={colors["neutral-7"]} />
          </Pressable>
        ) : null}
      </ScrollView>
      {paused ? (
        <Text size="s" tone="muted">
          {m.media_paused()}
        </Text>
      ) : null}
    </View>
  );
}
