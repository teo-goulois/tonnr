import type { SurfSize, Upload } from "@repo/client/sessions/types";
import { hasInsult } from "@repo/config/insults";
import { REPORT_NOTE_MOST } from "@repo/config/media";
import { z } from "zod";

import { m } from "@/paraglide/messages";

// What the form of a report holds, and what it asks of it before it is sent, as the web's
// `ReportSheet` does (decisions 067 and 076): the keys of its files, how big the waves look, and
// a few words.

/** How big most of the waves and the sets look. */
export type Sizes = { waves: SurfSize | null; sets: SurfSize | null };

/** What a report is made of, as its form holds it: the keys of its files, its sizes, its words. */
export type ReportValues = { entries: string[]; sizes: Sizes; note: string };

export const EMPTY_REPORT: ReportValues = {
  entries: [],
  sizes: { waves: null, sets: null },
  note: "",
};

type Uploads = ReadonlyMap<string, Upload>;

/**
 * What a report must be once sent: one file at least went up whole, since a report shows the
 * waves. The files are read as they stand when the form is sent, not as they stood when the
 * schema was made.
 */
export function reportSchema(uploadsNow: () => Uploads) {
  return z.object({
    entries: z
      .array(z.string())
      .refine(
        (keys) => keys.some((key) => uploadsNow().get(key)?.state === "sent"),
        m.report_media_missing(),
      ),
    sizes: z.custom<Sizes>(),
    // Everyone reads the note at the break: it holds no insult, as the API checks too.
    note: z
      .string()
      .max(REPORT_NOTE_MOST)
      .refine((note) => !hasInsult(note), m.report_note_insult()),
  });
}

/** Whether a file of the report is still going up: the report waits for it, and says so. */
export const isGoingOf = (entries: readonly string[], uploads: Uploads) =>
  entries.some((key) => uploads.get(key)?.state === "sending");

/** Whether the form holds something that would be lost: a file, a few words, a size. */
export const holdsSomething = (values: ReportValues) =>
  values.entries.length > 0 || values.note.trim() !== "" || values.sizes.waves !== null;
