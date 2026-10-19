import { APP_SCHEME } from "@repo/config/app";
import * as Application from "expo-application";
import { Platform } from "react-native";

/**
 * The origin the app names itself by in `expo-origin`, which the API takes as one of the
 * instance's own clients when its `APP_ORIGINS` lists it. Decision 069.
 */
export const APP_ORIGIN = `${APP_SCHEME}://`;

/**
 * What the app says of itself in `X-App`: its platform, then the version and the build of the
 * binary, as `ios 1.2.0 34`. Analytics name the platform from it. Decision 069.
 */
export function appHeader() {
  const version = Application.nativeApplicationVersion ?? "0.0.0";
  const build = Application.nativeBuildVersion ?? "0";
  return `${Platform.OS} ${version} ${build}`;
}
