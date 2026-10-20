import { router, useFocusEffect, useNavigation } from "expo-router";
import { useCallback } from "react";
import { Platform } from "react-native";

/**
 * The "+" opens a sheet and is never a screen. On iOS its tab is disabled and its press opens the
 * sheet (src/app/(tabs)/_layout.tsx). On Android, whose bar lets no disabled item be pressed, the
 * tab is shown: it goes back at once to the tab that was open and opens the sheet over it.
 */
export default function Add() {
  const navigation = useNavigation();
  useFocusEffect(
    useCallback(() => {
      if (Platform.OS === "ios") return;
      if (navigation.canGoBack()) navigation.goBack();
      router.push("/create");
    }, [navigation]),
  );
  return null;
}
