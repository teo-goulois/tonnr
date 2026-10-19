import type * as Shared from "@repo/client/reports/types";

// What the screens of the reports read and ask for lives in packages/client, which the app for
// phones reads too: decision 067. A browser gives a file to be sent as a `File`.
export * from "@repo/client/reports/types";
export type Reporting = Shared.Reporting<File>;
