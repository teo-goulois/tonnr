// What the step that deletes an account reads of the API's refusal, and how it names the account
// that goes, on the web and on a phone alike, in the words each app gives: decision 071.

/** Why the API did not delete the account, as the step says it. */
export type DeletionRefusal = "password" | "session" | "many" | "operator" | "failed";

/** The words of the refusals, which each app gives from its messages. */
export type DeletionMessages = {
  delete_account_wrong_password: () => string;
  delete_account_stale: () => string;
  delete_account_many: () => string;
  delete_account_operator: () => string;
  delete_account_failed: () => string;
};

/** Why the API did not delete the account, as its refusal says. */
export function refusalOf(error: unknown): DeletionRefusal {
  const refused = error as { code?: string; data?: { refused?: string } } | null | undefined;
  if (refused?.code === "FORBIDDEN") {
    return refused.data?.refused === "session" ? "session" : "password";
  }
  if (refused?.code === "TOO_MANY_REQUESTS") return "many";
  if (refused?.code === "CONFLICT") return "operator";
  return "failed";
}

const REFUSALS: Record<DeletionRefusal, keyof DeletionMessages> = {
  password: "delete_account_wrong_password",
  session: "delete_account_stale",
  many: "delete_account_many",
  operator: "delete_account_operator",
  failed: "delete_account_failed",
};

/** A refusal in the reader's language. */
export const refusalWords = (refused: DeletionRefusal, messages: DeletionMessages) =>
  messages[REFUSALS[refused]]();

/** The account the step deletes, by the name others read, or its address before it has one. */
export function accountNamed(account: { username: string | null; email: string }) {
  return account.username ? `@${account.username}` : account.email;
}
