import { useEffect } from "react";
import { toast } from "sonner";

import {
  RELEASE_AT_MOST_EVERY_MS,
  RELEASE_EVERY_MS,
  isNewRelease,
  servedRelease,
} from "@/lib/release";
import { m } from "@/paraglide/messages";

/**
 * Says once that the stage was deployed since this app was loaded, in a toast that stays until
 * it is answered. It looks when the app comes back into view and now and then while it is
 * there, and no more once it has said it. A development server runs no build and looks at
 * nothing.
 */
export function ReleaseWatcher() {
  useEffect(() => {
    const running: string | undefined = import.meta.env.VITE_RELEASE;
    if (!running) return;

    let last = Date.now();
    let told = false;

    const stop = () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", look);
    };

    async function look() {
      if (told || document.visibilityState !== "visible") return;
      if (Date.now() - last < RELEASE_AT_MOST_EVERY_MS) return;
      last = Date.now();
      if (!isNewRelease(running, await servedRelease(fetch)) || told) return;

      told = true;
      stop();
      toast(m.release_new(), {
        description: m.release_new_detail(),
        duration: Number.POSITIVE_INFINITY,
        action: { label: m.release_reload(), onClick: () => window.location.reload() },
      });
    }

    const timer = window.setInterval(look, RELEASE_EVERY_MS);
    document.addEventListener("visibilitychange", look);
    return stop;
  }, []);

  return null;
}
