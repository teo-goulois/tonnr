import { APP_NAME } from "@repo/config/app";
import { type MediaPurpose, VIDEO_MOST_SECONDS } from "@repo/config/media";
import {
  type ImagePickerAsset,
  type ImagePickerOptions,
  launchCameraAsync,
  launchImageLibraryAsync,
  requestCameraPermissionsAsync,
  UIImagePickerPreferredAssetRepresentationMode,
} from "expo-image-picker";
import { Alert, Linking, Platform } from "react-native";

import { chooseOnIos } from "@/components/saved/confirm";
import { m } from "@/paraglide/messages";

// How the app takes photos and videos from the phone: its camera, or its library, several at once,
// each as the phone keeps it, with what its file says of where and when it was taken. The files
// are the picker's copies, which the uploads send (src/lib/uploads.ts). Decision 066.

/** What a picker gave: files, nothing, or a camera the person did not allow. */
export type Picked = { assets: ImagePickerAsset[] } | "cancelled" | "denied";

function optionsOf(purpose: MediaPurpose): ImagePickerOptions {
  return {
    mediaTypes: ["images", "videos"],
    // What the file says of where and when it was taken: a session's day, a report's checks.
    exif: true,
    quality: 1,
    // The file as the phone keeps it, HEIF or not, with what it says: the worker reads it.
    preferredAssetRepresentationMode: UIImagePickerPreferredAssetRepresentationMode.Current,
    videoMaxDuration: VIDEO_MOST_SECONDS[purpose],
  };
}

/** Photos and videos of the library, `most` at most, in the order they were chosen. */
export async function pickFromLibrary(purpose: MediaPurpose, most: number): Promise<Picked> {
  const result = await launchImageLibraryAsync({
    ...optionsOf(purpose),
    allowsMultipleSelection: most > 1,
    selectionLimit: most,
    orderedSelection: true,
  });
  return result.canceled ? "cancelled" : { assets: result.assets };
}

/** A photo or a video taken now, with the camera. */
export async function takeWithCamera(purpose: MediaPurpose): Promise<Picked> {
  const allowed = await requestCameraPermissionsAsync();
  if (!allowed.granted) return "denied";
  const result = await launchCameraAsync(optionsOf(purpose));
  return result.canceled ? "cancelled" : { assets: result.assets };
}

/** Says that the camera is not allowed, and offers the phone's settings, where it is. */
export function tellCameraDenied() {
  Alert.alert(m.native_media_camera_denied({ name: APP_NAME }), undefined, [
    { text: m.action_cancel(), style: "cancel" },
    { text: m.native_open_settings(), onPress: () => void Linking.openSettings() },
  ]);
}

/**
 * Asks where the files come from, the camera or the library, as the platform asks it: an action
 * sheet on iOS, a dialog on Android.
 */
export async function askSource(): Promise<"camera" | "library" | null> {
  const sources = ["camera", "library"] as const;
  if (Platform.OS === "ios") {
    const index = await chooseOnIos(m.media_add(), [
      m.native_media_take(),
      m.native_media_choose(),
    ]);
    return index === undefined ? null : (sources[index] ?? null);
  }
  return new Promise((resolve) => {
    Alert.alert(
      m.media_add(),
      undefined,
      [
        { text: m.action_cancel(), style: "cancel", onPress: () => resolve(null) },
        { text: m.native_media_choose(), onPress: () => resolve("library") },
        { text: m.native_media_take(), onPress: () => resolve("camera") },
      ],
      { cancelable: true, onDismiss: () => resolve(null) },
    );
  });
}

/** Asks where from, then takes files there: what a press on "add" does. */
export async function pickMedia(purpose: MediaPurpose, most: number): Promise<Picked> {
  const source = await askSource();
  if (source === null) return "cancelled";
  return source === "camera" ? takeWithCamera(purpose) : pickFromLibrary(purpose, most);
}
