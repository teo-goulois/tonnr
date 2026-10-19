import type { AppRouterClient } from "@repo/api/routers/index";

import type { SurfSize, Upload } from "../sessions/types";
import type { Loadable, MediaStatus } from "../viewer/types";

type V1 = AppRouterClient["v1"];
type Answer<Procedure extends (...input: never[]) => unknown> = Awaited<ReturnType<Procedure>>;

/** A report of the waves at a break: decision 067. */
export type Report = Answer<V1["reports"]["list"]>["reports"][number];

/** Why a medium of a report is not shown. */
export type ReportReason = Report["reasons"][number];

/** Why an account says a report should not be shown. */
export const FLAG_REASONS = ["not_here", "not_now", "not_sea", "offensive", "other"] as const;
export type FlagReason = (typeof FLAG_REASONS)[number];

/** A report as its form holds it before it is sent. */
export type ReportDraft = {
  // The keys of the files being sent from the form, in their order.
  uploads: string[];
  waveSize: SurfSize | null;
  setSize: SurfSize | null;
  note: string;
};

/**
 * What the screens of the reports read and ask for, which the route answers. `Picked` is a file
 * as the device gives it to be sent: a `File` in a browser.
 */
export type Reporting<Picked> = {
  // The reports of the last week at the break whose panel is open, the latest first.
  here: Loadable<Report[]>;
  // Whether the instance takes reports: one that keeps no photo takes none. Undefined while it is
  // asked.
  offered: boolean | undefined;
  // Whether the instance takes photos now, for an account. Undefined for a visitor.
  status: MediaStatus | undefined;
  // The break the form is open at, or null while it is closed.
  open: { breakId: string; name: string } | null;
  onBegin: (place: { breakId: string; name: string }) => void;
  onClose: () => void;
  uploads: ReadonlyMap<string, Upload>;
  onStart: (files: Picked[]) => string[];
  onRetry: (key: string) => void;
  onDrop: (key: string) => void;
  isSending: boolean;
  // Sends a report: asks the phone where it stands first. Answers whether it was taken.
  onSend: (draft: ReportDraft) => Promise<boolean>;
  onDelete: (report: Report) => Promise<boolean>;
  onFlag: (report: Report, reason: FlagReason) => Promise<boolean>;
};
