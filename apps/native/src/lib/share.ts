import { Platform, Share } from "react-native";

/**
 * Hands an address to the phone's own share sheet, after a line that says what it is: iOS shows
 * the address apart, as a link, and Android takes one text, which ends with it. True once the
 * sheet was shown, whether something was sent or not, since whoever closes it without sending has
 * done nothing wrong; false when it could not open.
 */
export async function shareLink({
  title,
  message,
  url,
}: {
  title: string;
  message: string;
  url: string;
}) {
  try {
    await Share.share(
      Platform.OS === "ios" ? { title, message, url } : { title, message: `${message}\n${url}` },
    );
    return true;
  } catch {
    return false;
  }
}
