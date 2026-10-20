import { router, usePathname } from "expo-router";
import { useEffect } from "react";

import { useAccount } from "@/lib/account";
import { liveSession, liveStateNow } from "@/lib/live-session";

// A session in progress that was never ended, because eight hours went by or because its Live
// Activity or its notification was swiped away, or that was ended and never written, is offered
// to be written the next time the app opens: decision 074. So is a session the phone could not
// show outside the app, which only the app can end.

// Once each time the app starts, whatever screens it then opens.
let isAsked = false;

/** Offers the session kept on the phone, as the app starts. The tabs mount it; it draws nothing. */
export function useLiveSessionOffer() {
  const { signedIn, pending } = useAccount();
  const pathname = usePathname();

  useEffect(() => {
    if (pending || !signedIn || isAsked) return;
    isAsked = true;
    const session = liveSession();
    if (!session || pathname.startsWith("/session/")) return;
    void liveStateNow().then((state) => {
      if (
        state === "ended" ||
        state === "unended" ||
        (state === "running" && session.shown === false)
      ) {
        router.push("/session/live");
      }
    });
  }, [pending, signedIn, pathname]);
}
