import type { MediaItem } from "@repo/client/viewer/types";
import { AlertCircleIcon, PlayIcon, RestartIcon, XIcon } from "@repo/ui/icon";
import { Image } from "expo-image";
import { Spinner } from "heroui-native";
import type { ReactNode } from "react";
import { Pressable, View } from "react-native";
import Svg, { Circle } from "react-native-svg";

import { Glyph } from "@/components/shared/glyph";
import { Text } from "@/components/ui/text";
import { useTheme } from "@/lib/theme";
import { light } from "@/theme/tokens";
import { m } from "@/paraglide/messages";

import { videoLength } from "./media-files";

// A photo or a video as a square: what it shows, how long a video lasts, and what covers it while
// it is not shown yet, a ring of how much of it went, a spinner while the worker makes it, or a
// warning. Decision 066.

// What stands over a picture is the theme's white on a veil of its black at 45%, in either theme.
const ON_VEIL = light["neutral-1"];
const VEIL = `${light["neutral-10"]}73`;

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

/** How much of a file went, as a ring. */
export function ProgressRing({ progress, size = 28 }: { progress: number; size?: number }) {
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
        stroke={ON_VEIL}
        strokeOpacity={0.3}
        strokeWidth={2.5}
      />
      <Circle
        cx={12}
        cy={12}
        r={radius}
        fill="none"
        stroke={ON_VEIL}
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
  return (
    <View
      pointerEvents="none"
      style={{
        position: "absolute",
        inset: 0,
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: VEIL,
      }}
    >
      {children}
    </View>
  );
}

/** How long a video lasts, over the corner of its picture. */
export function VideoBadge({ durationMs }: { durationMs: number | null }) {
  const { space } = useTheme();
  return (
    <View
      style={{
        position: "absolute",
        left: space.xxs,
        bottom: space.xxs,
        flexDirection: "row",
        alignItems: "center",
        gap: 2,
        paddingHorizontal: space.xxs,
        borderRadius: 999,
        backgroundColor: VEIL,
      }}
    >
      <Glyph icon={PlayIcon} size={10} color={ON_VEIL} />
      {durationMs !== null ? (
        <Text size="xs" numeric dense style={{ color: ON_VEIL }}>
          {videoLength(durationMs)}
        </Text>
      ) : null}
    </View>
  );
}

type TileShape = { size: number };

/** A picture filling its square, which the phone keeps a while once it was drawn. */
export function Picture({
  uri,
  size,
  recyclingKey,
}: TileShape & { uri: string | null; recyclingKey?: string }) {
  const { colors, radius } = useTheme();
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: Math.min(radius.xs, size / 4),
        borderCurve: "continuous",
        overflow: "hidden",
        backgroundColor: colors["neutral-3"],
      }}
    >
      {uri ? (
        <Image
          source={{ uri }}
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
  /** The picture: the API's thumbnail, or where the phone keeps the file being sent. */
  uri: string | null;
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
};

/** A photo or a video of a strip, with what can be done with it. */
export function MediaTile({
  uri,
  video,
  durationMs,
  cover,
  onOpen,
  onRemove,
  size,
  recyclingKey,
}: MediaTileProps) {
  const { space } = useTheme();
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
      <Picture uri={uri} size={size} recyclingKey={recyclingKey} />
      {video ? <VideoBadge durationMs={durationMs} /> : null}
      {cover?.state === "sending" ? (
        <Veil>
          <ProgressRing progress={cover.progress} />
        </Veil>
      ) : cover?.state === "processing" ? (
        <Veil>
          <Spinner size="sm" color={ON_VEIL} />
        </Veil>
      ) : cover?.state === "failed" ? (
        <Veil>
          <Glyph icon={cover.onRetry ? RestartIcon : AlertCircleIcon} size={20} color={ON_VEIL} />
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
          hitSlop={10}
          style={({ pressed }) => ({
            position: "absolute",
            top: space.xxs,
            right: space.xxs,
            width: 24,
            height: 24,
            borderRadius: 12,
            alignItems: "center",
            justifyContent: "center",
            backgroundColor: VEIL,
            opacity: pressed ? 0.7 : 1,
          })}
        >
          <Glyph icon={XIcon} size={12} color={ON_VEIL} />
        </Pressable>
      ) : null}
    </View>
  );
}
