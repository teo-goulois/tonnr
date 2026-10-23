import type { Upload } from "@repo/client/sessions/types";
import { REPORT_NOTE_MOST } from "@repo/config/media";
import { describe, expect, it } from "vitest";

import { m } from "@/paraglide/messages";

import { EMPTY_REPORT, holdsSomething, isGoingOf, reportSchema } from "./report-values";

// What the form of a report asks before it is sent, as the web's: decisions 067 and 076.

const upload = (key: string, state: Upload["state"]): Upload => ({
  key,
  name: `${key}.jpg`,
  purpose: "report",
  kind: "photo",
  type: "image/jpeg",
  preview: "",
  progress: state === "sent" ? 1 : 0.4,
  state,
  error: null,
  id: state === "sent" ? `medium-${key}` : null,
});

const uploadsOf = (...files: Upload[]) => new Map(files.map((file) => [file.key, file]));

/** What the schema says of the files, or nothing when it takes them. */
function faultOf(entries: string[], uploads: ReturnType<typeof uploadsOf>) {
  const checked = reportSchema(() => uploads).safeParse({ ...EMPTY_REPORT, entries });
  if (checked.success) return undefined;
  return checked.error.issues.find((issue) => issue.path[0] === "entries")?.message;
}

describe("the form of a report", () => {
  it("asks for a photo or a clip when none was chosen", () => {
    expect(faultOf([], uploadsOf())).toBe(m.report_media_missing());
  });

  it("asks for one that went up whole while every file still goes or failed", () => {
    const uploads = uploadsOf(upload("going", "sending"), upload("lost", "failed"));
    expect(faultOf(["going", "lost"], uploads)).toBe(m.report_media_missing());
  });

  it("takes a report once one file went up, the others still going", () => {
    const uploads = uploadsOf(upload("up", "sent"), upload("going", "sending"));
    expect(faultOf(["up", "going"], uploads)).toBeUndefined();
  });

  it("reads the files as they stand when it is sent", () => {
    let uploads = uploadsOf(upload("photo", "sending"));
    const schema = reportSchema(() => uploads);
    expect(schema.safeParse({ ...EMPTY_REPORT, entries: ["photo"] }).success).toBe(false);
    uploads = uploadsOf(upload("photo", "sent"));
    expect(schema.safeParse({ ...EMPTY_REPORT, entries: ["photo"] }).success).toBe(true);
  });

  it("refuses a note longer than the API takes", () => {
    const uploads = uploadsOf(upload("up", "sent"));
    const note = "a".repeat(REPORT_NOTE_MOST + 1);
    const checked = reportSchema(() => uploads).safeParse({
      ...EMPTY_REPORT,
      entries: ["up"],
      note,
    });
    expect(checked.success).toBe(false);
  });

  it("says a file is still going up while one of its own is", () => {
    const uploads = uploadsOf(upload("up", "sent"), upload("going", "sending"));
    expect(isGoingOf(["up", "going"], uploads)).toBe(true);
    expect(isGoingOf(["up"], uploads)).toBe(false);
    expect(isGoingOf(["elsewhere"], uploads)).toBe(false);
  });

  it("holds something once a file, a few words or a size is in it", () => {
    expect(holdsSomething(EMPTY_REPORT)).toBe(false);
    expect(holdsSomething({ ...EMPTY_REPORT, note: "   " })).toBe(false);
    expect(holdsSomething({ ...EMPTY_REPORT, note: "glassy" })).toBe(true);
    expect(holdsSomething({ ...EMPTY_REPORT, entries: ["photo"] })).toBe(true);
    expect(holdsSomething({ ...EMPTY_REPORT, sizes: { waves: "chest", sets: null } })).toBe(true);
  });
});
