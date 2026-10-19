import type { Guide, GuideLine } from "../viewer/types";

export type GuideLineName = GuideLine["line"];
export type GuideQuestion = Guide["answers"][number]["question"];

/**
 * What the guide of a break does for whoever reads it: the route gives it, with the guide. A
 * visitor is asked for an account, and an account with no username for one, before either
 * writes anything.
 */
export type Guiding = {
  signedIn: boolean;
  // True while a line, or what is said of a contribution, is on its way.
  isSending: boolean;
  // What was typed for a line and not sent, kept while the app is open: a panel that closes
  // does not lose it.
  draftOf: (line: GuideLineName) => string | undefined;
  onDraft: (line: GuideLineName, text: string | undefined) => void;
  // Asks for an account, and says why.
  onSignIn: (reason: string) => void;
  // Gives the account a username, and answers why it was refused or nothing once it is kept.
  onUsernameSave: (username: string) => Promise<string | undefined>;
  onPropose: (line: GuideLineName, value: string[] | string, done: () => void) => void;
  onWithdraw: (contributionId: string) => void;
  onConfirm: (contributionId: string) => void;
  onContest: (contributionId: string, reason: string, done: () => void) => void;
  onAnswer: (question: GuideQuestion, answer: string | null) => void;
  // Asks whether to block the author of a line, by its username: decision 071.
  onBlock: (username: string) => void;
};
