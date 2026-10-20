import type { MediaItem } from "@repo/client/viewer/types";
import { XIcon } from "@repo/ui/icon";
import { Image } from "expo-image";
import { StatusBar } from "expo-status-bar";
import { useVideoPlayer, VideoView } from "expo-video";
import { useEffect, useRef, useState } from "react";
import {
  AccessibilityInfo,
  FlatList,
  Platform,
  Pressable,
  ScrollView,
  useWindowDimensions,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Glyph } from "@/components/shared/glyph";
import { feel } from "@/components/ui/haptics";
import { TARGET } from "@/components/ui/metrics";
import { Text } from "@/components/ui/text";
import { useTheme } from "@/lib/theme";
import { dark } from "@/theme/tokens";
import { m } from "@/paraglide/messages";

// The photos and the videos of a session or a report, one at a time over the whole screen, dark
// whatever the theme so that a photo is seen as it was taken: a finger slides from one to the next,
// two fingers bring a photo closer, and a video plays when it is asked to, with its sound. The
// web's `MediaViewer` does the same. Decision 066.

const INK = dark["neutral-10"];
const GROUND = dark["neutral-1"];

/** A photo at its size within the screen, which two fingers bring closer on iOS. */
function PhotoPage({ item, width, height }: { item: MediaItem; width: number; height: number }) {
  const image = (
    <Image
      source={{ uri: item.display ?? item.thumb ?? undefined }}
      placeholder={item.thumb ? { uri: item.thumb } : undefined}
      contentFit="contain"
      transition={150}
      style={{ width, height }}
      accessibilityIgnoresInvertColors
    />
  );
  // iOS zooms a scroll view by itself; Android shows the photo at its size.
  if (Platform.OS !== "ios") return image;
  return (
    <ScrollView
      style={{ width, height }}
      maximumZoomScale={3}
      minimumZoomScale={1}
      centerContent
      showsHorizontalScrollIndicator={false}
      showsVerticalScrollIndicator={false}
      bouncesZoom
    >
      {image}
    </ScrollView>
  );
}

/** A video, which plays when it is asked to and stops once another is in view. */
function VideoPage({
  item,
  width,
  height,
  active,
}: {
  item: MediaItem;
  width: number;
  height: number;
  active: boolean;
}) {
  const player = useVideoPlayer(item.video ? { uri: item.video } : null);
  useEffect(() => {
    if (!active) player.pause();
  }, [active, player]);
  return (
    <View style={{ width, height, justifyContent: "center" }}>
      {item.poster ? (
        <Image
          source={{ uri: item.poster }}
          contentFit="contain"
          style={{ position: "absolute", width, height }}
          accessibilityIgnoresInvertColors
        />
      ) : null}
      <VideoView
        player={player}
        nativeControls
        contentFit="contain"
        allowsPictureInPicture={false}
        style={{ width, height }}
      />
    </View>
  );
}

type MediaViewerProps = {
  items: readonly MediaItem[];
  /** The one shown first. */
  initialId: string;
  /** What the viewer is named for a screen reader. */
  label: string;
  onClose: () => void;
};

export function MediaViewer({ items, initialId, label, onClose }: MediaViewerProps) {
  const { space } = useTheme();
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const ready = items.filter((item) => item.state === "ready");
  const first = Math.max(
    0,
    ready.findIndex((item) => item.id === initialId),
  );
  const [index, setIndex] = useState(first);
  const list = useRef<FlatList<MediaItem>>(null);

  const go = (next: number) => {
    if (next < 0 || next >= ready.length || next === index) return;
    list.current?.scrollToIndex({ index: next, animated: true });
    setIndex(next);
    feel("select");
    AccessibilityInfo.announceForAccessibility(
      m.media_count({ index: next + 1, count: ready.length }),
    );
  };

  return (
    <View
      accessibilityViewIsModal
      accessibilityLabel={label}
      style={{ flex: 1, backgroundColor: GROUND }}
    >
      <StatusBar style="light" />
      <FlatList
        ref={list}
        data={ready}
        keyExtractor={(item) => item.id}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        initialScrollIndex={first}
        getItemLayout={(_, at) => ({ length: width, offset: width * at, index: at })}
        windowSize={3}
        initialNumToRender={1}
        onMomentumScrollEnd={(event) => {
          const next = Math.round(event.nativeEvent.contentOffset.x / width);
          if (next !== index) {
            setIndex(next);
            feel("select");
          }
        }}
        renderItem={({ item, index: at }) =>
          item.kind === "video" ? (
            <VideoPage item={item} width={width} height={height} active={at === index} />
          ) : (
            <PhotoPage item={item} width={width} height={height} />
          )
        }
      />
      <View
        pointerEvents="box-none"
        style={{
          position: "absolute",
          top: insets.top + space.xs,
          left: space.m,
          right: space.m,
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        {ready.length > 1 ? (
          // A screen reader goes from one to the next on the count, with a swipe up or down.
          <Text
            size="s"
            numeric
            style={{ color: INK }}
            accessibilityRole="adjustable"
            accessibilityLabel={label}
            accessibilityValue={{ text: m.media_count({ index: index + 1, count: ready.length }) }}
            accessibilityActions={[{ name: "increment" }, { name: "decrement" }]}
            onAccessibilityAction={(event) => {
              if (event.nativeEvent.actionName === "increment") go(index + 1);
              if (event.nativeEvent.actionName === "decrement") go(index - 1);
            }}
          >
            {m.media_count({ index: index + 1, count: ready.length })}
          </Text>
        ) : (
          <View />
        )}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={m.media_close()}
          onPress={onClose}
          hitSlop={4}
          style={({ pressed }) => ({
            width: TARGET,
            height: TARGET,
            borderRadius: TARGET / 2,
            alignItems: "center",
            justifyContent: "center",
            backgroundColor: pressed ? dark["neutral-4"] : dark["neutral-3"],
          })}
        >
          <Glyph icon={XIcon} size={16} color={INK} />
        </Pressable>
      </View>
    </View>
  );
}
