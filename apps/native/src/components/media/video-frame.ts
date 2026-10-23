import { createVideoPlayer, type VideoThumbnail } from "expo-video";
import { useEffect, useState } from "react";

// The first picture of a video on this phone, while it is sent, as the web's tile draws a video
// being sent from its first image: expo-video reads it from the file, with a player that plays
// nothing and is let go once the picture is made. Decision 066.

// At its second, a picture past a black first image; and as wide as a tile at the phone's three
// pixels to a point, which is all a tile draws.
const AT_SECONDS = 0.1;
const WIDTH_PX = 3 * 96;
// The pictures kept for the files sent from here, the last ones first: a strip that is drawn again
// does not read its videos again.
const MOST_KEPT = 24;

const made = new Map<string, Promise<VideoThumbnail | null>>();

async function frameOf(uri: string): Promise<VideoThumbnail | null> {
  const player = createVideoPlayer(null);
  try {
    // The file is read off the thread that draws, before its picture is asked.
    await player.replaceAsync({ uri });
    const [frame] = await player.generateThumbnailsAsync(AT_SECONDS, { maxWidth: WIDTH_PX });
    return frame ?? null;
  } catch {
    // A file the phone cannot read draws its grey square, as before.
    return null;
  } finally {
    player.release();
  }
}

function keptFrame(uri: string) {
  const kept = made.get(uri);
  if (kept) return kept;
  const making = frameOf(uri);
  made.set(uri, making);
  if (made.size > MOST_KEPT) {
    const oldest = made.keys().next().value;
    if (oldest !== undefined) made.delete(oldest);
  }
  return making;
}

/** The first picture of the video at `uri`, a file of this phone, once it is made; else null. */
export function useVideoFrame(uri: string | null) {
  const [frame, setFrame] = useState<{ uri: string; picture: VideoThumbnail } | null>(null);
  useEffect(() => {
    if (uri === null) return;
    let isLive = true;
    void keptFrame(uri).then((picture) => {
      if (isLive && picture) setFrame({ uri, picture });
    });
    return () => {
      isLive = false;
    };
  }, [uri]);
  return frame && frame.uri === uri ? frame.picture : null;
}
