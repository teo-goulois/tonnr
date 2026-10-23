import type { MediaItem } from "@repo/client/viewer/types";
import { AlertCircleIcon, PlayIcon, RestartIcon, XIcon } from "@repo/ui/icon";
import { Image } from "expo-image";
import type { VideoThumbnail } from "expo-video";
import { Spinner } from "heroui-native";
import type { ReactNode } from "react";
import { Pressable, View } from "react-native";
import Svg, { Circle } from "react-native-svg";

import { Glyph } from "@/components/shared/glyph";
import { TARGET } from "@/components/ui/metrics";
import { Text } from "@/components/ui/text";
import { useTheme } from "@/lib/theme";
import { m } from "@/paraglide/messages";

import { videoLength } from "./media-files";
import { useVideoFrame } from "./video-frame";

// A photo or a video as a square: what it shows, how long a video lasts, and what covers it while
// it is not shown yet, a ring of how much of it went, a spinner while the worker makes it, or a
// warning. Decision 066.

/**
 * What stands over a picture, as the web draws it: a veil of the theme's ink at a fifth, and marks
 * in its ground, which a dark theme turns into a light veil with dark marks.
 */
function useVeil() {
  const { colors } = useTheme();
  return { veil: colors["neutral-10-transparent"], ink: colors["neutral-1"] };
}

// The cross that takes a tile out of its form, the web's `size-5`, given a finger's room around it.
const REMOVE = 20;

/** Why the worker made nothing of a file, in a few words. */
export function failureWords(failure: MediaItem["failure"]) {
  switch (failure) {
    case "too_large":
      return m.media_failure_too_large();
    case "too_long":
      return m.media_failure_too_long();
    case "changed":
      return m.media_failure_changed();
    case "unreadable":
      return m.media_failure_unreadable();
    default:
      return m.media_failure_gave_up();
  }
}

/** How much of a file went, as a ring, in the color of what stands on the veil. */
export function ProgressRing({
  progress,
  color,
  size = 28,
}: {
  progress: number;
  color: string;
  size?: number;
}) {
  const radius = 10;
  const length = 2 * Math.PI * radius;
  return (
    <Svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      style={{ transform: [{ rotate: "-90deg" }] }}
    >
      <Circle
        cx={12}
        cy={12}
        r={radius}
        fill="none"
        stroke={color}
        strokeOpacity={0.3}
        strokeWidth={2.5}
      />
      <Circle
        cx={12}
        cy={12}
        r={radius}
        fill="none"
        stroke={color}
        strokeWidth={2.5}
        strokeLinecap="round"
        strokeDasharray={`${length}`}
        strokeDashoffset={length * (1 - Math.min(1, Math.max(0, progress)))}
      />
    </Svg>
  );
}

/** What covers a picture while it is not shown yet. */
export function Veil({ children }: { children: ReactNode }) {
  const { veil } = useVeil();
  return (
    <View
      pointerEvents="none"
      style={{
        position: "absolute",
        inset: 0,
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: veil,
      }}
    >
      {children}
    </View>
  );
}

/** How long a video lasts, over the corner of its picture. */
export function VideoBadge({ durationMs }: { durationMs: number | null }) {
  const { space } = useTheme();
  const { veil, ink } = useVeil();
  return (
    <View
      style={{
        position: "absolute",
        left: space.xxs,
        bottom: space.xxs,
        flexDirection: "row",
        alignItems: "center",
        gap: space.xxs,
        paddingHorizontal: space.xxs,
        borderRadius: 999,
        backgroundColor: veil,
      }}
    >
      <Glyph icon={PlayIcon} size={10} color={ink} />
      {durationMs !== null ? (
        <Text size="xs" numeric dense style={{ color: ink }}>
          {videoLength(durationMs)}
        </Text>
      ) : null}
    </View>
  );
}

type TileShape = { size: number };

/**
 * A picture filling its square, which the phone keeps a while once it was drawn. Its corner is a
 * quarter of its side at most, for a small picture, unless `corner` gives its own: a strip's tile
 * and a session's picture at the end of its line take the theme's `xs` whole, as the web's do.
 * `frame` is the first picture of a video on this phone, drawn where it has no address yet.
 */
