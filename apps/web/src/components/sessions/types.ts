import type * as Shared from "@repo/client/sessions/types";

// What the screens of the sessions read and ask for lives in packages/client, which the app for
// phones reads too: decision 043. A browser gives a file to be sent as a `File`.
export * from "@repo/client/sessions/types";
export type Sessioning = Shared.Sessioning<File>;
export type SessionMedia = Shared.SessionMedia<File>;
