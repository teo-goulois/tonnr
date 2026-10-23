import { useEffect, useRef } from "react";

import { useTell } from "@/components/ui/toast";
import { useUploads } from "@/lib/uploads";
import { m } from "@/paraglide/messages";

// A photo or a video that could not be sent is told with why, wherever the app is, as the web's
// `-media.ts` tells it: a video that goes on going up once its session was saved, and fails, is
// told too, where a form that closed would say nothing. Decision 066.

/** Tells each file that failed, once a try. The root mounts it; it draws nothing. */
export function UploadFailures() {
  const uploads = useUploads();
  const tell = useTell();
  // The files told since their last try began.
  const told = useRef(new Set<string>());

  useEffect(() => {
    for (const key of told.current) {
      // A file that went, or is sent again, is told again if its next try fails.
      const upload = uploads.get(key);
      if (!upload || upload.state !== "failed") told.current.delete(key);
    }
    for (const upload of uploads.values()) {
      if (upload.state !== "failed" || told.current.has(upload.key)) continue;
      told.current.add(upload.key);
      tell({ title: upload.error ?? m.media_send_failed({ name: upload.name }), tone: "danger" });
    }
  }, [uploads, tell]);

  return null;
}