export function Picture({
  uri,
  frame,
  size,
  recyclingKey,
  corner,
}: TileShape & {
  uri: string | null;
  frame?: VideoThumbnail | null;
  recyclingKey?: string;
  corner?: number;
}) {
  const { colors, radius } = useTheme();
  const source = uri ? { uri } : (frame ?? null);
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: corner ?? Math.min(radius.xs, size / 4),
        borderCurve: "continuous",
        overflow: "hidden",
        backgroundColor: colors["neutral-3"],
      }}
    >
      {source ? (
        <Image
          source={source}
          recyclingKey={recyclingKey}
          contentFit="cover"
          transition={120}
          cachePolicy="memory-disk"
          style={{ width: size, height: size }}
          accessibilityIgnoresInvertColors
        />
      ) : null}
    </View>
  );
}

type MediaTileProps = TileShape & {
  /** The picture: the API's thumbnail, or where the phone keeps the photo being sent. */
  uri: string | null;
  /** Where the phone keeps a video being sent, whose first picture is drawn while it goes. */
  videoFile?: string | null;
  video: boolean;
  durationMs: number | null;
  /** What covers it: a medium sent from here, being made, or that failed. */
  cover?:
    | { state: "sending"; progress: number }
    | { state: "processing" }
    | { state: "failed"; words: string; onRetry?: () => void }
    | null;
  /** Opens it in the viewer: only what is ready opens. */
  onOpen?: () => void;
  /** Takes it out of the form. */
  onRemove?: () => void;
  recyclingKey?: string;
  /** Its corner, else a quarter of its side at most: `Picture`'s. */
  corner?: number;
};

/** A photo or a video of a strip, with what can be done with it. */
export function MediaTile({
  uri,
  videoFile = null,
  video,
  durationMs,
  cover,
  onOpen,
  onRemove,
  size,
  recyclingKey,
  corner,
}: MediaTileProps) {
  const { space } = useTheme();
  const { veil, ink } = useVeil();
  const frame = useVideoFrame(!uri && video && videoFile ? videoFile : null);
  const said =
    cover?.state === "sending"
      ? m.media_sending({ percent: Math.round(cover.progress * 100) })
      : cover?.state === "processing"
        ? m.media_processing()
        : cover?.state === "failed"
          ? cover.words
          : undefined;

  const body = (
    <View>
      <Picture
        uri={uri}
        frame={frame}
        size={size}
        recyclingKey={recyclingKey}
        {...(corner !== undefined && { corner })}
      />
      {video ? <VideoBadge durationMs={durationMs} /> : null}
      {cover?.state === "sending" ? (
        <Veil>
          <ProgressRing progress={cover.progress} color={ink} />
        </Veil>
      ) : cover?.state === "processing" ? (
        <Veil>
          <Spinner size="sm" color={ink} />
        </Veil>
      ) : cover?.state === "failed" ? (
        <Veil>
          <Glyph icon={cover.onRetry ? RestartIcon : AlertCircleIcon} size={20} color={ink} />
        </Veil>
      ) : null}
    </View>
  );

  const press = cover?.state === "failed" ? cover.onRetry : cover ? undefined : onOpen;
  return (
    <View style={{ width: size, height: size }}>
      {press ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={cover?.state === "failed" ? m.media_retry() : m.media_open()}
          accessibilityHint={said}
          onPress={press}
          style={({ pressed }) => ({ opacity: pressed ? 0.75 : 1 })}
        >
          {body}
        </Pressable>
      ) : (
        <View
          accessible
          accessibilityLabel={said}
          accessibilityState={{ busy: cover?.state !== "failed" && cover != null }}
        >
          {body}
        </View>
      )}
      {onRemove ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={m.media_remove()}
          onPress={onRemove}
          hitSlop={(TARGET - REMOVE) / 2}
          style={({ pressed }) => ({
            position: "absolute",
            top: space.xxs,
            right: space.xxs,
            width: REMOVE,
            height: REMOVE,
            borderRadius: REMOVE / 2,
            alignItems: "center",
            justifyContent: "center",
            backgroundColor: veil,
            opacity: pressed ? 0.7 : 1,
          })}
        >
          <Glyph icon={XIcon} size={12} color={ink} />
        </Pressable>
      ) : null}
    </View>
  );
}
